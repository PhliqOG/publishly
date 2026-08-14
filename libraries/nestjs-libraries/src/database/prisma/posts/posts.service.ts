import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { open as openSealed } from '@gitroom/helpers/auth/crypto.v2';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import dayjs from 'dayjs';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  Integration,
  Post,
  Media,
  From,
  CreationMethod,
  State,
  PublishingJobState,
  PublishingJob,
} from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import { shuffle } from 'lodash';
import { CreateGeneratedPostsDto } from '@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import utc from 'dayjs/plugin/utc';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import {
  minifyPostsList,
  minifyPosts,
} from '@gitroom/helpers/utils/posts.list.minify';
import axios from 'axios';
import sharp from 'sharp';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { Readable } from 'stream';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
dayjs.extend(utc);
import * as Sentry from '@sentry/nestjs';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { stripLinks } from '@gitroom/helpers/utils/strip.links';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { weightedLength } from '@gitroom/helpers/utils/count.length';
import { PublishingJobRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-job.repository';
import { PublishingFailureService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-failure.service';
import { PublishingReceiptService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-receipt.service';
import { PostConfirmationService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/post-confirmation.service';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import { computePublishingRetry } from '@gitroom/nestjs-libraries/reliability/post.retry.policy';
import { PlatformTruthService } from '@gitroom/nestjs-libraries/database/prisma/platform-truth/platform-truth.service';
import {
  PlatformPreflightIssue,
  validatePlatformTruthAtCompose,
} from '@gitroom/nestjs-libraries/reliability/platform.truth';
import { PostCalendarWriterService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/post-calendar-writer.service';
import { randomUUID as uuidv4 } from 'node:crypto';
import { parseOpaqueBulkPrivateMediaPath } from '@gitroom/helpers/bulk-scheduler/provider-media.contract';
import { ProviderMediaService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/provider-media.service';
import { PublishingAttemptService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-attempt.service';

type PostWithConditionals = Post & {
  integration?: Integration;
  childrenPost: Post[];
};

export type PostMaterializationHook = (input: {
  post: Post;
  publishingJob: PublishingJob;
  integrationId: string;
}) => Promise<void>;

export type InternalPostCreationOptions = {
  beforeWorkflowStart?: PostMaterializationHook;
  campaignReservation?: {
    campaignJobId: string;
    reservationId: string;
    claimTokenHash: string;
  };
};

@Injectable()
export class PostsService {
  private storage = UploadFactory.createStorage();
  private readonly logger = new Logger(PostsService.name);
  constructor(
    private _postRepository: PostsRepository,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _mediaService: MediaService,
    private _shortLinkService: ShortLinkService,
    private _openaiService: OpenaiService,
    private _temporalService: TemporalService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _publishingJobRepository: PublishingJobRepository,
    private _publishingFailureService: PublishingFailureService,
    private _publishingReceiptService: PublishingReceiptService,
    private _postConfirmationService: PostConfirmationService,
    private _platformTruth: PlatformTruthService,
    private _calendarWriter: PostCalendarWriterService,
    private _providerMedia: ProviderMediaService,
    private _publishingAttempts: PublishingAttemptService
  ) {}

  searchForMissingThreeHoursPosts() {
    return this._postRepository.searchForMissingThreeHoursPosts();
  }

  async updatePost(id: string, postId: string, releaseURL: string) {
    const post = await this._postRepository.getPostById(id);
    if (!post) {
      throw new Error(
        `Post ${id} was not found while confirming its platform delivery`
      );
    }

    await this._postConfirmationService.ensureConfirmed(
      post,
      postId,
      releaseURL
    );

    const updated = await this._postRepository.updatePost(
      id,
      postId,
      releaseURL
    );
    await this._publishingJobRepository.transition(id, 'PUBLISHED', {
      providerPostId: postId,
      providerUrl: releaseURL,
      error: null,
      failureCategory: null,
      failureClass: null,
      failureCode: null,
      failureReason: null,
    });
    await this._publishingAttempts.markPostPublished(
      post.organizationId,
      post.id
    );
    return updated;
  }

  recordDeliveryReceipt(
    input: Parameters<PublishingReceiptService['record']>[0]
  ) {
    return this._publishingReceiptService.record(input);
  }

  listDeliveryReceipts(organizationId: string, postId: string) {
    return this._publishingReceiptService.listForPost(organizationId, postId);
  }

  async getMissingContent(
    orgId: string,
    postId: string,
    forceRefresh = false
  ): Promise<{ id: string; url: string }[]> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || post.releaseId !== 'missing') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.missing) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    try {
      return await integrationProvider.missing(
        getIntegration.internalId,
        openSealed(getIntegration.token)
      );
    } catch (e) {
      console.log(e);
      if (e instanceof RefreshToken) {
        return this.getMissingContent(orgId, postId, true);
      }
    }

    return [];
  }

  async getPostById(postId: string, orgId: string) {
    return this._postRepository.getPostById(postId, orgId);
  }

  async updateReleaseId(orgId: string, postId: string, releaseId: string) {
    return this._postRepository.updateReleaseId(postId, orgId, releaseId);
  }

  async checkPostAnalytics(
    orgId: string,
    postId: string,
    date: number,
    forceRefresh = false
  ): Promise<AnalyticsData[] | { missing: true }> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId) {
      return [];
    }

    if (post.releaseId === 'missing') {
      return { missing: true };
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.postAnalytics) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    // const getIntegrationData = await ioRedis.get(
    //   `integration:${orgId}:${post.id}:${date}`
    // );
    // if (getIntegrationData) {
    //   return JSON.parse(getIntegrationData);
    // }

    try {
      const loadAnalytics = await integrationProvider.postAnalytics(
        getIntegration.internalId,
        openSealed(getIntegration.token),
        post.releaseId,
        date
      );
      await ioRedis.set(
        `integration:${orgId}:${post.id}:${date}`,
        JSON.stringify(loadAnalytics),
        'EX',
        !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? 1
          : 3600
      );
      return loadAnalytics;
    } catch (e) {
      console.log(e);
      if (e instanceof RefreshToken) {
        return this.checkPostAnalytics(orgId, postId, date, true);
      }
    }

    return [];
  }

  async getStatistics(orgId: string, id: string) {
    const getPost = await this.getPostsRecursively(id, true, orgId, true);
    const content = getPost.map((p) => p.content);
    const shortLinksTracking = await this._shortLinkService.getStatistics(
      content
    );

    return {
      clicks: shortLinksTracking,
    };
  }

  async mapTypeToPost(
    body: CreatePostDto,
    organization: string,
    replaceDraft: boolean = false
  ): Promise<CreatePostDto> {
    if (!body?.posts?.every((p) => p?.integration?.id)) {
      throw new BadRequestException('All posts must have an integration id');
    }

    const mappedValues = {
      ...body,
      type: replaceDraft ? 'schedule' : body?.type,
      posts: await Promise.all(
        body?.posts?.map(async (post) => {
          const integration = await this._integrationService.getIntegrationById(
            organization,
            post.integration.id
          );

          if (!integration) {
            throw new BadRequestException(
              `Integration with id ${post.integration.id} not found`
            );
          }

          return {
            type: replaceDraft ? 'schedule' : body?.type,
            ...post,
            settings: {
              ...(post.settings || ({} as any)),
              __type: integration.providerIdentifier,
            },
          };
        }) || []
      ),
    };

    const validationPipe = new ValidationPipe({
      skipMissingProperties: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });

    return await validationPipe.transform(mappedValues, {
      type: 'body',
      metatype: CreatePostDto,
    });
  }

  async getPostsRecursively(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ): Promise<PostWithConditionals[]> {
    const post = await this._postRepository.getPost(
      id,
      includeIntegration,
      orgId,
      isFirst
    );

    if (!post) {
      return [];
    }

    return [
      post!,
      ...(post?.childrenPost?.length
        ? await this.getPostsRecursively(
            post?.childrenPost?.[0]?.id,
            false,
            orgId,
            false
          )
        : []),
    ];
  }

  async getPosts(orgId: string, query: GetPostsDto) {
    return this._postRepository.getPosts(orgId, query);
  }

  async getPostsMinified(orgId: string, query: GetPostsDto) {
    return minifyPosts({
      posts: await this._postRepository.getPosts(orgId, query),
    });
  }

  async getPostsList(orgId: string, query: GetPostsListDto) {
    return minifyPostsList(
      await this._postRepository.getPostsList(orgId, query)
    );
  }

  async updateMedia(
    id: string,
    imagesList: any[],
    convertToJPEG = false,
    organizationId: string
  ) {
    try {
      let imageUpdateNeeded = false;
      const getImageList = await Promise.all(
        (
          await Promise.all(
            (imagesList || []).map(async (p: any) => {
              if (!p.path && p.id) {
                imageUpdateNeeded = true;
                return this._mediaService.getMediaById(organizationId, p.id);
              }

              return p;
            })
          )
        )
          .map((m) => {
            if (parseOpaqueBulkPrivateMediaPath(m?.path)) {
              return {
                ...m,
                url: m.path,
                type: 'video',
                path: m.path,
              };
            }
            return {
              ...m,
              url:
                m.path.indexOf('http') === -1
                  ? process.env.FRONTEND_URL +
                    '/' +
                    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                    m.path
                  : m.path,
              type: 'image',
              path:
                m.path.indexOf('http') === -1
                  ? process.env.UPLOAD_DIRECTORY + m.path
                  : m.path,
            };
          })
          .map(async (m) => {
            if (!convertToJPEG) {
              return m;
            }

            if (
              !hasExtension(m.path, 'mp4') &&
              !hasExtension(m.path, 'jpg') &&
              !hasExtension(m.path, 'jpeg')
            ) {
              imageUpdateNeeded = true;
              const response = await axios.get(m.url, {
                responseType: 'arraybuffer',
              });

              const imageBuffer = Buffer.from(response.data);

              // Use sharp to get the metadata of the image
              const buffer = await sharp(imageBuffer)
                .jpeg({ quality: 100 })
                .toBuffer();

              const { path, originalname } = await this.storage.uploadFile({
                buffer,
                mimetype: 'image/jpeg',
                size: buffer.length,
                path: '',
                fieldname: '',
                destination: '',
                stream: new Readable(),
                filename: '',
                originalname: '',
                encoding: '',
              });

              return {
                ...m,
                name: originalname,
                url:
                  path.indexOf('http') === -1
                    ? process.env.FRONTEND_URL +
                      '/' +
                      process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                      path
                    : path,
                type: 'image',
                path:
                  path.indexOf('http') === -1
                    ? process.env.UPLOAD_DIRECTORY + path
                    : path,
              };
            }

            return m;
          })
      );

      if (imageUpdateNeeded) {
        await this._postRepository.updateImages(
          id,
          JSON.stringify(getImageList)
        );
      }

      return getImageList;
    } catch (err: any) {
      return imagesList;
    }
  }

  hydratePublishingValue(
    organizationId: string,
    postId: string,
    value: unknown
  ) {
    return this._providerMedia.hydratePublishingValue({
      organizationId,
      postId,
      value,
    });
  }

  async getPostGroupDebugExport(orgId: string, group: string) {
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const errors = await this._postRepository.getErrorsByPostIds(
      loadAll.map((p) => p.id)
    );
    const posts = this.arrangePostsByGroup(loadAll, undefined);
    const rootPost = posts[0] as any;

    return {
      type: 'draft' as const,
      shortLink: false,
      date: rootPost.publishDate.toISOString(),
      tags:
        rootPost.tags?.map((t: any) => ({
          value: t.tag.id,
          label: t.tag.name,
        })) || [],
      posts: [
        {
          integration: { id: 'REPLACE_WITH_LOCAL_INTEGRATION_ID' },
          group: rootPost.group,
          settings: JSON.parse(rootPost.settings || '{}'),
          value: posts.map((post) => ({
            content: post.content,
            image: JSON.parse(post.image || '[]'),
            delay: post.delay || 0,
          })),
        },
      ],
      _debug: {
        providerIdentifier: rootPost.integration?.providerIdentifier,
        providerName: rootPost.integration?.name,
        state: rootPost.state,
        error: rootPost.error,
        errors: errors.map((e) => ({
          message: e.message,
          platform: e.platform,
          body: e.body,
          createdAt: e.createdAt,
        })),
        originalGroup: group,
        originalPublishDate: rootPost.publishDate,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  async getPostsByGroup(orgId: string, group: string) {
    const convertToJPEG = false;
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const posts = this.arrangePostsByGroup(loadAll, undefined);

    return {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...post,
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG,
            orgId
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };
  }

  arrangePostsByGroup(all: any, parent?: string): PostWithConditionals[] {
    const findAll = all
      .filter((p: any) =>
        !parent ? !p.parentPostId : p.parentPostId === parent
      )
      .map(({ integration, ...all }: any) => ({
        ...all,
        ...(!parent ? { integration } : {}),
      }));

    return [
      ...findAll,
      ...(findAll.length
        ? findAll.flatMap((p: any) => this.arrangePostsByGroup(all, p.id))
        : []),
    ];
  }

  async getPost(orgId: string, id: string, convertToJPEG = false) {
    const posts = await this.getPostsRecursively(id, true, orgId, true);
    const list = {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...post,
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG,
            orgId
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };

    return list;
  }

  async getOldPosts(orgId: string, date: string) {
    return this._postRepository.getOldPosts(orgId, date);
  }

  public async updateTags(orgId: string, post: Post[]): Promise<Post[]> {
    const plainText = JSON.stringify(post);
    const extract = Array.from(
      plainText.match(/\(post:[a-zA-Z0-9-_]+\)/g) || []
    );
    if (!extract.length) {
      return post;
    }

    const ids = (extract || []).map((e) =>
      e.replace('(post:', '').replace(')', '')
    );
    const urls = await this._postRepository.getPostUrls(orgId, ids);
    const newPlainText = ids.reduce((acc, value) => {
      const findUrl = urls?.find?.((u) => u.id === value)?.releaseURL || '';
      return acc.replace(
        new RegExp(`\\(post:${value}\\)`, 'g'),
        findUrl.split(',')[0]
      );
    }, plainText);

    return this.updateTags(orgId, JSON.parse(newPlainText) as Post[]);
  }

  public async checkInternalPlug(
    integration: Integration,
    orgId: string,
    id: string,
    settings: any
  ) {
    const plugs = Object.entries(settings).filter(([key]) => {
      return key.indexOf('plug-') > -1;
    });

    if (plugs.length === 0) {
      return [];
    }

    const parsePlugs = plugs.reduce((all, [key, value]) => {
      const [_, name, identifier] = key.split('--');
      all[name] = all[name] || { name };
      all[name][identifier] = value;
      return all;
    }, {} as any);

    const list: {
      name: string;
      integrations: { id: string }[];
      delay: string;
      active: boolean;
    }[] = Object.values(parsePlugs);

    return (list || []).flatMap((trigger) => {
      return (trigger?.integrations || []).flatMap((int) => ({
        type: 'internal-plug',
        post: id,
        originalIntegration: integration.id,
        integration: int.id,
        plugName: trigger.name,
        orgId: orgId,
        delay: +trigger.delay,
        information: trigger,
      }));
    });
  }

  public async checkPlugs(
    orgId: string,
    providerName: string,
    integrationId: string
  ) {
    const loadAllPlugs = this._integrationManager.getAllPlugs();
    const getPlugs = await this._integrationService.getPlugs(
      orgId,
      integrationId
    );

    const currentPlug = loadAllPlugs.find((p) => p.identifier === providerName);

    return getPlugs
      .filter((plug) => {
        return currentPlug?.plugs?.some(
          (p: any) => p.methodName === plug.plugFunction
        );
      })
      .map((plug) => {
        const runPlug = currentPlug?.plugs?.find(
          (p: any) => p.methodName === plug.plugFunction
        )!;
        return {
          type: 'global',
          plugId: plug.id,
          delay: runPlug.runEveryMilliseconds,
          totalRuns: runPlug.totalRuns,
        };
      });
  }

  async deletePost(orgId: string, group: string) {
    const post = await this._calendarWriter.cancelGroup({
      organizationId: orgId,
      group,
      actor: { actorType: 'user' },
    });

    if (post?.id) {
      try {
        const workflows = this._temporalService.client
          .getRawClient()
          ?.workflow.list({
            query: `postId="${post.id}" AND ExecutionStatus="Running"`,
          });

        for await (const executionInfo of workflows) {
          try {
            const workflow =
              await this._temporalService.client.getWorkflowHandle(
                executionInfo.workflowId
              );
            if (
              workflow &&
              (await workflow.describe()).status.name !== 'TERMINATED'
            ) {
              await workflow.terminate();
            }
          } catch (err) {
            this.logger.warn({
              event: 'post.workflow_termination_failed',
              postId: post.id,
              workflowId: executionInfo.workflowId,
              reason: normalizePostFailure({ error: err }).reason,
            });
          }
        }
      } catch (err) {
        this.logger.warn({
          event: 'post.workflow_lookup_failed_during_delete',
          postId: post.id,
          reason: normalizePostFailure({ error: err }).reason,
        });
      }
    }

    await this._publishingJobRepository.cancelGroup(orgId, group);
    return { error: true };
  }

  getPostByForWebhookId(id: string) {
    return this._postRepository.getPostByForWebhookId(id);
  }

  async startWorkflow(
    taskQueue: string,
    postId: string,
    orgId: string,
    state: State,
    jobStateOverride?: PublishingJobState,
    reuseExisting = false
  ) {
    const jobState: PublishingJobState =
      jobStateOverride || (state === 'DRAFT' ? 'DRAFT' : 'SCHEDULED');
    await this._publishingJobRepository.transition(postId, jobState, {
      error: null,
      failureCategory: null,
      failureClass: null,
      failureCode: null,
      failureReason: null,
      nextAttemptAt: null,
    });
    if (!reuseExisting) {
      try {
        const workflows = this._temporalService.client
          .getRawClient()
          ?.workflow.list({
            query: `postId="${postId}" AND ExecutionStatus="Running"`,
          });

        for await (const executionInfo of workflows) {
          try {
            const workflow =
              await this._temporalService.client.getWorkflowHandle(
                executionInfo.workflowId
              );
            if (
              workflow &&
              (await workflow.describe()).status.name !== 'TERMINATED'
            ) {
              await workflow.terminate();
            }
          } catch (err) {
            this.logger.warn({
              event: 'post.workflow_termination_failed',
              postId,
              workflowId: executionInfo.workflowId,
              reason: normalizePostFailure({ error: err }).reason,
            });
          }
        }
      } catch (err) {
        this.logger.warn({
          event: 'post.workflow_lookup_failed_before_start',
          postId,
          reason: normalizePostFailure({ error: err }).reason,
        });
      }
    }

    if (state === 'DRAFT') {
      return true;
    }

    try {
      const temporalClient = this._temporalService.client.getRawClient();
      if (!temporalClient) {
        throw new Error('The publishing queue client is unavailable.');
      }
      await temporalClient.workflow.start('postWorkflowV109', {
        workflowId: `post_${postId}`,
        taskQueue: 'main',
        workflowIdConflictPolicy: reuseExisting
          ? 'USE_EXISTING'
          : 'TERMINATE_EXISTING',
        ...(reuseExisting
          ? { workflowIdReusePolicy: 'REJECT_DUPLICATE' as const }
          : {}),
        args: [
          {
            taskQueue: taskQueue,
            postId: postId,
            organizationId: orgId,
          },
        ],
        typedSearchAttributes: new TypedSearchAttributes([
          {
            key: postIdSearchParam,
            value: postId,
          },
          {
            key: organizationId,
            value: orgId,
          },
        ]),
      });
      return true;
    } catch (err: any) {
      const job = await this._publishingJobRepository.getForPost(orgId, postId);
      const retryOrdinal =
        job?.failures.filter(
          (failure) => failure.failureCode === 'queue_unavailable'
        ).length || 0;
      const retry = computePublishingRetry({ postId, retryOrdinal });
      await this._publishingFailureService.record({
        organizationId: orgId,
        postId,
        state: 'RETRYING',
        error: err,
        code: 'queue_unavailable',
        nextAttemptAt: retry.nextAttemptAt,
        eventId: `post.failure:${postId}:queue-retry:${retryOrdinal + 1}`,
      });
      return false;
    }
  }

  async retryDuePublishingQueuesV108() {
    const due = await this._publishingJobRepository.listDueQueueRetries(
      new Date(),
      250
    );
    const output = [];
    for (const job of due) {
      output.push({
        postId: job.postId,
        started: await this.startWorkflow(
          job.provider,
          job.postId,
          job.organizationId,
          job.post.state,
          'QUEUED',
          true
        ),
      });
    }
    return output;
  }

  /**
   * Server-side validation that used to live on the client (`checkValidity` +
   * the manage modal loop). Runs the provider's settings DTO validation, the
   * provider `checkValidity` (media rules) and the empty-content / too-long
   * character checks. Returns one result per post so the frontend can show the
   * same toasts it did before — and so `/posts` can refuse to create invalid
   * posts.
   */
  async validatePosts(
    orgId: string,
    posts: Array<{
      integration: { id: string };
      value: Array<{
        content?: string;
        image?: Array<{ id?: string; path: string; thumbnail?: string }>;
      }>;
      settings?: any;
    }>
  ) {
    const mediaCache = new Map<
      string,
      ReturnType<MediaService['getMediaById']>
    >();
    const truthCache = new Map<
      string,
      ReturnType<PlatformTruthService['refreshIntegration']>
    >();

    return Promise.all(
      (posts || []).map(async (post) => {
        const integration = await this._integrationService.getIntegrationById(
          orgId,
          post?.integration?.id
        );

        if (!integration) {
          throw new BadRequestException(
            `Integration with id ${post?.integration?.id} not found`
          );
        }

        const provider = this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );

        let additionalSettings: any[] = [];
        try {
          additionalSettings = JSON.parse(
            integration.additionalSettings || '[]'
          );
        } catch {
          additionalSettings = [];
        }

        const settings = post.settings || {};
        const media = await Promise.all(
          (post.value || []).map(async (p) =>
            Promise.all(
              (p.image || []).map(async (item) => {
                if (!item.id) {
                  return { ...item, metadataVerified: false };
                }
                let lookup = mediaCache.get(item.id);
                if (!lookup) {
                  lookup = this._mediaService.getMediaById(orgId, item.id);
                  mediaCache.set(item.id, lookup);
                }
                const stored = await lookup;
                if (!stored || stored.path !== item.path) {
                  return { ...item, metadataVerified: false };
                }
                return {
                  ...item,
                  mimeType: stored.mimeType,
                  width: stored.width,
                  height: stored.height,
                  durationSeconds: stored.durationSeconds,
                  fileSize: stored.fileSize,
                  metadataStatus: stored.metadataStatus,
                  metadataVerified: stored.metadataStatus !== 'PENDING',
                };
              })
            )
          )
        );

        let truthLookup = truthCache.get(integration.id);
        if (!truthLookup) {
          truthLookup = this._platformTruth.refreshIntegration(integration);
          truthCache.set(integration.id, truthLookup);
        }
        const truth = await truthLookup;
        const preflightFailure = validatePlatformTruthAtCompose({
          provider: integration.providerIdentifier,
          truth: truth.snapshot,
          settings,
          media: media[0] || [],
        });

        // Settings DTO validation — mirrors the client `form.trigger()`.
        let valid = true;
        let settingsError = '';
        if (provider?.dto) {
          const instance = plainToInstance(provider.dto, settings, {
            enableImplicitConversion: false,
          });
          const validationErrors = await validate(instance as object, {
            skipMissingProperties: false,
          });
          settingsError = this.firstValidationError(validationErrors);
          valid = validationErrors.length === 0;
        }

        // Provider-specific media validation (the old client `checkValidity`).
        let errors: string | true = true;
        try {
          errors = await provider.checkValidity(
            media,
            settings,
            additionalSettings
          );
        } catch (err: any) {
          errors = normalizePostFailure({
            error: err,
            code: `${integration.providerIdentifier}_media_validation_failed`,
          }).reason;
        }
        if (preflightFailure) {
          errors = preflightFailure.reason;
        }

        const maximumCharacters = provider.maxLength(
          additionalSettings,
          settings
        );
        const isX = integration.providerIdentifier === 'x';

        const emptyContent = (post.value || []).some((a) => {
          const strip = stripHtmlValidation('normal', a.content || '', true);
          const length = isX ? weightedLength(strip) : strip.length;
          return length === 0 && (a.image || []).length === 0;
        });

        const tooLong = (post.value || []).some((a) => {
          const strip = stripHtmlValidation('normal', a.content || '', true);
          const weighted = isX ? weightedLength(strip) : strip.length;
          const totalCharacters =
            weighted > strip.length ? weighted : strip.length;
          return totalCharacters > (maximumCharacters || 1000000);
        });

        const dataIssue = (
          code: string,
          reason: string
        ): PlatformPreflightIssue => ({
          failureClass: 'data_problem',
          code,
          reason,
        });

        return {
          id: integration.id,
          identifier: integration.providerIdentifier,
          name: integration.name,
          valid,
          settingsError,
          settingsFailure: !valid
            ? dataIssue(
                `${integration.providerIdentifier}_settings_invalid`,
                settingsError || 'The platform settings are invalid.'
              )
            : null,
          errors,
          mediaFailure:
            errors !== true && !preflightFailure
              ? dataIssue(
                  `${integration.providerIdentifier}_media_invalid`,
                  String(errors || 'The platform media is invalid.')
                )
              : null,
          preflightFailure,
          emptyContent,
          emptyContentFailure: emptyContent
            ? dataIssue(
                'empty_post',
                'Your post should have at least one character or one image.'
              )
            : null,
          tooLong,
          tooLongFailure: tooLong
            ? dataIssue(
                `${integration.providerIdentifier}_caption_too_long`,
                'The post exceeds this platform character limit.'
              )
            : null,
          maximumCharacters,
          platformTruth: truth.response,
        };
      })
    );
  }

  /** Returns the first class-validator message (incl. nested children), or ''. */
  private firstValidationError(errors: any[]): string {
    for (const e of errors || []) {
      if (e?.constraints) {
        return Object.values(e.constraints as Record<string, string>)[0] || '';
      }
      const child = e?.children?.length
        ? this.firstValidationError(e.children)
        : '';
      if (child) {
        return child;
      }
    }
    return '';
  }

  // A schedule-type save targeting an already-PUBLISHED post republishes it to
  // the platform: require the explicit `republish` opt-in instead. The message
  // doubles as the confirmation dialog for API/MCP automation.
  private guardAgainstRepublish(
    post: {
      state: State;
      publishDate: Date;
      integration?: { providerIdentifier: string };
    } | null,
    source: 'createPost' | 'changeDate'
  ) {
    if (post?.state !== 'PUBLISHED') {
      return;
    }

    const howToUpdate =
      source === 'createPost' ? `use type 'update'` : `use action 'update'`;

    throw new BadRequestException(
      `This post was already published on ${dayjs
        .utc(post.publishDate)
        .format(
          'YYYY-MM-DD HH:mm'
        )} UTC. Saving it this way would publish it again to ${
        post.integration?.providerIdentifier || 'the channel'
      }. To edit without republishing, ${howToUpdate}. To intentionally publish again, pass republish: true.`
    );
  }

  async createPost(
    orgId: string,
    body: CreatePostDto,
    creationMethod: CreationMethod,
    keepGroup = false,
    idempotentCreate = false,
    internal?: InternalPostCreationOptions
  ): Promise<any[]> {
    const postList = [];
    const effectiveDate =
      body.type === 'now' ? dayjs().format('YYYY-MM-DDTHH:mm:00') : body.date;
    const scheduledAt = dayjs(effectiveDate).toDate();
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'calendar_scheduled_at_invalid',
        reason: 'The requested post date is not a valid calendar instant.',
      });
    }
    for (const post of body.posts) {
      // A reservation must be able to own the exact future root Post before
      // materialization. Allocate every missing chain ID once and reuse it on
      // retries; the root ID is the calendar owner identity.
      post.value = (post.value || []).map((value) => ({
        ...value,
        id: value.id || uuidv4(),
      }));
      const idempotentTargetGroup = (post as any).__publishlyTargetGroup as
        | string
        | undefined;
      const idempotentRootId = post.value?.[0]?.id;
      if (idempotentCreate && idempotentTargetGroup && idempotentRootId) {
        const existing = await this._postRepository.getPostById(
          idempotentRootId,
          orgId
        );
        if (existing?.group === idempotentTargetGroup) {
          const existingJob = await this._publishingJobRepository.getForPost(
            orgId,
            idempotentRootId
          );
          if (existingJob) {
            await this._calendarWriter.ensurePost({
              organizationId: orgId,
              integrationId: existing.integrationId,
              postId: existing.id,
              scheduledAt: existing.publishDate,
              localIntent: body.scheduleIntent,
              creationMethod,
              source: 'post_create_idempotency_repair',
              operationKey: body.order,
            });
            // A prior execution of this same creation intent crossed the DB
            // boundary. Never rewrite its Post/job state. If the workflow had
            // not started yet, USE_EXISTING + REJECT_DUPLICATE safely fills the
            // gap; otherwise the stable workflow identity is left untouched.
            if (
              body.type !== 'draft' &&
              body.type !== 'update' &&
              ['SCHEDULED', 'QUEUED'].includes(existingJob.state)
            ) {
              if (internal?.beforeWorkflowStart) {
                await internal.beforeWorkflowStart({
                  post: existing,
                  publishingJob: existingJob,
                  integrationId: existing.integrationId,
                });
              }
              await this.startWorkflow(
                existing.integration.providerIdentifier
                  .split('-')[0]
                  .toLowerCase(),
                existing.id,
                orgId,
                existing.state,
                existingJob.state,
                true
              );
            }
            postList.push({
              postId: existing.id,
              integration: existing.integrationId,
            });
            continue;
          }
        }
      }

      if (
        (body.type === 'schedule' || body.type === 'now') &&
        !body.republish &&
        post.value?.[0]?.id
      ) {
        this.guardAgainstRepublish(
          await this._postRepository.getPostById(post.value[0].id, orgId),
          'createPost'
        );
      }
      const provider = this._integrationManager.getSocialIntegration(
        (post.settings as any)?.__type
      );
      const removeLinks = !!provider?.stripLinks?.();

      const messages = (post.value || []).map((p) => p.content);
      // No point shortlinking links on platforms that strip them out anyway
      const updateContent =
        !body.shortLink || removeLinks
          ? messages
          : await this._shortLinkService.convertTextToShortLinks(
              orgId,
              messages
            );

      post.value = (post.value || []).map((p, i) => ({
        ...p,
        content: removeLinks ? stripLinks(updateContent[i]) : updateContent[i],
      }));

      const existingRoot = await this._postRepository.getPostById(
        post.value[0].id,
        orgId
      );
      const calendarInput = {
        organizationId: orgId,
        integrationId: post.integration.id,
        postId: post.value[0].id,
        scheduledAt,
        localIntent: body.scheduleIntent,
        creationMethod,
        source: existingRoot ? 'post_edit' : 'post_create',
        operationKey: body.order,
        actor: {
          actorType:
            creationMethod === 'WEB'
              ? ('user' as const)
              : creationMethod === 'API' ||
                creationMethod === 'CLI' ||
                creationMethod === 'MCP'
              ? ('apikey' as const)
              : ('system' as const),
        },
      };
      const prepared = existingRoot
        ? undefined
        : internal?.campaignReservation
        ? await this._calendarWriter.prepareCampaignHandoff({
            ...calendarInput,
            ...internal.campaignReservation,
          })
        : await this._calendarWriter.prepareCreate(calendarInput);
      if (existingRoot) {
        if (existingRoot.publishDate.getTime() !== scheduledAt.getTime()) {
          await this._calendarWriter.reschedule({
            ...calendarInput,
            action: 'update',
            allowPinnedMove: !!body.republish || body.type === 'update',
          });
        } else {
          await this._calendarWriter.ensurePost(calendarInput);
        }
      }
      let posts: Post[];
      try {
        ({ posts } = await this._postRepository.createOrUpdatePost(
          body.type,
          orgId,
          effectiveDate,
          post,
          body.tags,
          creationMethod,
          body.inter,
          keepGroup,
          idempotentCreate
        ));
      } catch (error) {
        if (prepared) {
          await this._calendarWriter.abortUnmaterialized(
            prepared,
            normalizePostFailure({ error }).reason
          );
        }
        throw error;
      }

      if (!posts?.length) {
        if (prepared) {
          await this._calendarWriter.abortUnmaterialized(
            prepared,
            'The post repository returned no materialized post.'
          );
        }
        return [] as any[];
      }

      // Dispatch cannot start until the ledger is durably synchronized.
      if (prepared) {
        await this._calendarWriter.finalizeCreate(prepared);
      }

      if (body.type !== 'update') {
        const initialJobState: PublishingJobState =
          body.type === 'draft'
            ? 'DRAFT'
            : body.type === 'now'
            ? 'QUEUED'
            : 'SCHEDULED';
        const publishingJob = await this._publishingJobRepository.ensure(
          orgId,
          posts[0].id,
          post.settings.__type.split('-')[0].toLowerCase(),
          initialJobState,
          post.integration.id
        );
        if (internal?.beforeWorkflowStart) {
          await internal.beforeWorkflowStart({
            post: posts[0],
            publishingJob,
            integrationId: post.integration.id,
          });
        }
        await this.startWorkflow(
          post.settings.__type.split('-')[0].toLowerCase(),
          posts[0].id,
          orgId,
          posts[0].state,
          initialJobState,
          idempotentCreate
        );
      }

      Sentry.metrics.count('post_created', 1);
      postList.push({
        postId: posts[0].id,
        integration: post.integration.id,
      });
    }

    return postList;
  }

  // Update ONLY the provider settings of a not-yet-published post (scheduled or
  // draft). The passed keys are merged into the existing settings; content and
  // publish date stay as they are, so the running publish workflow is left
  // untouched (type "update"). Shared by the agent/MCP tool and the public API
  // PUT /posts/:id/settings so both go through one path.
  async updatePostSettings(
    orgId: string,
    postId: string,
    settings: Record<string, any>,
    creationMethod: CreationMethod
  ): Promise<{ postId: string; publishDate: string }> {
    // Ordered as post -> comments, root includes integration and tags.
    const ordered = await this.getPostsRecursively(postId, true, orgId, true);

    const [root] = ordered;
    if (!root) {
      throw new NotFoundException('Post not found');
    }

    if (root.parentPostId) {
      throw new BadRequestException(
        'This id belongs to a comment, pass the id of the main post'
      );
    }

    if (root.state !== 'QUEUE' && root.state !== 'DRAFT') {
      throw new BadRequestException(
        'Only scheduled posts that were not published yet (or drafts) can be updated'
      );
    }

    if (
      root.state === 'QUEUE' &&
      dayjs.utc(root.publishDate).isBefore(dayjs.utc())
    ) {
      throw new BadRequestException(
        'The publish time of this post already passed, it cannot be updated'
      );
    }

    const integration = (root as any).integration;

    let existingSettings: Record<string, any>;
    try {
      existingSettings = JSON.parse(root.settings || '{}');
    } catch (err) {
      throw new BadRequestException(
        'The stored platform settings are invalid and must be corrected before this post can be updated.'
      );
    }

    // Merge: only the passed keys change, everything else stays.
    const mergedSettings = {
      ...existingSettings,
      ...(settings || {}),
      __type: integration.providerIdentifier,
    };

    // Keep the existing content/ids so the posts are updated in place (the
    // workflow identity is preserved) - only the settings differ.
    const value = ordered.map((p) => {
      let image = [];
      try {
        image = JSON.parse(p.image || '[]');
      } catch (err) {
        throw new BadRequestException(
          `The stored media list for post ${p.id} is invalid and must be corrected before publishing.`
        );
      }
      return {
        id: p.id,
        content: p.content,
        delay: p.delay || 0,
        image,
      };
    });

    // Same server-side validation as the dashboard / public create route.
    const [validation] = await this.validatePosts(orgId, [
      {
        integration: { id: integration.id },
        settings: mergedSettings,
        value: value.map((p) => ({ content: p.content, image: p.image })),
      },
    ]);

    if (validation.emptyContent) {
      throw new BadRequestException(
        `${validation.name}: Your post should have at least one character or one image.`
      );
    }

    if (root.state !== 'DRAFT') {
      if (!validation.valid) {
        throw new BadRequestException(
          `${validation.name}: ${
            validation.settingsError || 'Please fix your settings'
          }`
        );
      }

      if (validation.errors !== true) {
        throw new BadRequestException(
          `${validation.name}: ${validation.errors}`
        );
      }

      if (validation.tooLong) {
        throw new BadRequestException(
          `${validation.name}: The maximum characters is ${validation.maximumCharacters}`
        );
      }
    }

    const date = dayjs.utc(root.publishDate).format('YYYY-MM-DDTHH:mm:ss');

    const [output] = await this.createPost(
      orgId,
      {
        date,
        // Settings-only update: keep the current state and leave the running
        // publish workflow alone.
        type: 'update',
        shortLink: false,
        tags: ((root as any).tags || []).map((t: any) => ({
          value: t.tag.name,
          label: t.tag.name,
        })),
        posts: [
          {
            integration,
            group: root.group,
            settings: mergedSettings,
            value,
          },
        ],
      } as any,
      creationMethod,
      // Keep the group stable: a client may have the calendar open while the
      // settings are updated out of band, and the calendar links posts by group.
      true
    );

    if (!output) {
      throw new BadRequestException('Failed to update the post');
    }

    return {
      postId: output.postId,
      publishDate: date,
    };
  }

  async separatePosts(content: string, len: number) {
    return this._openaiService.separatePosts(content, len);
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const normalizedFailure =
      state === 'ERROR' ? normalizePostFailure({ error: err }) : undefined;
    const changed = await this._postRepository.changeState(
      id,
      state,
      normalizedFailure?.reason ?? err,
      body
    );
    const jobState: PublishingJobState =
      state === 'DRAFT'
        ? 'DRAFT'
        : state === 'QUEUE'
        ? 'SCHEDULED'
        : state === 'PUBLISHED'
        ? 'PUBLISHED'
        : 'FAILED';
    if (jobState === 'FAILED') {
      await this._publishingFailureService.record({
        organizationId: changed.organizationId,
        postId: id,
        state: 'FAILED',
        error: err,
        reason: normalizedFailure?.reason,
        code: normalizedFailure?.code,
      });
    } else {
      await this._publishingJobRepository.transition(id, jobState, {
        error: null,
        failureCategory: null,
        failureClass: null,
        failureCode: null,
        failureReason: null,
      });
    }
    return changed;
  }

  async transitionPublishingJob(
    postId: string,
    state: PublishingJobState,
    error?: string,
    failureCategory?: string,
    retryInSeconds?: number
  ) {
    const nextAttemptAt =
      retryInSeconds !== undefined
        ? dayjs().add(Math.max(1, retryInSeconds), 'second').toDate()
        : undefined;

    if (state === 'RETRYING' || state === 'FAILED') {
      const context =
        (await this._publishingJobRepository.getContext(postId)) ||
        (await this._publishingJobRepository.getLegacyPostContext(postId));
      if (!context) {
        throw new Error(
          `Post ${postId} was not found while transitioning its publishing job to ${state}`
        );
      }
      return this._publishingFailureService.record({
        organizationId: context.organizationId,
        postId,
        state,
        error,
        legacyCategory: failureCategory,
        willRetry: state === 'RETRYING',
        mutationMayHaveSucceeded: failureCategory === 'outcome_unknown',
        nextAttemptAt,
      });
    }

    if (state === 'QUEUED') {
      const context =
        (await this._publishingJobRepository.getContext(postId)) ||
        (await this._publishingJobRepository.getLegacyPostContext(postId));
      if (!context) {
        throw new Error(
          `Post ${postId} was not found while recording its queued receipt`
        );
      }
      return this._publishingReceiptService.record({
        organizationId: context.organizationId,
        postId,
        stage: 'queued',
      });
    }

    if (state === 'PROCESSING') {
      const context =
        (await this._publishingJobRepository.getContext(postId)) ||
        (await this._publishingJobRepository.getLegacyPostContext(postId));
      if (!context) {
        throw new Error(
          `Post ${postId} was not found while recording its uploading receipt`
        );
      }
      return this._publishingReceiptService.record({
        organizationId: context.organizationId,
        postId,
        stage: 'uploading',
      });
    }

    return this._publishingJobRepository.transition(postId, state, {
      ...(error !== undefined ? { error } : {}),
      ...(failureCategory !== undefined ? { failureCategory } : {}),
      ...(nextAttemptAt !== undefined ? { nextAttemptAt } : {}),
      incrementAttempt: false,
    });
  }

  getPublishingJob(organizationId: string, postId: string) {
    return this._publishingJobRepository.getForPost(organizationId, postId);
  }

  async ensureClassifiedPublishingOutcomeV107(
    organizationId: string,
    postId: string,
    workflowError?: { message?: string; type?: string }
  ) {
    const job = await this._publishingJobRepository.getForPost(
      organizationId,
      postId
    );

    if (
      job?.deliveryStage === 'confirmed_live' &&
      job.post.state !== 'PUBLISHED' &&
      job.providerPostId &&
      job.providerUrl
    ) {
      await this.updatePost(postId, job.providerPostId, job.providerUrl);
      return;
    }

    if (job?.post.state === 'PUBLISHED' && job.state !== 'PUBLISHED') {
      await this._publishingJobRepository.transition(postId, 'PUBLISHED', {
        error: null,
        failureCategory: null,
        failureClass: null,
        failureCode: null,
        failureReason: null,
      });
      return;
    }

    if (job?.state === 'PUBLISHED' || job?.state === 'CANCELLED') {
      return;
    }

    if (
      (job?.state === 'FAILED' || job?.state === 'RETRYING') &&
      job.failureClass &&
      job.failureCode &&
      job.failureReason &&
      job.failures.length > 0
    ) {
      return;
    }

    const mutationMayHaveSucceeded = job?.state === 'PROCESSING';
    await this._publishingFailureService.record({
      organizationId,
      postId,
      state: 'FAILED',
      error: workflowError,
      reason: workflowError?.message,
      code: mutationMayHaveSucceeded ? 'outcome_unknown' : 'internal_error',
      mutationMayHaveSucceeded,
    });
  }

  listPublishingJobs(
    organizationId: string,
    state?: PublishingJobState,
    cursor?: string,
    take?: number
  ) {
    return this._publishingJobRepository.list(
      organizationId,
      state,
      cursor,
      take
    );
  }

  async changePostStatus(
    orgId: string,
    id: string,
    status: 'draft' | 'schedule'
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);
    if (!getPostById) {
      throw new BadRequestException('Post not found');
    }

    const state: State = status === 'draft' ? 'DRAFT' : 'QUEUE';
    await this._postRepository.changeState(id, state);
    await this._publishingJobRepository.ensure(
      orgId,
      id,
      getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(),
      state === 'DRAFT' ? 'DRAFT' : 'SCHEDULED',
      getPostById.integrationId
    );

    await this.startWorkflow(
      getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(),
      getPostById.id,
      orgId,
      state
    );

    return { id, state };
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    action: 'schedule' | 'update' = 'schedule',
    republish = false,
    scheduleIntent?: CreatePostDto['scheduleIntent'],
    operationKey?: string
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);
    if (!getPostById) {
      throw new NotFoundException({
        failureClass: 'data_problem',
        code: 'calendar_post_not_found',
        reason: 'The post does not exist in this workspace.',
      });
    }

    if (action === 'schedule' && !republish) {
      this.guardAgainstRepublish(getPostById, 'changeDate');
    }

    // schedule: Set status to QUEUE and change date (reschedule the post)
    // update: Just change the date without changing the status
    const scheduledAt = dayjs(date).toDate();
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'calendar_scheduled_at_invalid',
        reason: 'The requested post date is not a valid calendar instant.',
      });
    }
    const newDate = await this._calendarWriter.reschedule({
      organizationId: orgId,
      integrationId: getPostById.integrationId,
      postId: id,
      scheduledAt,
      localIntent: scheduleIntent,
      creationMethod: getPostById.creationMethod,
      source: 'post_change_date',
      operationKey,
      actor: { actorType: 'user' },
      action,
      allowPinnedMove: republish || action === 'update',
    });

    if (action === 'schedule') {
      await this._publishingJobRepository.ensure(
        orgId,
        id,
        getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(),
        'SCHEDULED',
        getPostById.integrationId
      );
      await this.startWorkflow(
        getPostById.integration.providerIdentifier.split('-')[0].toLowerCase(),
        getPostById.id,
        orgId,
        getPostById.state === 'DRAFT' ? 'DRAFT' : 'QUEUE'
      );
    }

    return newDate;
  }

  async generatePostsDraft(orgId: string, body: CreateGeneratedPostsDto) {
    const getAllIntegrations = (
      await this._integrationService.getIntegrationsList(orgId)
    ).filter((f) => !f.disabled && f.providerIdentifier !== 'reddit');

    // const posts = chunk(body.posts, getAllIntegrations.length);
    const allDates = dayjs()
      .isoWeek(body.week)
      .year(body.year)
      .startOf('isoWeek');

    const dates = [...new Array(7)].map((_, i) => {
      return allDates.add(i, 'day').format('YYYY-MM-DD');
    });

    const findTime = (): string => {
      const totalMinutes = Math.floor(Math.random() * 144) * 10;

      // Convert total minutes to hours and minutes
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      // Format hours and minutes to always be two digits
      const formattedHours = hours.toString().padStart(2, '0');
      const formattedMinutes = minutes.toString().padStart(2, '0');
      const randomDate =
        shuffle(dates)[0] + 'T' + `${formattedHours}:${formattedMinutes}:00`;

      if (dayjs(randomDate).isBefore(dayjs())) {
        return findTime();
      }

      return randomDate;
    };

    for (const integration of getAllIntegrations) {
      for (const toPost of body.posts) {
        const group = makeId(10);
        const randomDate = findTime();

        await this.createPost(
          orgId,
          {
            type: 'draft',
            date: randomDate,
            order: '',
            shortLink: false,
            tags: [],
            posts: [
              {
                group,
                integration: {
                  id: integration.id,
                },
                settings: {
                  __type: integration.providerIdentifier as any,
                  title: '',
                  tags: [],
                  subreddit: [],
                },
                value: [
                  ...toPost.list.map((l) => ({
                    id: '',
                    content: l.post,
                    delay: 0,
                    image: [],
                  })),
                  {
                    id: '',
                    delay: 0,
                    content: `Check out the full story here:\n${
                      body.postId || body.url
                    }`,
                    image: [],
                  },
                ],
              },
            ],
          },
          'WEB'
        );
      }
    }
  }

  findAllExistingCategories() {
    return this._postRepository.findAllExistingCategories();
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._postRepository.findAllExistingTopicsOfCategory(category);
  }

  findPopularPosts(category: string, topic?: string) {
    return this._postRepository.findPopularPosts(category, topic);
  }

  async findFreeDateTime(orgId: string, integrationId?: string) {
    const findTimes = await this._integrationService.findFreeDateTime(
      orgId,
      integrationId
    );
    return this.findFreeDateTimeRecursive(
      orgId,
      findTimes,
      dayjs.utc().startOf('day')
    );
  }

  async createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._postRepository.createPopularPosts(post);
  }

  private async findFreeDateTimeRecursive(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs
  ): Promise<string> {
    const list = await this._postRepository.getPostsCountsByDates(
      orgId,
      times,
      date
    );

    if (!list.length) {
      return this.findFreeDateTimeRecursive(orgId, times, date.add(1, 'day'));
    }

    const num = list.reduce<null | number>((prev, curr) => {
      if (prev === null || prev > curr) {
        return curr;
      }
      return prev;
    }, null) as number;

    return date.clone().add(num, 'minutes').format('YYYY-MM-DDTHH:mm:00');
  }

  getComments(postId: string) {
    return this._postRepository.getComments(postId);
  }

  getTags(orgId: string) {
    return this._postRepository.getTags(orgId);
  }

  createTag(orgId: string, body: CreateTagDto) {
    return this._postRepository.createTag(orgId, body);
  }

  editTag(id: string, orgId: string, body: CreateTagDto) {
    return this._postRepository.editTag(id, orgId, body);
  }

  deleteTag(id: string, orgId: string) {
    return this._postRepository.deleteTag(id, orgId);
  }

  createComment(
    orgId: string,
    userId: string,
    postId: string,
    comment: string
  ) {
    return this._postRepository.createComment(orgId, userId, postId, comment);
  }
}
