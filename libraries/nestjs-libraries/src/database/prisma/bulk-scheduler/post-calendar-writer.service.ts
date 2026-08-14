import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CalendarReservationMode, CreationMethod } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import {
  assertReservationLocalIntent,
  CALENDAR_RESERVATION_CODES,
  utcBackfillLocalIntent,
} from '@gitroom/helpers/bulk-scheduler/calendar-reservation.contract';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { CalendarReservationService } from './calendar-reservation.service';
import {
  CalendarReservationRepository,
  PostCalendarIntent,
  ReservationActor,
} from './calendar-reservation.repository';

export type CalendarLocalIntent = {
  localScheduledAt: string;
  timezone: string;
  utcOffsetMinutes: number;
  dstFold?: number | null;
};

export type PreparedPostCalendarWrite = PostCalendarIntent & {
  mode: CalendarReservationMode;
  reservationId?: string;
  campaignHandoff?: {
    campaignJobId: string;
  };
};

function classified(
  status: number,
  failureClass: 'recoverable' | 'user_action_needed' | 'data_problem',
  code: string,
  reason: string,
  details?: Record<string, unknown>
) {
  return new HttpException(
    { failureClass, code, reason, ...(details || {}) },
    status
  );
}

function writerName(method: CreationMethod) {
  return `posts_service:${method.toLowerCase()}`;
}

@Injectable()
export class PostCalendarWriterService {
  private readonly logger = new Logger(PostCalendarWriterService.name);

  constructor(
    private _reservations: CalendarReservationService,
    private _repository: CalendarReservationRepository
  ) {}

  normalizeIntent(
    scheduledAt: Date,
    supplied?: CalendarLocalIntent
  ): CalendarLocalIntent {
    const intent = supplied || utcBackfillLocalIntent(scheduledAt);
    try {
      assertReservationLocalIntent({ scheduledAt, ...intent });
    } catch (error) {
      throw classified(
        HttpStatus.BAD_REQUEST,
        'data_problem',
        error instanceof Error
          ? error.message
          : 'calendar_local_intent_invalid',
        'UTC schedule, timezone, local wall-clock intent, offset, or DST fold is invalid.'
      );
    }
    return intent;
  }

  private baseInput(input: {
    organizationId: string;
    integrationId: string;
    postId: string;
    scheduledAt: Date;
    localIntent?: CalendarLocalIntent;
    creationMethod: CreationMethod;
    source: string;
    actor?: ReservationActor;
    pinned?: boolean;
    operationKey?: string;
  }): PostCalendarIntent {
    const local = this.normalizeIntent(input.scheduledAt, input.localIntent);
    const intentFingerprint = sha256(
      JSON.stringify({
        integrationId: input.integrationId,
        scheduledAt: input.scheduledAt.toISOString(),
        ...local,
        source: input.source,
        operationKey: input.operationKey || null,
      })
    ).slice(0, 24);
    return {
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      postId: input.postId,
      scheduledAt: input.scheduledAt,
      ...local,
      source: input.source,
      writer: writerName(input.creationMethod),
      pinned: input.pinned,
      idempotencyKey: `post-calendar:${input.postId}:${intentFingerprint}`,
      actor: input.actor || { actorType: 'system' },
      metadata: {
        creationMethod: input.creationMethod,
        operationKey: input.operationKey || null,
      },
    };
  }

  async prepareCreate(
    input: Parameters<PostCalendarWriterService['baseInput']>[0]
  ) {
    let base = this.baseInput(input);
    const mode = await this._reservations.resolveWriterMode(
      input.organizationId
    );
    if (mode === 'SHADOW') return { ...base, mode };
    const latest = await this._repository.getLatestPostReservation(
      input.organizationId,
      input.postId
    );
    const ownerRevision = latest
      ? latest.state === 'HELD'
        ? latest.ownerRevision
        : latest.ownerRevision + 1
      : 1;
    if (latest?.state === 'HELD') {
      base = { ...base, idempotencyKey: latest.idempotencyKey };
    } else if (latest) {
      base = {
        ...base,
        idempotencyKey: `${base.idempotencyKey}:r${ownerRevision}`,
      };
    }
    const result = await this._reservations.acquire({
      ...base,
      ownerType: 'POST',
      ownerId: input.postId,
      postId: undefined,
      revision: ownerRevision,
      state: 'HELD',
      leaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    if (result.conflicted) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: CALENDAR_RESERVATION_CODES.CONFLICTED,
        reason: result.reservation.outcomeReason,
        reservationId: result.reservation.id,
      });
    }
    if (result.reservation.state !== 'HELD') {
      throw classified(
        HttpStatus.CONFLICT,
        'data_problem',
        'calendar_post_creation_attempt_terminal',
        'The prior post-creation calendar attempt is terminal. Retry with the same stable Post identity to create a new attempt.',
        { reservationId: result.reservation.id }
      );
    }
    return {
      ...base,
      mode,
      reservationId: result.reservation.id,
    };
  }

  async prepareCampaignHandoff(
    input: Parameters<PostCalendarWriterService['baseInput']>[0] & {
      campaignJobId: string;
      reservationId: string;
      claimTokenHash: string;
    }
  ): Promise<PreparedPostCalendarWrite> {
    const base = this.baseInput(input);
    const mode = await this._reservations.resolveWriterMode(
      input.organizationId
    );
    if (mode !== 'AUTHORITATIVE') {
      throw classified(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_campaign_handoff_requires_authority',
        'Bulk Scheduler materialization requires the authoritative reservation ledger.'
      );
    }
    const result = await this._repository.handoffCampaignReservation({
      organizationId: input.organizationId,
      campaignJobId: input.campaignJobId,
      reservationId: input.reservationId,
      postId: input.postId,
      claimTokenHash: input.claimTokenHash,
      postIntent: base,
      leaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    return {
      ...base,
      mode,
      reservationId: result.reservation.id,
      campaignHandoff: { campaignJobId: input.campaignJobId },
    };
  }

  async finalizeCreate(prepared: PreparedPostCalendarWrite) {
    try {
      const reservation =
        prepared.mode === 'AUTHORITATIVE'
          ? await this._repository.attachHeldPost({
              organizationId: prepared.organizationId,
              reservationId: prepared.reservationId!,
              postId: prepared.postId,
              actor: prepared.actor,
            })
          : (await this._repository.mirrorPost(prepared)).reservation;
      Sentry.metrics.count('calendar_writer_finalized', 1, {
        attributes: { mode: prepared.mode },
      });
      return reservation;
    } catch (error) {
      this.rethrowWriterFailure(error, prepared, 'finalize');
    }
  }

  async abortUnmaterialized(
    prepared: PreparedPostCalendarWrite,
    reason: string
  ) {
    if (prepared.mode !== 'AUTHORITATIVE' || !prepared.reservationId) return;
    try {
      if (prepared.campaignHandoff) {
        await this._repository.rollbackCampaignHandoff({
          organizationId: prepared.organizationId,
          campaignJobId: prepared.campaignHandoff.campaignJobId,
          reservationId: prepared.reservationId,
          postId: prepared.postId,
          reason,
          actor: prepared.actor,
        });
        return;
      }
      const current = await this._repository.get(
        prepared.organizationId,
        prepared.reservationId
      );
      if (!current || current.state !== 'HELD') return;
      await this._reservations.transition({
        organizationId: prepared.organizationId,
        reservationId: prepared.reservationId,
        expectedRevision: current.revision,
        to: 'RELEASED',
        code: CALENDAR_RESERVATION_CODES.WRITER_ABORTED,
        reason: reason.slice(0, 1000) || 'Post materialization failed.',
        outcomeClass: 'failed',
        actor: prepared.actor,
      });
    } catch (error) {
      this.logger.error({
        event: 'calendar_writer_abort_failed',
        organizationId: prepared.organizationId,
        postId: prepared.postId,
        reservationId: prepared.reservationId,
        code: 'calendar_writer_abort_failed',
        reason: error instanceof Error ? error.message : String(error),
      });
      throw classified(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        'calendar_writer_abort_failed',
        'Post creation failed and Publishly could not durably release its calendar hold; retry is required.',
        { reservationId: prepared.reservationId }
      );
    }
  }

  async ensurePost(
    input: Parameters<PostCalendarWriterService['baseInput']>[0]
  ) {
    const mode = await this._reservations.resolveWriterMode(
      input.organizationId
    );
    const current = await this._repository.getCurrentPostReservation({
      organizationId: input.organizationId,
      postId: input.postId,
      integrationId: input.integrationId,
      scheduledAt: input.scheduledAt,
      mode,
    });
    let effective = input;
    if (!input.localIntent) {
      if (
        current &&
        ['HELD', 'COMMITTED'].includes(current.state) &&
        current.integrationId === input.integrationId &&
        current.scheduledAt.getTime() === input.scheduledAt.getTime()
      ) {
        effective = {
          ...input,
          localIntent: {
            localScheduledAt: current.localScheduledAt,
            timezone: current.timezone,
            utcOffsetMinutes: current.utcOffsetMinutes,
            dstFold: current.dstFold,
          },
        };
      }
    }
    const base = this.baseInput(effective);
    if (mode === 'SHADOW') {
      return this._repository.mirrorPost(base);
    }
    if (current?.state === 'HELD' && !current.postId) {
      return {
        reservation: await this._repository.attachHeldPost({
          organizationId: input.organizationId,
          reservationId: current.id,
          postId: input.postId,
          actor: base.actor,
        }),
        replayed: true as const,
      };
    }
    const cutover = await this._repository.getWriterCutover(
      input.organizationId
    );
    if (!cutover?.authorityActivatedAt) {
      throw classified(
        HttpStatus.SERVICE_UNAVAILABLE,
        'recoverable',
        CALENDAR_RESERVATION_CODES.AUTHORITY_NOT_READY,
        'The authoritative calendar cutover is not active for this workspace.'
      );
    }
    return this._repository.reschedulePost({
      ...base,
      mode,
      action: 'update',
    });
  }

  async reschedule(
    input: Parameters<PostCalendarWriterService['baseInput']>[0] & {
      action: 'schedule' | 'update';
      allowPinnedMove?: boolean;
    }
  ) {
    const base = this.baseInput(input);
    const mode = await this._reservations.resolveWriterMode(
      input.organizationId
    );
    try {
      const result = await this._repository.reschedulePost({
        ...base,
        mode,
        action: input.action,
        allowPinnedMove: input.allowPinnedMove,
      });
      if (result.reservation.state === 'CONFLICTED') {
        throw new ConflictException({
          failureClass: 'data_problem',
          code: CALENDAR_RESERVATION_CODES.CONFLICTED,
          reason: result.reservation.outcomeReason,
          reservationId: result.reservation.id,
        });
      }
      return result.post;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.rethrowWriterFailure(error, base, 'reschedule');
    }
  }

  async cancelGroup(input: {
    organizationId: string;
    group: string;
    actor?: ReservationActor;
  }) {
    await this._reservations.resolveWriterMode(input.organizationId);
    try {
      return await this._repository.cancelPostGroup({
        organizationId: input.organizationId,
        group: input.group,
        actor: input.actor || { actorType: 'system' },
      });
    } catch (error) {
      this.rethrowWriterFailure(
        error,
        {
          organizationId: input.organizationId,
          postId: 'group',
          integrationId: 'unknown',
        },
        'cancel'
      );
    }
  }

  private rethrowWriterFailure(
    error: unknown,
    context: {
      organizationId: string;
      postId: string;
      integrationId: string;
    },
    operation: string
  ): never {
    if (error instanceof HttpException) throw error;
    const code =
      error instanceof Error &&
      [
        'calendar_post_not_found',
        'calendar_post_reservation_mismatch',
        'calendar_pinned_reservation_immutable',
      ].includes(error.message)
        ? error.message
        : 'calendar_writer_unavailable';
    const status =
      code === 'calendar_post_not_found'
        ? HttpStatus.NOT_FOUND
        : code === 'calendar_writer_unavailable'
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.CONFLICT;
    const failureClass =
      code === 'calendar_writer_unavailable'
        ? ('recoverable' as const)
        : ('data_problem' as const);
    const reason =
      code === 'calendar_pinned_reservation_immutable'
        ? 'A published or manually pinned calendar slot cannot be moved without an explicit republish action.'
        : code === 'calendar_post_not_found'
        ? 'The post does not exist in this workspace.'
        : code === 'calendar_post_reservation_mismatch'
        ? 'The post and requested account calendar intent do not agree.'
        : 'Publishly could not durably apply the post calendar mutation. No workflow was started.';
    Sentry.metrics.count('calendar_writer_failed', 1, {
      attributes: { operation, code },
    });
    this.logger.error({
      event: 'calendar_writer_failed',
      operation,
      organizationId: context.organizationId,
      postId: context.postId,
      integrationId: context.integrationId,
      failureClass,
      code,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw classified(status, failureClass, code, reason);
  }
}
