import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import dayjs from 'dayjs';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { BulkImportService } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { AuditLogService } from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service';
import { CreateBulkImportDto } from '@gitroom/nestjs-libraries/dtos/bulk/create.bulk.import.dto';
import { BulkPostsActionDto } from '@gitroom/nestjs-libraries/dtos/bulk/bulk.posts.action.dto';
import {
  CreateBulkCampaignDto,
  PinBulkCampaignJobDto,
  ResolveBulkCampaignIssueDto,
  ReviseBulkCampaignDto,
} from '@gitroom/nestjs-libraries/dtos/bulk/create.bulk.campaign.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  BULK_SCHEDULER_CAPABILITY_MATRIX,
  bulkSchedulerCapabilitySnapshotForIntegrations,
  bulkTupleDecisionForIntegration,
  findBulkSchedulerTuple,
} from '@gitroom/helpers/bulk-scheduler/capability.matrix';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { BulkCampaignService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign.service';
import { BulkCampaignExecutionService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.service';
import { BulkUploadService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.service';
import { BULK_UPLOAD_CHUNK_BYTES } from '@gitroom/helpers/bulk-scheduler/upload.contract';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';

@ApiTags('Bulk')
@Controller('/bulk')
export class BulkImportController {
  constructor(
    private _bulkImportService: BulkImportService,
    private _postsService: PostsService,
    private _auditLogService: AuditLogService,
    private _bulkCampaigns: BulkCampaignService,
    private _bulkCampaignExecution: BulkCampaignExecutionService,
    private _bulkUploads: BulkUploadService,
    private _integrations: IntegrationService,
    private _calendarReservations: CalendarReservationService
  ) {}

  @Get('/scheduler/capabilities')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  async getSchedulerCapabilities(@GetOrgFromRequest() org: Organization) {
    const integrations = await this._integrations.getIntegrationsList(org.id);
    return bulkSchedulerCapabilitySnapshotForIntegrations(
      integrations.map((integration) => integration.id),
      process.env
    );
  }

  @Get('/scheduler/canary/preflight')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  async getSchedulerCanaryPreflight(
    @GetOrgFromRequest() org: Organization,
    @Query('tupleId') tupleId: string | undefined,
    @Query('integrationId') integrationId: string | undefined
  ) {
    const tuple = findBulkSchedulerTuple(String(tupleId || ''));
    if (!tuple) {
      throw new HttpException(
        {
          failureClass: 'data_problem',
          code: 'canary_tuple_unknown',
          reason: 'The exact canary capability tuple is unknown and remains disabled.',
        },
        404
      );
    }
    const integration = integrationId
      ? await this._integrations.getIntegrationById(org.id, integrationId)
      : null;
    if (!integration || integration.deletedAt) {
      throw new HttpException(
        {
          failureClass: 'user_action_needed',
          code: 'canary_integration_not_found',
          reason:
            'The designated canary connection does not exist in this workspace.',
        },
        404
      );
    }
    if (integration.providerIdentifier !== tuple.provider) {
      throw new HttpException(
        {
          failureClass: 'data_problem',
          code: 'canary_provider_mismatch',
          reason: `The designated connection uses ${integration.providerIdentifier}, not ${tuple.provider}.`,
        },
        422
      );
    }
    const decision = bulkTupleDecisionForIntegration(
      tuple.id,
      integration.id,
      process.env
    );
    const calendarWriterMode = await this._calendarReservations.resolveWriterMode(
      org.id
    );
    const matrixHash = createHash('sha256')
      .update(JSON.stringify(BULK_SCHEDULER_CAPABILITY_MATRIX), 'utf8')
      .digest('hex');
    return {
      serverTime: new Date().toISOString(),
      organizationId: org.id,
      buildRevision: process.env.PUBLISHLY_BUILD_REVISION || null,
      matrixHash,
      canaryMode:
        process.env[BULK_SCHEDULER_CAPABILITY_MATRIX.canaryModeEnv] === 'true',
      materializerEnabled:
        process.env.BULK_SCHEDULER_MATERIALIZER_ENABLED === 'true',
      calendarWriterMode,
      tuple: {
        id: tuple.id,
        provider: tuple.provider,
        accountType: tuple.accountType,
        postType: tuple.postType,
        mediaKind: tuple.mediaKind,
        transportMode: tuple.transportMode,
        privateTransportReady: tuple.privateTransportReady,
        providerFetchPolicy: tuple.providerFetchPolicy,
        confirmationMethod: tuple.confirmationMethod,
        confirmationImplemented: tuple.confirmationImplemented,
        ambiguityRecoveryMethod: tuple.ambiguityRecoveryMethod,
        ambiguityRecoveryImplemented: tuple.ambiguityRecoveryImplemented,
        certificationStatus: tuple.certificationStatus,
        defaultEligible: tuple.defaultEligible,
      },
      integration: {
        id: integration.id,
        name: integration.name,
        providerIdentifier: integration.providerIdentifier,
        disabled: integration.disabled,
        refreshNeeded: integration.refreshNeeded,
        inBetweenSteps: integration.inBetweenSteps,
        tokenHealthState: integration.tokenHealthState,
        connectionHealthState: integration.connectionHealthState,
      },
      decision: {
        eligible: decision.eligible,
        code: decision.code,
        reason: decision.reason,
      },
    };
  }

  @Post('/scheduler/campaigns/:campaignId/uploads')
  @CheckPolicies([AuthorizationActions.Create, Sections.BULK_TOOLS])
  async initiateSchedulerUploads(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this._bulkUploads.initiate({
      organizationId: org.id,
      campaignId,
      userId: user.id,
      idempotencyKey,
      body,
    });
    response.status(result.replayed ? 200 : 201);
    response.setHeader('Idempotent-Replayed', String(result.replayed));
    return result;
  }

  @Get('/scheduler/campaigns/:campaignId/uploads')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  listSchedulerUploads(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this._bulkUploads.list({
      organizationId: org.id,
      campaignId,
      state,
      cursor,
      limit,
    });
  }

  @Get('/scheduler/campaigns/:campaignId/uploads/:uploadId')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  getSchedulerUpload(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Param('uploadId') uploadId: string
  ) {
    return this._bulkUploads.get(org.id, campaignId, uploadId);
  }

  @Put('/scheduler/campaigns/:campaignId/uploads/:uploadId/parts/:partNumber')
  @UseInterceptors(
    FileInterceptor('chunk', {
      limits: { fileSize: BULK_UPLOAD_CHUNK_BYTES, files: 1 },
    })
  )
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  uploadSchedulerPart(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Param('uploadId') uploadId: string,
    @Param('partNumber') partNumber: string,
    @UploadedFile() chunk: Express.Multer.File | undefined
  ) {
    return this._bulkUploads.uploadPart({
      organizationId: org.id,
      campaignId,
      uploadId,
      partNumber,
      body: chunk?.buffer as Buffer,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/uploads/:uploadId/complete')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  completeSchedulerUpload(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Param('uploadId') uploadId: string
  ) {
    return this._bulkUploads.complete({
      organizationId: org.id,
      campaignId,
      uploadId,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/uploads/:uploadId/abort')
  @CheckPolicies([AuthorizationActions.Delete, Sections.BULK_TOOLS])
  abortSchedulerUpload(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Param('uploadId') uploadId: string
  ) {
    return this._bulkUploads.abort({
      organizationId: org.id,
      campaignId,
      uploadId,
      userId: user.id,
    });
  }

  @Get('/scheduler/assets/:assetId/thumbnail')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  async schedulerAssetThumbnail(
    @GetOrgFromRequest() org: Organization,
    @Param('assetId') assetId: string,
    @Res() response: Response
  ) {
    const thumbnail = await this._bulkUploads.openThumbnail(org.id, assetId);
    response.status(200);
    response.setHeader('Content-Type', thumbnail.contentType);
    response.setHeader('Content-Length', String(thumbnail.contentLength));
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    await pipeline(thumbnail.body, response);
  }

  @Post('/scheduler/campaigns')
  @CheckPolicies([AuthorizationActions.Create, Sections.BULK_TOOLS])
  async createSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateBulkCampaignDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this._bulkCampaigns.create({
      organizationId: org.id,
      userId: user.id,
      name: body.name,
      rawIntent: body.intent,
      idempotencyKey,
    });
    response.status(result.replayed ? 200 : 201);
    response.setHeader('Idempotent-Replayed', String(result.replayed));
    return result;
  }

  @Get('/scheduler/campaigns')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  listSchedulerCampaigns(
    @GetOrgFromRequest() org: Organization,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this._bulkCampaigns.list({
      organizationId: org.id,
      state,
      cursor,
      limit,
    });
  }

  @Get('/scheduler/campaigns/:campaignId')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  getSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string
  ) {
    return this._bulkCampaigns.get(org.id, campaignId);
  }

  @Post('/scheduler/campaigns/:campaignId/plan')
  @CheckPolicies([AuthorizationActions.Create, Sections.BULK_TOOLS])
  planSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string
  ) {
    return this._bulkCampaignExecution.planAndReserve({
      organizationId: org.id,
      campaignId,
      userId: user.id,
    });
  }

  @Get('/scheduler/campaigns/:campaignId/jobs')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  listSchedulerCampaignJobs(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this._bulkCampaignExecution.listJobs({
      organizationId: org.id,
      campaignId,
      state,
      cursor,
      limit,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/jobs/:jobId/pin')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  pinSchedulerCampaignJob(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Param('jobId') jobId: string,
    @Body() body: PinBulkCampaignJobDto
  ) {
    return this._bulkCampaignExecution.setJobPinned({
      organizationId: org.id,
      campaignId,
      jobId,
      expectedRevision: body.expectedRevision,
      pinned: body.pinned,
      userId: user.id,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/jobs/:jobId/retry')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  retrySchedulerCampaignJob(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Param('jobId') jobId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this._bulkCampaignExecution.retryJob({
      organizationId: org.id,
      campaignId,
      jobId,
      idempotencyKey,
      userId: user.id,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/pause')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  pauseSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this._bulkCampaigns.pause({
      organizationId: org.id,
      campaignId,
      userId: user.id,
      idempotencyKey,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/resume')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  resumeSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this._bulkCampaigns.resume({
      organizationId: org.id,
      campaignId,
      userId: user.id,
      idempotencyKey,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/cancel')
  @CheckPolicies([AuthorizationActions.Delete, Sections.BULK_TOOLS])
  cancelSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined
  ) {
    return this._bulkCampaignExecution.cancel({
      organizationId: org.id,
      campaignId,
      userId: user.id,
      idempotencyKey,
    });
  }

  @Patch('/scheduler/campaigns/:campaignId/intent')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  reviseSchedulerCampaign(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Body() body: ReviseBulkCampaignDto
  ) {
    return this._bulkCampaigns.revise({
      organizationId: org.id,
      campaignId,
      userId: user.id,
      expectedRevision: body.expectedRevision,
      rawIntent: body.intent,
    });
  }

  @Get('/scheduler/campaigns/:campaignId/intents')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  listSchedulerCampaignIntents(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this._bulkCampaigns.listIntents({
      organizationId: org.id,
      campaignId,
      cursor,
      limit,
    });
  }

  @Get('/scheduler/campaigns/:campaignId/issues')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  listSchedulerCampaignIssues(
    @GetOrgFromRequest() org: Organization,
    @Param('campaignId') campaignId: string,
    @Query('state') state?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string
  ) {
    return this._bulkCampaigns.listIssues({
      organizationId: org.id,
      campaignId,
      state,
      cursor,
      limit,
    });
  }

  @Post('/scheduler/campaigns/:campaignId/issues/:issueId/resolve')
  @CheckPolicies([AuthorizationActions.Update, Sections.BULK_TOOLS])
  resolveSchedulerCampaignIssue(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('campaignId') campaignId: string,
    @Param('issueId') issueId: string,
    @Body() body: ResolveBulkCampaignIssueDto
  ) {
    return this._bulkCampaigns.resolveIssue({
      organizationId: org.id,
      campaignId,
      issueId,
      resolutionCode: body.resolutionCode,
      resolutionNote: body.resolutionNote,
      actor: { userId: user.id, actorType: 'user' },
    });
  }

  @Post('/import')
  @CheckPolicies([AuthorizationActions.Create, Sections.BULK_TOOLS])
  async createImport(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: CreateBulkImportDto
  ) {
    try {
      const result = await this._bulkImportService.createImport(
        org.id,
        body.name,
        body.csv
      );
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'bulk.import-created',
        targetType: 'bulkImport',
        targetId: result.id,
        metadata: { totalRows: result.totalRows, validRows: result.validRows },
      });
      return result;
    } catch (err: any) {
      throw new HttpException(err?.message || 'Invalid CSV', 400);
    }
  }

  @Get('/import')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  list(@GetOrgFromRequest() org: Organization) {
    return this._bulkImportService.list(org.id);
  }

  @Get('/import/:id')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  async getImport(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    const found = await this._bulkImportService.getImport(org.id, id);
    if (!found) {
      throw new HttpException('Import not found', 404);
    }
    return found;
  }

  @Get('/import/:id/report.csv')
  @CheckPolicies([AuthorizationActions.Read, Sections.BULK_TOOLS])
  async downloadReport(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const found = await this._bulkImportService.getImport(org.id, id);
    if (!found) {
      throw new HttpException('Import not found', 404);
    }
    const escape = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['row', 'status', 'errors', 'warnings', 'date', 'integrations']
        .map(escape)
        .join(','),
      ...(found.rows || []).map((row: any) =>
        [
          row.row,
          row.status,
          (row.errors || []).join(' | '),
          (row.warnings || []).join(' | '),
          row.date,
          (row.integrations || []).join(' | '),
        ]
          .map(escape)
          .join(',')
      ),
    ];
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="publishly-bulk-import-${id}.csv"`
    );
    response.send(`\uFEFF${lines.join('\r\n')}`);
  }

  @Post('/import/:id/commit')
  @CheckPolicies([AuthorizationActions.Create, Sections.BULK_TOOLS])
  async commit(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string
  ) {
    try {
      const result = await this._bulkImportService.commit(org.id, id);
      this._auditLogService.log({
        organizationId: org.id,
        userId: user.id,
        action: 'bulk.import-committed',
        targetType: 'bulkImport',
        targetId: id,
      });
      return result;
    } catch (err: any) {
      throw new HttpException(err?.message || 'Cannot commit import', 400);
    }
  }

  // Bulk operations on already-scheduled posts (calendar multi-select).
  @Post('/posts/shift')
  @CheckPolicies([AuthorizationActions.Create, Sections.BULK_TOOLS])
  async shiftPosts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BulkPostsActionDto
  ) {
    if (!body.minutes) {
      throw new HttpException('minutes is required for shift', 400);
    }
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of body.ids) {
      try {
        const post = await this._postsService.getPostById(id, org.id);
        if (!post) {
          results.push({ id, ok: false, error: 'not found' });
          continue;
        }
        const newDate = dayjs(post.publishDate)
          .add(body.minutes, 'minutes')
          .toISOString();
        await this._postsService.changeDate(org.id, id, newDate);
        results.push({ id, ok: true });
      } catch (err: any) {
        results.push({ id, ok: false, error: err?.message });
      }
    }
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'bulk.posts-shifted',
      metadata: { count: body.ids.length, minutes: body.minutes },
    });
    return { results };
  }

  @Post('/posts/delete')
  @CheckPolicies([AuthorizationActions.Delete, Sections.BULK_TOOLS])
  async deletePosts(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: BulkPostsActionDto
  ) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const group of body.ids) {
      try {
        await this._postsService.deletePost(org.id, group);
        results.push({ id: group, ok: true });
      } catch (err: any) {
        results.push({ id: group, ok: false, error: err?.message });
      }
    }
    this._auditLogService.log({
      organizationId: org.id,
      userId: user.id,
      action: 'bulk.posts-deleted',
      metadata: { count: body.ids.length },
    });
    return { results };
  }
}
