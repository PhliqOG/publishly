import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization, PublishingJobState, User } from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { ApiTags } from '@nestjs/swagger';
import { GeneratorDto } from '@gitroom/nestjs-libraries/dtos/generator/generator.dto';
import { CreateGeneratedPostsDto } from '@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto';
import { AgentGraphService } from '@gitroom/nestjs-libraries/agent/agent.graph.service';
import { Response } from 'express';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { PostValidationException } from '@gitroom/backend/api/routes/posts.validation.exception';
import {
  IdempotencyInProgressException,
  PostCreationIdempotencyService,
} from '@gitroom/nestjs-libraries/database/prisma/posts/post-creation-idempotency.service';
import { FleetDistributionService } from '@gitroom/nestjs-libraries/database/prisma/fleet-distribution/fleet-distribution.service';
import { CalendarScheduleIntentDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

@ApiTags('Posts')
@Controller('/posts')
export class PostsController {
  constructor(
    private _postsService: PostsService,
    private _agentGraphService: AgentGraphService,
    private _shortLinkService: ShortLinkService,
    private _postCreationIdempotency: PostCreationIdempotencyService,
    private _fleetDistribution: FleetDistributionService
  ) {}

  @Get('/:id/statistics')
  async getStatistics(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postsService.getStatistics(org.id, id);
  }

  @Get('/:id/missing')
  async getMissingContent(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postsService.getMissingContent(org.id, id);
  }

  @Put('/:id/release-id')
  async updateReleaseId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('releaseId') releaseId: string
  ) {
    return this._postsService.updateReleaseId(org.id, id, releaseId);
  }

  @Post('/should-shortlink')
  async shouldShortlink(@Body() body: { messages: string[] }) {
    return { ask: this._shortLinkService.askShortLinkedin(body.messages) };
  }

  @Get('/publishing-jobs')
  publishingJobs(
    @GetOrgFromRequest() org: Organization,
    @Query('state') state?: PublishingJobState,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string
  ) {
    const allowed = new Set<PublishingJobState>([
      'DRAFT',
      'SCHEDULED',
      'QUEUED',
      'PROCESSING',
      'PUBLISHED',
      'PARTIAL_SUCCESS',
      'RETRYING',
      'FAILED',
      'CANCELLED',
    ]);
    if (state && !allowed.has(state)) {
      throw new HttpException('Invalid publishing job state', 400);
    }
    return this._postsService.listPublishingJobs(
      org.id,
      state,
      cursor,
      Math.min(100, Math.max(1, parseInt(take || '50', 10) || 50))
    );
  }

  @Get('/:id/publishing-job')
  async publishingJob(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const job = await this._postsService.getPublishingJob(org.id, id);
    if (!job) throw new HttpException('Publishing job not found', 404);
    return job;
  }

  @Get('/:id/receipts')
  async deliveryReceipts(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const job = await this._postsService.getPublishingJob(org.id, id);
    if (!job) throw new HttpException('Publishing job not found', 404);
    return {
      postId: id,
      latestStage: job.deliveryStage,
      receipts: await this._postsService.listDeliveryReceipts(org.id, id),
    };
  }

  @Post('/:id/comments')
  async createComment(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: { comment: string }
  ) {
    return this._postsService.createComment(org.id, user.id, id, body.comment);
  }

  @Get('/tags')
  async getTags(@GetOrgFromRequest() org: Organization) {
    return { tags: await this._postsService.getTags(org.id) };
  }

  @Post('/tags')
  async createTag(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateTagDto
  ) {
    return this._postsService.createTag(org.id, body);
  }

  @Put('/tags/:id')
  async editTag(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateTagDto,
    @Param('id') id: string
  ) {
    return this._postsService.editTag(id, org.id, body);
  }

  @Delete('/tags/:id')
  async deleteTag(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._postsService.deleteTag(id, org.id);
  }

  @Get('/')
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsDto
  ) {
    return this._postsService.getPostsMinified(org.id, query);
  }

  @Get('/find-slot')
  async findSlot(@GetOrgFromRequest() org: Organization) {
    return { date: await this._postsService.findFreeDateTime(org.id) };
  }

  @Get('/find-slot/:id')
  async findSlotIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id?: string
  ) {
    return { date: await this._postsService.findFreeDateTime(org.id, id) };
  }

  @Get('/list')
  async getPostsList(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsListDto
  ) {
    return this._postsService.getPostsList(org.id, query);
  }

  @Get('/old')
  oldPosts(
    @GetOrgFromRequest() org: Organization,
    @Query('date') date: string
  ) {
    return this._postsService.getOldPosts(org.id, date);
  }

  @Get('/group/:group/debug-export')
  async getPostGroupDebugExport(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('group') group: string
  ) {
    if (!user.isSuperAdmin) {
      throw new HttpException('Forbidden', 403);
    }
    return this._postsService.getPostGroupDebugExport(org.id, group);
  }

  @Get('/group/:group')
  getPostsByGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    return this._postsService.getPostsByGroup(org.id, group);
  }

  @Get('/:id')
  getPost(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._postsService.getPost(org.id, id);
  }

  @Post('/valid')
  async validatePosts(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any
  ) {
    return this._postsService.validatePosts(org.id, rawBody?.posts || []);
  }

  @Post('/fleet-stagger')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createFleetStagger(
    @GetOrgFromRequest() org: Organization,
    @Body() body: any,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this._fleetDistribution.create(
      org.id,
      idempotencyKey,
      body || {}
    );
    response.setHeader(
      'Idempotency-Replayed',
      result.replayed ? 'true' : 'false'
    );
    return result;
  }

  @Post('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    // Server-side validation — never trust the client to have validated.
    const validation = await this._postsService.validatePosts(
      org.id,
      rawBody?.posts || []
    );

    const fail = (
      item: (typeof validation)[number],
      error: string,
      failure: {
        failureClass: 'recoverable' | 'user_action_needed' | 'data_problem';
        code: string;
        reason: string;
      }
    ) => {
      throw new PostValidationException({
        provider: item.identifier,
        name: item.name,
        error,
        ...failure,
      });
    };

    for (const item of validation) {
      if (item.emptyContent) {
        fail(
          item,
          'Your post should have at least one character or one image.',
          item.emptyContentFailure!
        );
      }
    }

    if (rawBody?.type !== 'draft') {
      for (const item of validation) {
        if (!item.valid) {
          fail(
            item,
            item.settingsError || 'Please fix your settings',
            item.settingsFailure!
          );
        }
        if (item.errors !== true) {
          fail(
            item,
            item.errors as string,
            item.preflightFailure || item.mediaFailure!
          );
        }
        if (item.tooLong) {
          fail(item, 'post is too long, please fix it', item.tooLongFailure!);
        }
      }
    }

    const body = await this._postsService.mapTypeToPost(rawBody, org.id);
    try {
      const result = await this._postCreationIdempotency.execute({
        organizationId: org.id,
        idempotencyKey,
        body,
        creationMethod: 'WEB',
        operation: (allocatedBody) =>
          this._postsService.createPost(
            org.id,
            allocatedBody,
            'WEB',
            false,
            true
          ),
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

  @Post('/generator/draft')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  generatePostsDraft(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateGeneratedPostsDto
  ) {
    return this._postsService.generatePostsDraft(org.id, body);
  }

  @Post('/generator')
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async generatePosts(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GeneratorDto,
    @Res({ passthrough: false }) res: Response
  ) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      for await (const event of this._agentGraphService.start(org.id, body)) {
        res.write(JSON.stringify(event) + '\n');
      }
    } catch (err) {
      // The stream has already started, so we cannot surface a normal HTTP
      // error here. Emit a final error event on the open stream instead, so the
      // client can stop and show the message rather than hang on a truncated
      // stream. HttpExceptions carry a curated, user-facing message (e.g. the
      // AI safety rejection); anything else gets a generic message.
      const message =
        err instanceof HttpException
          ? err.message
          : 'Something went wrong while generating your posts, please try again.';
      res.write(JSON.stringify({ name: 'error', error: true, message }) + '\n');
    }

    res.end();
  }

  @Delete('/:group')
  deletePost(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    return this._postsService.deletePost(org.id, group);
  }

  @Put('/:id/date')
  changeDate(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('date') date: string,
    // 'update' is the safe default: clients that don't send an action must
    // never requeue (and thereby republish) a post by accident
    @Body('action') action: 'schedule' | 'update' = 'update',
    @Body('republish') republish = false,
    @Body('scheduleIntent') scheduleIntent?: CalendarScheduleIntentDto,
    @Headers('idempotency-key') operationKey?: string
  ) {
    return this._postsService.changeDate(
      org.id,
      id,
      date,
      action,
      republish,
      scheduleIntent,
      operationKey
    );
  }

  @Post('/separate-posts')
  async separatePosts(
    @GetOrgFromRequest() org: Organization,
    @Body() body: { content: string; len: number }
  ) {
    return this._postsService.separatePosts(body.content, body.len);
  }
}
