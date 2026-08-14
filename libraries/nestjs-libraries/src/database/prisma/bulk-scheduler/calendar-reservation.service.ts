import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BulkCampaignIssueClass,
  CalendarReservationMode,
  CalendarReservationOwnerType,
  CalendarReservationState,
} from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import {
  CALENDAR_RESERVATION_CODES,
  assertReservationLocalIntent,
  boundedReservationLimit,
  canTransitionReservation,
  decodeReservationCursor,
  encodeReservationCursor,
} from '@gitroom/helpers/bulk-scheduler/calendar-reservation.contract';
import {
  AcquireCalendarReservation,
  CalendarReservationRepository,
} from './calendar-reservation.repository';

function envTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function classifiedException(
  status: number,
  failureClass: 'recoverable' | 'user_action_needed' | 'data_problem',
  code: string,
  reason: string
) {
  return new HttpException({ failureClass, code, reason }, status);
}

@Injectable()
export class CalendarReservationService {
  private readonly logger = new Logger(CalendarReservationService.name);

  constructor(private _repository: CalendarReservationRepository) {}

  private authorityRequestedFor(organizationId: string) {
    if (process.env.CALENDAR_RESERVATION_ENFORCEMENT !== 'true') return false;
    const rollout = (process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return rollout.length === 0 || rollout.includes(organizationId);
  }

  async resolveWriterMode(
    organizationId: string
  ): Promise<CalendarReservationMode> {
    if (!this.authorityRequestedFor(organizationId)) {
      this.assertEnabled('shadow');
      return 'SHADOW';
    }
    this.assertEnabled('authoritative');
    const cutover = await this._repository.getWriterCutover(organizationId);
    if (!cutover || cutover.state !== 'VERIFIED') {
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        CALENDAR_RESERVATION_CODES.WRITER_NOT_VERIFIED,
        'This workspace calendar backfill is not verified. No calendar write was performed.'
      );
    }
    if (!cutover.authorityActivatedAt) {
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        CALENDAR_RESERVATION_CODES.AUTHORITY_NOT_READY,
        'This workspace has not completed bounded authoritative promotion. No calendar write was performed.'
      );
    }
    return 'AUTHORITATIVE';
  }

  private assertEnabled(scope: 'authoritative' | 'shadow') {
    if (envTrue(process.env.CALENDAR_RESERVATION_KILL_ALL)) {
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_reservation_disabled',
        'Calendar reservation processing is disabled by the operator rollback switch.'
      );
    }
    if (
      scope === 'authoritative' &&
      process.env.CALENDAR_RESERVATION_ENFORCEMENT !== 'true'
    ) {
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_reservation_enforcement_disabled',
        'Authoritative calendar reservations are not enabled for this deployment.'
      );
    }
    if (
      scope === 'shadow' &&
      process.env.CALENDAR_RESERVATION_SHADOW_ENABLED === 'false'
    ) {
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_reservation_shadow_disabled',
        'Calendar reservation shadow processing is disabled by the operator.'
      );
    }
  }

  async acquire(input: AcquireCalendarReservation) {
    this.assertEnabled('authoritative');
    if (
      !input.idempotencyKey ||
      input.idempotencyKey.length > 240 ||
      !input.ownerId ||
      input.ownerId.length > 240 ||
      input.revision < 1 ||
      !Number.isInteger(input.revision)
    ) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_request_invalid',
        'Reservation owner, revision, and idempotency key are required and bounded.'
      );
    }
    if (
      (input.ownerType === 'POST' &&
        ((input.postId && input.postId !== input.ownerId) ||
          (!input.postId && input.state !== 'HELD') ||
          input.campaignId)) ||
      (input.ownerType === 'BULK_CAMPAIGN_SLOT' && !input.campaignId)
    ) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_owner_invalid',
        'The reservation owner and linked post or campaign do not agree.'
      );
    }
    try {
      assertReservationLocalIntent(input);
    } catch (error) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        error instanceof Error
          ? error.message
          : 'calendar_local_intent_invalid',
        'UTC schedule, timezone, local wall-clock intent, offset, or DST fold is invalid.'
      );
    }
    if (
      input.state === 'HELD' &&
      (!input.leaseExpiresAt || input.leaseExpiresAt <= new Date())
    ) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_lease_invalid',
        'A reservation hold requires a future lease expiration.'
      );
    }
    if (input.state === 'COMMITTED' && input.leaseExpiresAt) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_lease_invalid',
        'A committed reservation cannot retain a hold lease.'
      );
    }

    let result;
    try {
      result = await this._repository.acquire(input);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'calendar_integration_not_found'
      ) {
        throw classifiedException(
          HttpStatus.NOT_FOUND,
          'user_action_needed',
          'calendar_integration_not_found',
          'The destination connection is unavailable in this workspace.'
        );
      }
      Sentry.metrics.count('calendar_reservation_ledger_failed', 1);
      this.logger.error({
        event: 'calendar_reservation_ledger_failed',
        organizationId: input.organizationId,
        integrationId: input.integrationId,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        code: 'calendar_reservation_ledger_unavailable',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_reservation_ledger_unavailable',
        'Publishly could not persist the calendar reservation. No post was created.'
      );
    }
    if (
      result.replayed &&
      result.reservation.requestHash !== result.requestHash
    ) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: CALENDAR_RESERVATION_CODES.IDEMPOTENCY_REUSED,
        reason:
          'This calendar idempotency key was already used for different slot intent.',
      });
    }
    const conflicted = result.reservation.state === 'CONFLICTED';
    Sentry.metrics.count(
      conflicted
        ? 'calendar_reservation_conflicted'
        : result.replayed
        ? 'calendar_reservation_replayed'
        : 'calendar_reservation_created',
      1
    );
    this.logger[conflicted ? 'warn' : 'log']({
      event: conflicted
        ? 'calendar_reservation_conflicted'
        : result.replayed
        ? 'calendar_reservation_replayed'
        : 'calendar_reservation_created',
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      reservationId: result.reservation.id,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      scheduledAt: input.scheduledAt,
      state: result.reservation.state,
      code: result.reservation.outcomeCode,
    });
    return { ...result, conflicted };
  }

  async acquireBatch(inputs: AcquireCalendarReservation[]) {
    this.assertEnabled('authoritative');
    if (!inputs.length || inputs.length > 500) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_batch_size_invalid',
        'A reservation batch must contain between 1 and 500 items.'
      );
    }
    const organizationId = inputs[0].organizationId;
    const seen = new Set<string>();
    for (const input of inputs) {
      if (
        input.organizationId !== organizationId ||
        input.ownerType !== 'BULK_CAMPAIGN_SLOT' ||
        !input.campaignId ||
        input.state !== 'COMMITTED' ||
        input.leaseExpiresAt ||
        !input.idempotencyKey ||
        input.idempotencyKey.length > 240 ||
        !input.ownerId ||
        input.ownerId.length > 240 ||
        !Number.isInteger(input.revision) ||
        input.revision < 1 ||
        seen.has(input.idempotencyKey)
      ) {
        throw classifiedException(
          HttpStatus.BAD_REQUEST,
          'data_problem',
          'calendar_reservation_batch_request_invalid',
          'Batch rows must be unique committed campaign-slot intents for one tenant.'
        );
      }
      seen.add(input.idempotencyKey);
      try {
        assertReservationLocalIntent(input);
      } catch (error) {
        throw classifiedException(
          HttpStatus.BAD_REQUEST,
          'data_problem',
          error instanceof Error
            ? error.message
            : 'calendar_local_intent_invalid',
          'UTC schedule, timezone, local wall-clock intent, offset, or DST fold is invalid.'
        );
      }
    }
    let results;
    try {
      results = await this._repository.acquireBatch(inputs);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'calendar_integration_not_found'
      ) {
        throw classifiedException(
          HttpStatus.NOT_FOUND,
          'user_action_needed',
          'calendar_integration_not_found',
          'At least one destination connection is unavailable in this workspace.'
        );
      }
      Sentry.metrics.count('calendar_reservation_batch_failed', 1);
      this.logger.error({
        event: 'calendar_reservation_batch_failed',
        organizationId,
        count: inputs.length,
        code: 'calendar_reservation_ledger_unavailable',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw classifiedException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_reservation_ledger_unavailable',
        'Publishly could not persist this bounded reservation batch. No jobs were linked.'
      );
    }
    for (const result of results) {
      if (
        result.replayed &&
        result.reservation.requestHash !== result.requestHash
      ) {
        throw new ConflictException({
          failureClass: 'data_problem',
          code: CALENDAR_RESERVATION_CODES.IDEMPOTENCY_REUSED,
          reason:
            'A calendar idempotency key in this batch was already used for different slot intent.',
        });
      }
    }
    const conflicted = results.filter(
      (result) => result.reservation.state === 'CONFLICTED'
    ).length;
    Sentry.metrics.count('calendar_reservation_batch_rows', results.length);
    Sentry.metrics.count('calendar_reservation_batch_conflicted', conflicted);
    this.logger.log({
      event: 'calendar_reservation_batch_completed',
      organizationId,
      count: results.length,
      replayed: results.filter((result) => result.replayed).length,
      conflicted,
    });
    return results.map((result) => ({
      ...result,
      conflicted: result.reservation.state === 'CONFLICTED',
    }));
  }

  async transition(input: {
    organizationId: string;
    reservationId: string;
    expectedRevision: number;
    to: CalendarReservationState;
    code: string;
    reason: string;
    outcomeClass?: BulkCampaignIssueClass;
    actor: AcquireCalendarReservation['actor'];
    now?: Date;
    allowPinnedTerminal?: boolean;
  }) {
    this.assertEnabled('authoritative');
    const current = await this._repository.get(
      input.organizationId,
      input.reservationId
    );
    if (!current) {
      throw classifiedException(
        HttpStatus.NOT_FOUND,
        'data_problem',
        'calendar_reservation_not_found',
        'The calendar reservation does not exist in this workspace.'
      );
    }
    if (!canTransitionReservation(current.state, input.to)) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'calendar_reservation_transition_invalid',
        reason: `Reservation state ${current.state} cannot transition to ${input.to}.`,
      });
    }
    if (
      current.pinned &&
      ['RELEASED', 'CANCELLED'].includes(input.to) &&
      !input.allowPinnedTerminal
    ) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'calendar_pinned_reservation_immutable',
        reason:
          'Published or manually pinned calendar reservations cannot be released by ordinary replanning.',
      });
    }
    if (!input.code?.trim() || !input.reason?.trim()) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_outcome_required',
        'Every reservation transition requires a stable code and human reason.'
      );
    }
    const reservation = await this._repository.transition({
      ...input,
      from: [current.state],
      now: input.now || new Date(),
    });
    if (!reservation) {
      throw new ConflictException({
        failureClass: 'recoverable',
        code: CALENDAR_RESERVATION_CODES.REVISION_CONFLICT,
        reason:
          'The reservation changed concurrently. Reload it before retrying the transition.',
      });
    }
    Sentry.metrics.count('calendar_reservation_transitioned', 1);
    this.logger.log({
      event: 'calendar_reservation_transitioned',
      organizationId: input.organizationId,
      reservationId: reservation.id,
      state: reservation.state,
      revision: reservation.revision,
      code: reservation.outcomeCode,
    });
    return reservation;
  }

  async list(input: {
    organizationId: string;
    mode?: string;
    state?: string;
    cursor?: string;
    limit?: unknown;
  }) {
    const mode = input.mode
      ? (input.mode.toUpperCase() as CalendarReservationMode)
      : undefined;
    const state = input.state
      ? (input.state.toUpperCase() as CalendarReservationState)
      : undefined;
    if (mode && !['SHADOW', 'AUTHORITATIVE'].includes(mode)) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_mode_invalid',
        'Reservation mode must be SHADOW or AUTHORITATIVE.'
      );
    }
    if (
      state &&
      !['HELD', 'COMMITTED', 'RELEASED', 'CANCELLED', 'CONFLICTED'].includes(
        state
      )
    ) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        'calendar_reservation_state_invalid',
        'Reservation state is not recognized.'
      );
    }
    let cursor;
    let limit;
    try {
      cursor = decodeReservationCursor(input.cursor);
      limit = boundedReservationLimit(input.limit);
    } catch (error) {
      throw classifiedException(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        error instanceof Error
          ? error.message
          : 'calendar_reservation_query_invalid',
        'The reservation cursor or limit is invalid.'
      );
    }
    const page = await this._repository.list({
      organizationId: input.organizationId,
      mode,
      state,
      cursor,
      limit,
    });
    const last = page.items.length
      ? page.items[page.items.length - 1]
      : undefined;
    return {
      items: page.items,
      nextCursor:
        page.hasMore && last
          ? encodeReservationCursor({
              scheduledAt: last.scheduledAt,
              id: last.id,
            })
          : null,
    };
  }

  getBackfill(organizationId: string) {
    return this._repository.getBackfill(organizationId);
  }

  async runBackfillBatch(organizationId: string, requestedLimit?: unknown) {
    this.assertEnabled('shadow');
    const limit = boundedReservationLimit(requestedLimit ?? 500, 1000);
    await this._repository.initializeBackfill(organizationId);
    const result = await this._repository.backfillNextBatch(
      organizationId,
      limit
    );
    Sentry.metrics.count('calendar_backfill_rows_scanned', result.processed);
    Sentry.metrics.count('calendar_backfill_rows_inserted', result.inserted);
    this.logger.log({
      event: 'calendar_backfill_batch_completed',
      organizationId,
      processed: result.processed,
      inserted: result.inserted,
      replayed: result.replayed,
      state: result.backfill?.state,
      code: result.backfill?.outcomeCode,
    });
    return result;
  }

  async verifyBackfill(organizationId: string) {
    this.assertEnabled('shadow');
    const result = await this._repository.verifyBackfill(organizationId);
    if (!result) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'calendar_backfill_not_ready',
        reason:
          'The tenant backfill must reach VERIFYING before it can be verified.',
      });
    }
    Sentry.metrics.count(
      result.backfill.state === 'VERIFIED'
        ? 'calendar_backfill_verified'
        : 'calendar_backfill_failed',
      1
    );
    this.logger[result.backfill.state === 'VERIFIED' ? 'log' : 'error']({
      event:
        result.backfill.state === 'VERIFIED'
          ? 'calendar_backfill_verified'
          : 'calendar_backfill_failed',
      organizationId,
      backfillId: result.backfill.id,
      state: result.backfill.state,
      code: result.backfill.outcomeCode,
      reason: result.backfill.outcomeReason,
      counts: result.counts,
    });
    return result;
  }

  async promoteAuthorityBatch(
    organizationId: string,
    requestedLimit: unknown,
    actor: AcquireCalendarReservation['actor']
  ) {
    this.assertEnabled('shadow');
    const limit = boundedReservationLimit(requestedLimit ?? 250, 500);
    try {
      const result = await this._repository.promoteAuthorityBatch(
        organizationId,
        limit,
        actor
      );
      Sentry.metrics.count('calendar_authority_rows_promoted', result.promoted);
      Sentry.metrics.count(
        'calendar_authority_promotion_conflicted',
        result.conflicted
      );
      if (result.activated) {
        Sentry.metrics.count('calendar_authority_activated', 1);
      }
      this.logger[result.conflicted ? 'warn' : 'log']({
        event: result.activated
          ? 'calendar_authority_activated'
          : 'calendar_authority_batch_completed',
        organizationId,
        processed: result.processed,
        promoted: result.promoted,
        replayed: result.replayed,
        conflicted: result.conflicted,
        missing: result.missing,
        activated: result.activated,
      });
      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'calendar_backfill_not_verified'
      ) {
        throw classifiedException(
          HttpStatus.CONFLICT,
          'data_problem',
          CALENDAR_RESERVATION_CODES.WRITER_NOT_VERIFIED,
          'Verify the workspace shadow backfill before authoritative promotion.'
        );
      }
      throw error;
    }
  }
}
