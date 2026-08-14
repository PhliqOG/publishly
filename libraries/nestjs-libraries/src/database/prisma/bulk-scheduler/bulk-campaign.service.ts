import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  BulkCampaignIssueState,
  BulkCampaignState,
  BulkCampaignSubjectType,
  Prisma,
} from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import {
  BULK_CAMPAIGN_ISSUE_CODES,
  BULK_CAMPAIGN_STATES,
  BulkCampaignIntentV1,
  BulkCampaignIssueCode,
  bulkPageLimit,
  canTransitionBulkCampaign,
  decodeBulkCursor,
  encodeBulkCursor,
  isBulkCampaignIssueCode,
  validateBulkCampaignIntent,
} from '@gitroom/helpers/bulk-scheduler/campaign.contract';
import {
  bulkTupleDecisionForIntegration,
  findBulkSchedulerTuple,
} from '@gitroom/helpers/bulk-scheduler/capability.matrix';
import {
  canonicalJson,
  sha256,
  validateIdempotencyKey,
} from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import {
  BulkCampaignAuditActor,
  BulkCampaignRepository,
} from './bulk-campaign.repository';

type CampaignDestinationIssue = {
  integrationId: string;
  capabilityTupleId: string;
  issueClass: 'blocked';
  failureClass: 'user_action_needed' | 'data_problem';
  code:
    | 'capability_tuple_unknown'
    | 'capability_tuple_disabled'
    | 'connection_not_found'
    | 'connection_provider_mismatch'
    | 'connection_disconnected';
  reason: string;
};

function classified(
  status: number,
  input: {
    failureClass: 'recoverable' | 'user_action_needed' | 'data_problem';
    code: string;
    reason: string;
    [key: string]: unknown;
  }
) {
  return new HttpException(input, status);
}

function cleanName(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function nextCursor(
  kind: 'campaign' | 'intent' | 'issue',
  page: { items: Array<{ id: string } & Record<string, any>>; hasMore: boolean },
  timestampField: 'updatedAt' | 'createdAt' | 'occurredAt'
) {
  if (!page.hasMore || !page.items.length) return null;
  const last = page.items[page.items.length - 1];
  return encodeBulkCursor({
    kind,
    timestamp: last[timestampField],
    id: last.id,
  });
}

@Injectable()
export class BulkCampaignService {
  private readonly logger = new Logger(BulkCampaignService.name);

  constructor(private _repository: BulkCampaignRepository) {}

  private async validateDestinations(
    organizationId: string,
    intent: BulkCampaignIntentV1
  ) {
    const destinationIds = [
      ...new Set(intent.selection.destinations.map((item) => item.integrationId)),
    ];
    const connections = await this._repository.findConnections(
      organizationId,
      destinationIds
    );
    const byId = new Map(connections.map((connection) => [connection.id, connection]));
    const issues: CampaignDestinationIssue[] = [];

    for (const destination of intent.selection.destinations) {
      const tuple = findBulkSchedulerTuple(destination.capabilityTupleId);
      if (!tuple) {
        issues.push({
          ...destination,
          issueClass: 'blocked',
          failureClass: 'data_problem',
          code: 'capability_tuple_unknown',
          reason: 'This exact platform, account, post, and media combination is unknown and disabled.',
        });
        continue;
      }
      const decision = bulkTupleDecisionForIntegration(
        tuple.id,
        destination.integrationId,
        process.env
      );
      if (!decision.eligible) {
        issues.push({
          ...destination,
          issueClass: 'blocked',
          failureClass: 'user_action_needed',
          code: 'capability_tuple_disabled',
          reason: decision.reason,
        });
        continue;
      }
      const connection = byId.get(destination.integrationId);
      if (!connection) {
        issues.push({
          ...destination,
          issueClass: 'blocked',
          failureClass: 'user_action_needed',
          code: 'connection_not_found',
          reason: 'The selected connection does not exist in this workspace or is no longer active.',
        });
        continue;
      }
      if (connection.providerIdentifier !== tuple.provider) {
        issues.push({
          ...destination,
          issueClass: 'blocked',
          failureClass: 'data_problem',
          code: 'connection_provider_mismatch',
          reason: `The selected connection is ${connection.providerIdentifier}, but ${tuple.id} requires ${tuple.provider}.`,
        });
        continue;
      }
      if (connection.disabled || !connection.token) {
        issues.push({
          ...destination,
          issueClass: 'blocked',
          failureClass: 'user_action_needed',
          code: 'connection_disconnected',
          reason: 'Reconnect this account before adding it to a Bulk Scheduler campaign.',
        });
      }
    }
    return issues;
  }

  async assertDestinations(
    organizationId: string,
    intent: BulkCampaignIntentV1
  ) {
    const issues = await this.validateDestinations(organizationId, intent);
    if (!issues.length) return;
    Sentry.metrics.count('bulk_campaign_destinations_blocked', issues.length);
    this.logger.warn({
      event: 'bulk_campaign_destinations_blocked',
      organizationId,
      count: issues.length,
      codes: [...new Set(issues.map((issue) => issue.code))],
    });
    throw new UnprocessableEntityException({
      failureClass: 'user_action_needed',
      code: 'campaign_destinations_blocked',
      reason: `${issues.length} campaign destination${
        issues.length === 1 ? ' is' : 's are'
      } blocked.`,
      issues,
    });
  }

  private async validatedIntent(organizationId: string, rawIntent: unknown) {
    const validation = validateBulkCampaignIntent(rawIntent);
    if (validation.valid === false) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: validation.code,
        reason: validation.reason,
      });
    }
    await this.assertDestinations(organizationId, validation.value);
    return validation.value;
  }

  async create(input: {
    organizationId: string;
    userId?: string;
    name: unknown;
    rawIntent: unknown;
    idempotencyKey: unknown;
  }) {
    const name = cleanName(input.name);
    if (!name || name.length > 120) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_campaign_name',
        reason: 'Campaign name must contain between 1 and 120 characters.',
      });
    }
    if (!validateIdempotencyKey(input.idempotencyKey)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason: 'Idempotency-Key must contain 8-200 letters, numbers, dots, underscores, colons, or hyphens.',
      });
    }
    const intent = await this.validatedIntent(input.organizationId, input.rawIntent);
    const keyHash = sha256(`${input.organizationId}:${input.idempotencyKey}`);
    const intentJson = canonicalJson(intent);
    const intentHash = sha256(intentJson);
    const requestHash = sha256(canonicalJson({ name, intent }));
    const id = `bulk_campaign_${sha256(`${input.organizationId}:${keyHash}`).slice(0, 32)}`;
    const intentId = `bulk_intent_${sha256(`${id}:1:${intentHash}`).slice(0, 32)}`;
    const result = await this._repository.create({
      id,
      intentId,
      organizationId: input.organizationId,
      name,
      idempotencyKeyHash: keyHash,
      requestHash,
      intent: intent as unknown as Prisma.InputJsonValue,
      intentHash,
      actor: { userId: input.userId, actorType: input.userId ? 'user' : 'apikey' },
    });
    if (!result.created && result.campaign.requestHash !== requestHash) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'idempotency_key_reused',
        reason: 'This Idempotency-Key was already used with a different campaign request.',
      });
    }
    const campaign = await this._repository.get(input.organizationId, result.campaign.id);
    if (!campaign) throw new Error('Campaign disappeared after creation.');
    Sentry.metrics.count(
      result.created ? 'bulk_campaign_created' : 'bulk_campaign_create_replayed',
      1
    );
    this.logger.log({
      event: result.created ? 'bulk_campaign_created' : 'bulk_campaign_create_replayed',
      organizationId: input.organizationId,
      campaignId: campaign.id,
      revision: campaign.currentRevision,
    });
    return { ...campaign, replayed: !result.created };
  }

  async revise(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    expectedRevision: unknown;
    rawIntent: unknown;
  }) {
    if (!Number.isInteger(input.expectedRevision) || (input.expectedRevision as number) < 1) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_campaign_revision',
        reason: 'expectedRevision must be a positive integer.',
      });
    }
    const intent = await this.validatedIntent(input.organizationId, input.rawIntent);
    const intentHash = sha256(canonicalJson(intent));
    const nextRevision = (input.expectedRevision as number) + 1;
    const intentId = `bulk_intent_${sha256(`${input.campaignId}:${nextRevision}:${intentHash}`).slice(0, 32)}`;
    const result = await this._repository.revise({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      expectedRevision: input.expectedRevision as number,
      intentId,
      intent: intent as unknown as Prisma.InputJsonValue,
      intentHash,
      actor: { userId: input.userId, actorType: input.userId ? 'user' : 'apikey' },
    });
    if (result.type === 'not_found') throw new NotFoundException('Campaign not found.');
    if (result.type === 'terminal') {
      throw new ConflictException({
        failureClass: 'user_action_needed',
        code: 'campaign_terminal',
        reason: `A ${result.state.toLowerCase()} campaign cannot be edited.`,
      });
    }
    if (result.type === 'revision_conflict' || result.type === 'revision_race') {
      throw new ConflictException({
        failureClass: 'recoverable',
        code: 'campaign_revision_conflict',
        reason: 'The campaign changed while this edit was being saved. Reload its current intent and retry.',
        ...('currentRevision' in result
          ? { currentRevision: result.currentRevision }
          : {}),
      });
    }
    const campaign = await this._repository.get(input.organizationId, input.campaignId);
    if (!campaign) throw new Error('Campaign disappeared after intent revision.');
    Sentry.metrics.count(
      result.type === 'replay'
        ? 'bulk_campaign_revision_replayed'
        : 'bulk_campaign_revised',
      1
    );
    this.logger.log({
      event:
        result.type === 'replay'
          ? 'bulk_campaign_revision_replayed'
          : 'bulk_campaign_revised',
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      revision: campaign.currentRevision,
    });
    return { ...campaign, replayed: result.type === 'replay' };
  }

  async get(organizationId: string, campaignId: string) {
    const campaign = await this._repository.get(organizationId, campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found.');
    return campaign;
  }

  async list(input: {
    organizationId: string;
    state?: string;
    cursor?: string;
    limit?: string | number;
  }) {
    if (input.state && !BULK_CAMPAIGN_STATES.includes(input.state as BulkCampaignState)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_campaign_state',
        reason: 'The campaign state filter is invalid.',
      });
    }
    let cursor;
    let limit;
    try {
      cursor = decodeBulkCursor(input.cursor, 'campaign');
      limit = bulkPageLimit(input.limit);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'invalid_cursor';
      throw new BadRequestException({
        failureClass: 'data_problem',
        code,
        reason: code === 'invalid_page_limit'
          ? 'limit must be an integer from 1 through 100.'
          : 'The campaign cursor is invalid or belongs to another collection.',
      });
    }
    const page = await this._repository.list({
      organizationId: input.organizationId,
      state: input.state as BulkCampaignState | undefined,
      cursor,
      limit,
    });
    return {
      items: page.items,
      nextCursor: nextCursor('campaign', page, 'updatedAt'),
    };
  }

  async listIntents(input: {
    organizationId: string;
    campaignId: string;
    cursor?: string;
    limit?: string | number;
  }) {
    let cursor;
    let limit;
    try {
      cursor = decodeBulkCursor(input.cursor, 'intent');
      limit = bulkPageLimit(input.limit);
    } catch {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_cursor',
        reason: 'The intent cursor or limit is invalid.',
      });
    }
    const page = await this._repository.listIntents({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      cursor,
      limit,
    });
    if (!page) throw new NotFoundException('Campaign not found.');
    return { items: page.items, nextCursor: nextCursor('intent', page, 'createdAt') };
  }

  async listIssues(input: {
    organizationId: string;
    campaignId: string;
    state?: string;
    cursor?: string;
    limit?: string | number;
  }) {
    if (input.state && !['open', 'resolved'].includes(input.state)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_issue_state',
        reason: 'Issue state must be open or resolved.',
      });
    }
    let cursor;
    let limit;
    try {
      cursor = decodeBulkCursor(input.cursor, 'issue');
      limit = bulkPageLimit(input.limit);
    } catch {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_cursor',
        reason: 'The issue cursor or limit is invalid.',
      });
    }
    const page = await this._repository.listIssues({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      state: input.state as BulkCampaignIssueState | undefined,
      cursor,
      limit,
    });
    if (!page) throw new NotFoundException('Campaign not found.');
    return { items: page.items, nextCursor: nextCursor('issue', page, 'occurredAt') };
  }

  async transition(input: {
    organizationId: string;
    campaignId: string;
    to: BulkCampaignState;
    actor: BulkCampaignAuditActor;
    now?: Date;
    operationId?: string;
  }) {
    const campaign = await this.get(input.organizationId, input.campaignId);
    if (!canTransitionBulkCampaign(campaign.state, input.to)) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'invalid_campaign_transition',
        reason: `Campaign state cannot move from ${campaign.state} to ${input.to}.`,
      });
    }
    const changed = await this._repository.transition({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      from: campaign.state,
      to: input.to,
      actor: input.actor,
      now: input.now || new Date(),
      operationId: input.operationId,
    });
    if (!changed) {
      throw classified(HttpStatus.CONFLICT, {
        failureClass: 'recoverable',
        code: 'campaign_state_race',
        reason: 'The campaign state changed concurrently. Reload and retry.',
      });
    }
    return changed;
  }

  private actionOperationId(input: {
    organizationId: string;
    campaignId: string;
    action: string;
    idempotencyKey: unknown;
  }) {
    if (!validateIdempotencyKey(input.idempotencyKey)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason:
          'Idempotency-Key must contain 8-200 letters, numbers, dots, underscores, colons, or hyphens.',
      });
    }
    return `bulk_action_${sha256(
      `${input.organizationId}:${input.campaignId}:${input.action}:${input.idempotencyKey}`
    ).slice(0, 36)}`;
  }

  async pause(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    idempotencyKey: unknown;
  }) {
    const operationId = this.actionOperationId({ ...input, action: 'pause' });
    if (
      await this._repository.getActionReplay(
        input.organizationId,
        input.campaignId,
        operationId
      )
    ) {
      return {
        campaign: await this.get(input.organizationId, input.campaignId),
        replayed: true,
      };
    }
    const campaign = await this.get(input.organizationId, input.campaignId);
    if (campaign.state === 'PAUSED') {
      const recorded = await this._repository.recordActionNoop({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        operationId,
        action: 'pause',
        state: 'PAUSED',
        actor: { userId: input.userId, actorType: 'user' },
      });
      if (!recorded) {
        throw classified(HttpStatus.CONFLICT, {
          failureClass: 'recoverable',
          code: 'campaign_state_race',
          reason: 'The campaign state changed concurrently. Reload and retry.',
        });
      }
      return { campaign, replayed: true };
    }
    const changed = await this.transition({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      to: 'PAUSED',
      actor: { userId: input.userId, actorType: 'user' },
      operationId,
    });
    return { campaign: changed, replayed: false };
  }

  async resume(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    idempotencyKey: unknown;
  }) {
    const operationId = this.actionOperationId({ ...input, action: 'resume' });
    if (
      await this._repository.getActionReplay(
        input.organizationId,
        input.campaignId,
        operationId
      )
    ) {
      return {
        campaign: await this.get(input.organizationId, input.campaignId),
        replayed: true,
      };
    }
    const campaign = await this.get(input.organizationId, input.campaignId);
    if (campaign.state !== 'PAUSED' || !campaign.pausedFromState) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'campaign_not_paused',
        reason: 'Only a paused campaign can be resumed.',
      });
    }
    const changed = await this.transition({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      to: campaign.pausedFromState,
      actor: { userId: input.userId, actorType: 'user' },
      operationId,
    });
    return { campaign: changed, replayed: false };
  }

  async beginCancellation(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    idempotencyKey: unknown;
  }) {
    const operationId = this.actionOperationId({
      ...input,
      action: 'cancel',
    });
    if (
      await this._repository.getActionReplay(
        input.organizationId,
        input.campaignId,
        operationId
      )
    ) {
      return {
        campaign: await this.get(input.organizationId, input.campaignId),
        replayed: true,
      };
    }
    const campaign = await this.get(input.organizationId, input.campaignId);
    if (campaign.state === 'CANCELLED' || campaign.state === 'CANCELLING') {
      const recorded = await this._repository.recordActionNoop({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        operationId,
        action: 'cancel',
        state: campaign.state,
        actor: { userId: input.userId, actorType: 'user' },
      });
      if (!recorded) {
        throw classified(HttpStatus.CONFLICT, {
          failureClass: 'recoverable',
          code: 'campaign_state_race',
          reason: 'The campaign state changed concurrently. Reload and retry.',
        });
      }
      return { campaign, replayed: true };
    }
    const changed = await this.transition({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      to: 'CANCELLING',
      actor: { userId: input.userId, actorType: 'user' },
      operationId,
    });
    return { campaign: changed, replayed: false };
  }

  recordIssue(input: {
    organizationId: string;
    campaignId: string;
    eventKey: unknown;
    code: BulkCampaignIssueCode | string;
    reason: unknown;
    subjectType?: BulkCampaignSubjectType;
    subjectId?: unknown;
    details?: unknown;
    occurredAt?: Date;
    actor?: BulkCampaignAuditActor;
  }) {
    if (!isBulkCampaignIssueCode(input.code)) {
      throw new Error(`Unknown Bulk Scheduler issue code: ${String(input.code)}`);
    }
    const eventKey = typeof input.eventKey === 'string' ? input.eventKey.trim() : '';
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    const subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : '';
    if (!eventKey || eventKey.length > 240 || !reason || reason.length > 2000) {
      throw new Error('Bulk Scheduler issues require bounded eventKey and reason values.');
    }
    if ((input.subjectType && !subjectId) || (!input.subjectType && subjectId)) {
      throw new Error('Bulk Scheduler issue subjectType and subjectId must be provided together.');
    }
    if (input.details !== undefined && Buffer.byteLength(canonicalJson(input.details), 'utf8') > 64 * 1024) {
      throw new Error('Bulk Scheduler issue details must not exceed 64 KiB.');
    }
    const definition = BULK_CAMPAIGN_ISSUE_CODES[input.code];
    const id = `bulk_issue_${sha256(`${input.organizationId}:${input.campaignId}:${eventKey}`).slice(0, 32)}`;
    const operation = this._repository.recordIssue({
      id,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      eventKey,
      issueClass: definition.issueClass,
      failureClass: definition.failureClass,
      code: input.code,
      reason,
      subjectType: input.subjectType,
      subjectId: subjectId || undefined,
      retryable: definition.retryable,
      details: input.details as Prisma.InputJsonValue | undefined,
      occurredAt: input.occurredAt || new Date(),
      actor: input.actor || { actorType: 'system' },
    });
    return operation.then((result) => {
      if (result.type === 'not_found') {
        Sentry.metrics.count('bulk_campaign_issue_campaign_not_found', 1);
        throw new NotFoundException('Campaign not found.');
      }
      Sentry.metrics.count('bulk_campaign_issue_recorded', 1);
      this.logger.warn({
        event: 'bulk_campaign_issue_recorded',
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        issueId: id,
        issueClass: definition.issueClass,
        failureClass: definition.failureClass,
        code: input.code,
        retryable: definition.retryable,
        replayed: result.type === 'replay',
      });
      return result;
    });
  }

  async resolveIssue(input: {
    organizationId: string;
    campaignId: string;
    issueId: string;
    resolutionCode: unknown;
    resolutionNote?: unknown;
    actor: BulkCampaignAuditActor;
    now?: Date;
  }) {
    const resolutionCode =
      typeof input.resolutionCode === 'string' ? input.resolutionCode.trim() : '';
    const resolutionNote =
      typeof input.resolutionNote === 'string' ? input.resolutionNote.trim() : undefined;
    if (!resolutionCode || resolutionCode.length > 120 || (resolutionNote?.length || 0) > 2000) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_issue_resolution',
        reason: 'Issue resolution requires a bounded resolutionCode and optional note.',
      });
    }
    const result = await this._repository.resolveIssue({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      issueId: input.issueId,
      resolutionCode,
      resolutionNote,
      actor: input.actor,
      now: input.now || new Date(),
    });
    if (result.type === 'not_found') throw new NotFoundException('Campaign issue not found.');
    if (result.type === 'race') {
      throw new ConflictException({
        failureClass: 'recoverable',
        code: 'issue_resolution_race',
        reason: 'The issue changed while it was being resolved. Reload and retry.',
      });
    }
    Sentry.metrics.count(
      result.type === 'replay'
        ? 'bulk_campaign_issue_resolution_replayed'
        : 'bulk_campaign_issue_resolved',
      1
    );
    this.logger.log({
      event:
        result.type === 'replay'
          ? 'bulk_campaign_issue_resolution_replayed'
          : 'bulk_campaign_issue_resolved',
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      issueId: input.issueId,
      resolutionCode,
    });
    return { issue: result.issue, replayed: result.type === 'replay' };
  }
}
