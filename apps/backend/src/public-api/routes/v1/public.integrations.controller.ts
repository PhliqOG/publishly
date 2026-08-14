import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { ApiTags } from '@nestjs/swagger';
import { withOpenToken } from '@gitroom/helpers/auth/crypto.v2';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { ChangePostStatusDto } from '@gitroom/nestjs-libraries/dtos/posts/change.post.status.dto';
import { UpdatePostSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/update.post.settings.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { UploadDto } from '@gitroom/nestjs-libraries/dtos/media/upload.dto';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { GetNotificationsDto } from '@gitroom/nestjs-libraries/dtos/notifications/get.notifications.dto';
import * as Sentry from '@sentry/nestjs';
import {
  socialIntegrationList,
  IntegrationManager,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { serializeOAuthLoginState } from '@gitroom/nestjs-libraries/integrations/oauth.state';
import { Response } from 'express';
import { IdempotencyInProgressException } from '@gitroom/nestjs-libraries/database/prisma/posts/post-creation-idempotency.service';
import { tokenDaysRemaining } from '@gitroom/nestjs-libraries/reliability/connection.health.policy';
import { platformTruthResponse } from '@gitroom/nestjs-libraries/reliability/platform.truth';
import { FleetHealthService } from '@gitroom/nestjs-libraries/database/prisma/fleet-health/fleet-health.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { assertWebhookConnections } from '@gitroom/backend/public-api/public.distribution.policy';
import { ReliablePostCreationService } from '@gitroom/nestjs-libraries/database/prisma/posts/reliable-post-creation.service';

@ApiTags('Public API')
@Controller('/public/v1')
export class PublicIntegrationsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _reliablePostCreation: ReliablePostCreationService,
    private _fleetHealth: FleetHealthService,
    private _webhooks: WebhooksService
  ) {}

  @Post('/upload')
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (!file) {
      throw new HttpException({ msg: 'No file provided' }, 400);
    }

    return this._mediaService.uploadAndSave(org.id, file);
  }

  @Post('/upload-from-url')
  async uploadsFromUrl(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UploadDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.importFromUrl(org.id, body.url);
  }

  @Get('/find-slot/:id')
  async findSlotIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return { date: await this._postsService.findFreeDateTime(org.id, id) };
  }

  @Get('/posts')
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const posts = await this._postsService.getPosts(org.id, query);
    return {
      posts,
      // comments,
    };
  }

  @Get('/posts/:id/status')
  async getPublishingStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const job = await this._postsService.getPublishingJob(org.id, id);
    if (!job) {
      throw new NotFoundException({
        failureClass: 'data_problem',
        code: 'publishing_job_not_found',
        reason:
          'No publishing job exists for this post in the current workspace.',
      });
    }
    return job;
  }

  @Get('/posts/:id/receipts')
  async getDeliveryReceipts(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const job = await this._postsService.getPublishingJob(org.id, id);
    if (!job) {
      throw new NotFoundException({
        failureClass: 'data_problem',
        code: 'publishing_job_not_found',
        reason:
          'No publishing job exists for this post in the current workspace.',
      });
    }
    return {
      postId: id,
      latestStage: job.deliveryStage,
      receipts: await this._postsService.listDeliveryReceipts(org.id, id),
    };
  }

  @Post('/posts')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const allowedCreationMethods = ['CLI', 'API'] as const;
    const creationMethod = allowedCreationMethods.includes(
      rawBody.creationMethod
    )
      ? (rawBody.creationMethod as 'CLI' | 'API')
      : 'API';

    try {
      const result = await this._reliablePostCreation.create({
        organizationId: org.id,
        organizationCreatedAt: org.createdAt,
        idempotencyKey,
        rawBody,
        type: rawBody.type,
        creationMethod,
      });
      response.setHeader(
        'Idempotency-Replayed',
        result.replayed ? 'true' : 'false'
      );
      return result.value;
    } catch (error) {
      if (error instanceof IdempotencyInProgressException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Delete('/posts/:id')
  async deletePost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getPostById = await this._postsService.getPost(org.id, id);
    return this._postsService.deletePost(org.id, getPostById.group);
  }

  @Delete('/posts/group/:group')
  deletePostByGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.deletePost(org.id, group);
  }

  @Get('/is-connected')
  async getActiveIntegrations(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return { connected: true };
  }

  @Get('/groups')
  async listGroups(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return (await this._integrationService.customers(org.id)).map(
      (customer) => ({
        id: customer.id,
        name: customer.name,
      })
    );
  }

  @Get('/integrations')
  async listIntegration(
    @GetOrgFromRequest() org: Organization,
    @Query('group') group?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return (await this._integrationService.getIntegrationsList(org.id))
      .filter((integration) => !group || integration.customer?.id === group)
      .map((integration) => ({
        id: integration.id,
        name: integration.name,
        identifier: integration.providerIdentifier,
        picture: integration.picture,
        disabled: integration.disabled,
        profile: integration.profile,
        tokenExpiration: integration.tokenExpiration,
        tokenDaysRemaining: tokenDaysRemaining(integration.tokenExpiration),
        tokenHealthState: integration.tokenHealthState,
        tokenHealthReason: integration.tokenHealthReason,
        connectionHealthState: integration.connectionHealthState,
        connectionHealthReason: integration.connectionHealthReason,
        lastProviderContactAt: integration.lastProviderContactAt,
        lastSuccessfulPublishAt: integration.lastSuccessfulPublishAt,
        consecutiveErrors: integration.consecutiveErrors,
        staleSince: integration.staleSince,
        deadAccountAt: integration.deadAccountAt,
        platformTruth: platformTruthResponse(integration),
        customer: integration.customer
          ? {
              id: integration.customer.id,
              name: integration.customer.name,
            }
          : undefined,
      }));
  }

  @Get('/fleet-health')
  getFleetHealth(
    @GetOrgFromRequest() org: Organization,
    @Query('windowDays') windowDays?: string,
    @Query('groupId') groupId?: string,
    @Query('tagId') tagId?: string,
    @Query('color') color?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._fleetHealth.getFleetHealth(org.id, {
      windowDays,
      groupId,
      tagId,
      color,
    });
  }

  @Get('/webhooks')
  listWebhooks(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return this._webhooks.getWebhooks(org.id);
  }

  @Post('/webhooks')
  async createWebhook(
    @GetOrgFromRequest() org: Organization,
    @Body() body: WebhooksDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    await assertWebhookConnections(
      org.id,
      body.integrations,
      (organizationId, integrationId) =>
        this._integrationService.getIntegrationById(
          organizationId,
          integrationId
        )
    );
    return this._webhooks.createWebhook(org.id, body);
  }

  @Delete('/webhooks/:id')
  async deleteWebhook(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const deleted = await this._webhooks.deleteWebhook(org.id, id);
    if (!deleted) {
      throw new NotFoundException({
        code: 'webhook_not_found',
        reason: 'This webhook was not found in the current workspace.',
      });
    }
    return { deleted: true };
  }

  @Post('/webhooks/:id/rotate-secret')
  async rotateWebhookSecret(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const result = await this._webhooks.rotateSigningSecret(org.id, id);
    if (!result) {
      throw new NotFoundException({
        code: 'webhook_not_found',
        reason: 'This webhook was not found in the current workspace.',
      });
    }
    return result;
  }

  @Get('/social/:integration')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getIntegrationUrl(
    @Param('integration') integration: string,
    @Query('refresh') refresh: string,
    @GetOrgFromRequest() org: Organization
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (
      !this._integrationManager
        .getAllowedSocialsIntegrations()
        .includes(integration)
    ) {
      throw new HttpException({ msg: 'Integration not allowed' }, 400);
    }

    const integrationProvider =
      this._integrationManager.getSocialIntegration(integration);

    if (integrationProvider.externalUrl) {
      throw new HttpException(
        {
          msg: 'This integration requires an external URL and is not supported via the public API',
        },
        400
      );
    }

    try {
      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl();

      if (refresh) {
        await ioRedis.set(`refresh:${state}`, refresh, 'EX', 3600);
      }

      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(
        `login:${state}`,
        serializeOAuthLoginState(integration, codeVerifier),
        'EX',
        3600
      );

      return { url };
    } catch (err) {
      throw new HttpException({ msg: 'Failed to generate auth URL' }, 500);
    }
  }

  @Get('/notifications')
  async getNotifications(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetNotificationsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._notificationService.getNotificationsPaginated(
      org.id,
      query.page ?? 0
    );
  }

  @Post('/generate-video')
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: VideoDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.generateVideo(org, body);
  }

  @Post('/video/function')
  videoFunction(@Body() body: VideoFunctionDto) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.videoFunction(
      body.identifier,
      body.functionName,
      body.params
    );
  }

  @Delete('/integrations/:id')
  async deleteChannel(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const isTherePosts = await this._integrationService.getPostsForChannel(
      org.id,
      id
    );
    const deleted = await this._integrationService.deleteChannel(org.id, id);
    if (!deleted) {
      throw new NotFoundException({
        code: 'integration_not_found',
        reason: 'The integration was not found in this workspace.',
      });
    }
    const cleanupResults = await Promise.allSettled(
      isTherePosts.map((post) =>
        this._postsService.deletePost(org.id, post.group)
      )
    );
    const cleanupFailures = cleanupResults.filter(
      (result) => result.status === 'rejected'
    ).length;
    return {
      deleted: true,
      warnings: cleanupFailures
        ? [
            {
              code: 'scheduled_post_cleanup_failed',
              reason: `${cleanupFailures} scheduled post group(s) could not be removed immediately. The deleted connection cannot publish them; cleanup will be retried by normal retention processing.`,
            },
          ]
        : [],
    };
  }

  @Get('/integration-settings/:id')
  async getIntegrationSettings(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const loadIntegration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );

    if (!loadIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }

    const verified =
      JSON.parse(loadIntegration.additionalSettings || '[]')?.find(
        (p: any) => p?.title === 'Verified'
      )?.value || false;

    const integration = socialIntegrationList.find(
      (p) => p.identifier === loadIntegration.providerIdentifier
    )!;

    if (!integration) {
      return {
        output: { rules: '', maxLength: 0, settings: {}, tools: [] as any[] },
      };
    }

    const maxLength = integration.maxLength(verified);
    const schemas = !integration.dto
      ? false
      : getValidationSchemas()[integration.dto.name];
    const tools = this._integrationManager.getAllTools();
    const rules = this._integrationManager.getAllRulesDescription();

    return {
      output: {
        rules: rules[integration.identifier],
        maxLength,
        settings: !schemas ? 'No additional settings required' : schemas,
        tools: tools[integration.identifier],
      },
    };
  }

  @Get('/posts/:id/missing')
  async getMissingContent(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.getMissingContent(org.id, id);
  }

  @Put('/posts/:id/settings')
  async updatePostSettings(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdatePostSettingsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.updatePostSettings(
      org.id,
      id,
      body.settings,
      'API'
    );
  }

  @Put('/posts/:id/status')
  async changePostStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: ChangePostStatusDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.changePostStatus(org.id, id, body.status);
  }

  @Put('/posts/:id/release-id')
  async updateReleaseId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('releaseId') releaseId: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.updateReleaseId(org.id, id, releaseId);
  }

  @Get('/analytics/:integration')
  async getAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  @Get('/analytics/post/:postId')
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }

  @Post('/integration-trigger/:id')
  async triggerIntegrationTool(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { methodName: string; data: Record<string, string> }
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );

    if (!getIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }

    const integrationProvider = socialIntegrationList.find(
      (p) => p.identifier === getIntegration.providerIdentifier
    )!;

    if (!integrationProvider) {
      throw new HttpException({ msg: 'Integration provider not found' }, 404);
    }

    const tools = this._integrationManager.getAllTools();
    if (
      // @ts-ignore
      !tools[integrationProvider.identifier]?.some(
        (p: any) => p.methodName === body.methodName
      ) ||
      // @ts-ignore
      !integrationProvider[body.methodName]
    ) {
      throw new HttpException({ msg: 'Tool not found' }, 404);
    }

    while (true) {
      try {
        const openedIntegration = withOpenToken(getIntegration);
        // @ts-ignore
        const result = await integrationProvider[body.methodName](
          openedIntegration.token,
          body.data || {},
          getIntegration.internalId,
          openedIntegration
        );

        return { output: result };
      } catch (err) {
        if (err instanceof RefreshToken) {
          const data = await this._refreshIntegrationService.refresh(
            getIntegration
          );

          if (!data) {
            await this._integrationService.disconnectChannel(
              org.id,
              getIntegration
            );
            throw new HttpException(
              { msg: 'Channel disconnected due to expired token' },
              401
            );
          }

          const { accessToken } = data;

          if (accessToken) {
            getIntegration.token = accessToken;

            if (integrationProvider.refreshWait) {
              await timer(10000);
            }

            continue;
          }
        }
        throw new HttpException({ msg: 'Unexpected error' }, 500);
      }
    }
  }
}
