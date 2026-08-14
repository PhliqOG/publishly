import { Injectable } from '@nestjs/common';
import {
  BulkCampaignIssueClass,
  CalendarReservationMode,
  CalendarReservationOwnerType,
  CalendarReservationState,
  Prisma,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  CALENDAR_RESERVATION_CODES,
  calendarReservationRequestHash,
  deterministicBackfillId,
  deterministicReservationId,
  reservationAdvisoryLockKeys,
  reservationOwnerLockKeys,
  reservationTenantCutoverLockKeys,
  utcBackfillLocalIntent,
} from '@gitroom/helpers/bulk-scheduler/calendar-reservation.contract';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { cancelCalendarReservationsInTransaction } from './calendar-reservation.mutation';

const LEGACY_BACKFILL_SOURCE = 'legacy_post_backfill_v1';

export type ReservationActor = {
  userId?: string;
  actorType?: 'user' | 'apikey' | 'system';
};

export type AcquireCalendarReservation = {
  organizationId: string;
  integrationId: string;
  ownerType: CalendarReservationOwnerType;
  ownerId: string;
  postId?: string;
  campaignId?: string;
  source: string;
  writer: string;
  scheduledAt: Date;
  localScheduledAt: string;
  timezone: string;
  utcOffsetMinutes: number;
  dstFold?: number | null;
  pinned?: boolean;
  revision: number;
  idempotencyKey: string;
  state: Extract<CalendarReservationState, 'HELD' | 'COMMITTED'>;
  leaseExpiresAt?: Date;
  metadata?: Prisma.InputJsonValue;
  actor: ReservationActor;
};

export type PostCalendarIntent = {
  organizationId: string;
  integrationId: string;
  postId: string;
  source: string;
  writer: string;
  scheduledAt: Date;
  localScheduledAt: string;
  timezone: string;
  utcOffsetMinutes: number;
  dstFold?: number | null;
  pinned?: boolean;
  idempotencyKey: string;
  actor: ReservationActor;
  metadata?: Prisma.InputJsonValue;
};

function auditId(action: string, ...parts: string[]) {
  return `cal_audit_${sha256([action, ...parts].join(':')).slice(0, 40)}`;
}

function auditData(input: {
  id: string;
  organizationId: string;
  actor: ReservationActor;
  action: string;
  targetId: string;
  metadata: Record<string, unknown>;
}) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    userId: input.actor.userId,
    actorType: input.actor.actorType || 'system',
    action: input.action,
    targetType: 'CalendarReservation',
    targetId: input.targetId,
    metadata: JSON.stringify(input.metadata),
  };
}

function requestProjection(input: AcquireCalendarReservation) {
  return {
    integrationId: input.integrationId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    postId: input.postId || null,
    campaignId: input.campaignId || null,
    source: input.source,
    scheduledAt: input.scheduledAt.toISOString(),
    localScheduledAt: input.localScheduledAt,
    timezone: input.timezone,
    utcOffsetMinutes: input.utcOffsetMinutes,
    dstFold: input.dstFold ?? null,
    pinned: !!input.pinned,
    ownerRevision: input.revision,
    state: input.state,
  };
}

@Injectable()
export class CalendarReservationRepository {
  constructor(
    private _db: PrismaRepository<
      | 'calendarReservation'
      | 'calendarReservationBackfill'
      | 'post'
      | 'integration'
      | 'bulkCampaignJob'
    >,
    private _transaction: PrismaTransaction
  ) {}

  private async lockTenantWriter(
    tx: Prisma.TransactionClient,
    organizationId: string,
    exclusive = false
  ) {
    const [one, two] = reservationTenantCutoverLockKeys(organizationId);
    if (exclusive) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${one}::int, ${two}::int)`
      );
      return;
    }
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock_shared(${one}::int, ${two}::int)`
    );
  }

  private async lockPostOwner(
    tx: Prisma.TransactionClient,
    organizationId: string,
    postId: string
  ) {
    const [one, two] = reservationOwnerLockKeys({
      organizationId,
      ownerType: 'POST',
      ownerId: postId,
    });
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${one}::int, ${two}::int)`
    );
  }

  get(organizationId: string, reservationId: string) {
    return this._db.model.calendarReservation.findFirst({
      where: { id: reservationId, organizationId },
    });
  }

  getLatestPostReservation(organizationId: string, postId: string) {
    return this._db.model.calendarReservation.findFirst({
      where: {
        organizationId,
        ownerType: 'POST',
        ownerId: postId,
      },
      orderBy: [{ ownerRevision: 'desc' }, { createdAt: 'desc' }],
    });
  }

  getCurrentPostReservation(input: {
    organizationId: string;
    postId: string;
    integrationId: string;
    scheduledAt: Date;
    mode?: CalendarReservationMode;
  }) {
    return this._db.model.calendarReservation.findFirst({
      where: {
        organizationId: input.organizationId,
        ownerType: 'POST',
        ownerId: input.postId,
        integrationId: input.integrationId,
        scheduledAt: input.scheduledAt,
        ...(input.mode ? { mode: input.mode } : {}),
        state: { in: ['HELD', 'COMMITTED'] },
      },
      orderBy: [{ ownerRevision: 'desc' }, { createdAt: 'desc' }],
    });
  }

  handoffCampaignReservation(input: {
    organizationId: string;
    campaignJobId: string;
    reservationId: string;
    postId: string;
    claimTokenHash: string;
    postIntent: PostCalendarIntent;
    leaseExpiresAt: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.bulkCampaignJob.findFirst({
        where: {
          id: input.campaignJobId,
          organizationId: input.organizationId,
          reservationId: input.reservationId,
          state: 'MATERIALIZING',
          claimTokenHash: input.claimTokenHash,
          leaseExpiresAt: { gt: new Date() },
        },
      });
      if (!job) throw new Error('calendar_campaign_handoff_claim_invalid');
      const current = await tx.calendarReservation.findFirst({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
        },
      });
      if (!current) throw new Error('calendar_campaign_handoff_not_found');
      if (
        current.ownerType === 'POST' &&
        current.ownerId === input.postId &&
        current.state === 'HELD' &&
        current.integrationId === job.integrationId &&
        current.scheduledAt.getTime() === job.scheduledAt?.getTime()
      ) {
        return { reservation: current, replayed: true as const };
      }
      if (
        current.ownerType !== 'BULK_CAMPAIGN_SLOT' ||
        current.ownerId !== job.id ||
        current.campaignId !== job.campaignId ||
        current.state !== 'COMMITTED' ||
        current.mode !== 'AUTHORITATIVE' ||
        current.integrationId !== job.integrationId ||
        current.scheduledAt.getTime() !== job.scheduledAt?.getTime()
      ) {
        throw new Error('calendar_campaign_handoff_mismatch');
      }
      const requestHash = sha256(
        JSON.stringify({
          postId: input.postId,
          integrationId: input.postIntent.integrationId,
          scheduledAt: input.postIntent.scheduledAt.toISOString(),
          localScheduledAt: input.postIntent.localScheduledAt,
          timezone: input.postIntent.timezone,
          utcOffsetMinutes: input.postIntent.utcOffsetMinutes,
          dstFold: input.postIntent.dstFold ?? null,
          campaignJobId: job.id,
        })
      );
      const changed = await tx.calendarReservation.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          revision: current.revision,
          ownerType: 'BULK_CAMPAIGN_SLOT',
          ownerId: job.id,
          state: 'COMMITTED',
        },
        data: {
          ownerType: 'POST',
          ownerId: input.postId,
          postId: null,
          source: input.postIntent.source,
          writer: input.postIntent.writer,
          state: 'HELD',
          localScheduledAt: input.postIntent.localScheduledAt,
          timezone: input.postIntent.timezone,
          utcOffsetMinutes: input.postIntent.utcOffsetMinutes,
          dstFold: input.postIntent.dstFold,
          idempotencyKey: `post-calendar:${input.postId}:campaign-handoff`,
          requestHash,
          outcomeClass: null,
          outcomeCode: 'calendar_campaign_handed_to_post',
          outcomeReason:
            'The committed campaign slot is held by its deterministic Post during materialization.',
          leaseExpiresAt: input.leaseExpiresAt,
          revision: { increment: 1 },
          metadata: {
            campaignId: job.campaignId,
            campaignJobId: job.id,
            priorOwnerType: 'BULK_CAMPAIGN_SLOT',
            creationMethod: 'API',
          },
        },
      });
      if (changed.count !== 1) {
        throw new Error('calendar_campaign_handoff_race');
      }
      const reservation = await tx.calendarReservation.findUniqueOrThrow({
        where: { id: current.id },
      });
      await tx.auditLog.upsert({
        where: {
          id: auditId('calendar.campaign-handoff', job.id, input.postId),
        },
        create: auditData({
          id: auditId('calendar.campaign-handoff', job.id, input.postId),
          organizationId: input.organizationId,
          actor: input.postIntent.actor,
          action: 'calendar.campaign-handoff',
          targetId: reservation.id,
          metadata: {
            campaignId: job.campaignId,
            campaignJobId: job.id,
            postId: input.postId,
            scheduledAt: reservation.scheduledAt.toISOString(),
          },
        }),
        update: {},
      });
      return { reservation, replayed: false as const };
    });
  }

  rollbackCampaignHandoff(input: {
    organizationId: string;
    campaignJobId: string;
    reservationId: string;
    postId: string;
    reason: string;
    actor: ReservationActor;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.bulkCampaignJob.findFirst({
        where: {
          id: input.campaignJobId,
          organizationId: input.organizationId,
          reservationId: input.reservationId,
        },
      });
      if (!job) throw new Error('calendar_campaign_handoff_job_not_found');
      const reservation = await tx.calendarReservation.findFirst({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
        },
      });
      if (!reservation) throw new Error('calendar_campaign_handoff_not_found');
      if (
        reservation.ownerType === 'BULK_CAMPAIGN_SLOT' &&
        reservation.ownerId === job.id &&
        reservation.state === 'COMMITTED'
      ) {
        return reservation;
      }
      if (
        reservation.ownerType !== 'POST' ||
        reservation.ownerId !== input.postId ||
        reservation.postId ||
        reservation.state !== 'HELD' ||
        reservation.campaignId !== job.campaignId
      ) {
        throw new Error('calendar_campaign_handoff_rollback_invalid');
      }
      const changed = await tx.calendarReservation.updateMany({
        where: {
          id: reservation.id,
          organizationId: input.organizationId,
          revision: reservation.revision,
          ownerType: 'POST',
          ownerId: input.postId,
          postId: null,
          state: 'HELD',
        },
        data: {
          ownerType: 'BULK_CAMPAIGN_SLOT',
          ownerId: job.id,
          state: 'COMMITTED',
          source: 'bulk_scheduler_v1',
          writer: 'bulk_campaign_execution',
          leaseExpiresAt: null,
          idempotencyKey: `bulk-slot:${job.id}:handoff-restored`,
          requestHash: sha256(
            JSON.stringify({
              campaignId: job.campaignId,
              campaignJobId: job.id,
              integrationId: job.integrationId,
              scheduledAt: job.scheduledAt?.toISOString(),
              restoredFromPostId: input.postId,
            })
          ),
          revision: { increment: 1 },
          outcomeClass: 'failed',
          outcomeCode: 'calendar_campaign_handoff_restored',
          outcomeReason:
            input.reason.slice(0, 1_000) ||
            'Post materialization failed; the campaign slot was restored.',
          metadata: {
            campaignId: job.campaignId,
            campaignJobId: job.id,
            failedPostId: input.postId,
          },
        },
      });
      if (changed.count !== 1) {
        throw new Error('calendar_campaign_handoff_rollback_race');
      }
      const restored = await tx.calendarReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId(
            'calendar.campaign-handoff-restored',
            job.id,
            String(restored.revision)
          ),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'calendar.campaign-handoff-restored',
          targetId: restored.id,
          metadata: {
            campaignId: job.campaignId,
            campaignJobId: job.id,
            failedPostId: input.postId,
            reason: input.reason.slice(0, 1_000),
          },
        }),
      });
      return restored;
    });
  }

  getBackfill(organizationId: string) {
    return this._db.model.calendarReservationBackfill.findUnique({
      where: {
        organizationId_source: {
          organizationId,
          source: LEGACY_BACKFILL_SOURCE,
        },
      },
    });
  }

  async list(input: {
    organizationId: string;
    mode?: CalendarReservationMode;
    state?: CalendarReservationState;
    cursor: { scheduledAt: Date; id: string } | null;
    limit: number;
  }) {
    const rows = await this._db.model.calendarReservation.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor
          ? {
              OR: [
                { scheduledAt: { gt: input.cursor.scheduledAt } },
                {
                  scheduledAt: input.cursor.scheduledAt,
                  id: { gt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async acquire(input: AcquireCalendarReservation) {
    const requestHash = calendarReservationRequestHash(
      requestProjection(input)
    );
    const id = deterministicReservationId(
      input.organizationId,
      input.idempotencyKey
    );
    return this._transaction.model.$transaction(async (tx) => {
      await this.lockTenantWriter(tx, input.organizationId);
      const replay = await tx.calendarReservation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (
        replay &&
        !(
          replay.state === 'HELD' &&
          replay.leaseExpiresAt &&
          replay.leaseExpiresAt <= new Date() &&
          input.state === 'HELD'
        )
      ) {
        return { reservation: replay, replayed: true as const, requestHash };
      }

      const integration = await tx.integration.findFirst({
        where: {
          id: input.integrationId,
          organizationId: input.organizationId,
          deletedAt: null,
          disabled: false,
        },
        select: { id: true },
      });
      if (!integration) throw new Error('calendar_integration_not_found');

      const [lockOne, lockTwo] = reservationAdvisoryLockKeys(input);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(${lockOne}::int, ${lockTwo}::int)`
      );

      const afterLockReplay = await tx.calendarReservation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (afterLockReplay) {
        if (
          afterLockReplay.state === 'HELD' &&
          afterLockReplay.leaseExpiresAt &&
          afterLockReplay.leaseExpiresAt <= new Date() &&
          input.state === 'HELD' &&
          input.leaseExpiresAt
        ) {
          const renewed = await tx.calendarReservation.update({
            where: { id: afterLockReplay.id },
            data: {
              leaseExpiresAt: input.leaseExpiresAt,
              revision: { increment: 1 },
              outcomeClass: null,
              outcomeCode: CALENDAR_RESERVATION_CODES.HELD,
              outcomeReason:
                'The same idempotent post-creation intent renewed its expired hold before materialization.',
            },
          });
          return { reservation: renewed, replayed: true as const, requestHash };
        }
        return {
          reservation: afterLockReplay,
          replayed: true as const,
          requestHash,
        };
      }

      const now = new Date();
      await tx.calendarReservation.updateMany({
        where: {
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          scheduledAt: input.scheduledAt,
          mode: 'AUTHORITATIVE',
          state: 'HELD',
          leaseExpiresAt: { lte: now },
        },
        data: {
          state: 'RELEASED',
          leaseExpiresAt: null,
          releasedAt: now,
          outcomeCode: 'calendar_reservation_lease_expired',
          outcomeReason: 'The abandoned calendar reservation hold expired.',
          revision: { increment: 1 },
        },
      });

      const conflict = await tx.calendarReservation.findFirst({
        where: {
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          scheduledAt: input.scheduledAt,
          mode: 'AUTHORITATIVE',
          state: { in: ['HELD', 'COMMITTED'] },
        },
        select: { id: true, ownerType: true, ownerId: true },
      });
      const conflicted = !!conflict;
      const reservation = await tx.calendarReservation.create({
        data: {
          id,
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          postId: input.postId,
          campaignId: input.campaignId,
          source: input.source,
          writer: input.writer,
          mode: 'AUTHORITATIVE',
          state: conflicted ? 'CONFLICTED' : input.state,
          scheduledAt: input.scheduledAt,
          localScheduledAt: input.localScheduledAt,
          timezone: input.timezone,
          utcOffsetMinutes: input.utcOffsetMinutes,
          dstFold: input.dstFold,
          pinned: input.pinned,
          ownerRevision: input.revision,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          outcomeClass: conflicted ? 'conflicted' : undefined,
          outcomeCode: conflicted
            ? CALENDAR_RESERVATION_CODES.CONFLICTED
            : input.state === 'HELD'
            ? CALENDAR_RESERVATION_CODES.HELD
            : CALENDAR_RESERVATION_CODES.COMMITTED,
          outcomeReason: conflicted
            ? `The account calendar slot is already owned by reservation ${conflict.id}.`
            : input.state === 'HELD'
            ? 'The account calendar slot is held transactionally.'
            : 'The account calendar slot is committed transactionally.',
          leaseExpiresAt: conflicted ? undefined : input.leaseExpiresAt,
          metadata: input.metadata,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId('calendar.reservation.created', reservation.id),
          organizationId: input.organizationId,
          actor: input.actor,
          action: conflicted
            ? 'calendar.reservation.conflicted'
            : 'calendar.reservation.created',
          targetId: reservation.id,
          metadata: {
            integrationId: input.integrationId,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            scheduledAt: input.scheduledAt.toISOString(),
            state: reservation.state,
            conflictReservationId: conflict?.id,
          },
        }),
      });
      return { reservation, replayed: false as const, requestHash };
    });
  }

  async acquireBatch(inputs: AcquireCalendarReservation[]) {
    if (!inputs.length || inputs.length > 500) {
      throw new Error('calendar_reservation_batch_size_invalid');
    }
    const organizationId = inputs[0].organizationId;
    if (inputs.some((input) => input.organizationId !== organizationId)) {
      throw new Error('calendar_reservation_batch_tenant_mismatch');
    }
    const projections = inputs.map((input) => ({
      input,
      requestHash: calendarReservationRequestHash(requestProjection(input)),
      id: deterministicReservationId(
        input.organizationId,
        input.idempotencyKey
      ),
    }));
    return this._transaction.model.$transaction(
      async (tx) => {
        await this.lockTenantWriter(tx, organizationId);
        const integrationIds = [
          ...new Set(inputs.map((input) => input.integrationId)),
        ];
        const integrations = await tx.integration.findMany({
          where: {
            id: { in: integrationIds },
            organizationId,
            deletedAt: null,
            disabled: false,
          },
          select: { id: true },
        });
        if (integrations.length !== integrationIds.length) {
          throw new Error('calendar_integration_not_found');
        }

        const lockKeys = new Map<string, readonly [number, number]>();
        for (const input of inputs) {
          const pair = reservationAdvisoryLockKeys(input);
          lockKeys.set(`${pair[0]}:${pair[1]}`, pair);
        }
        const orderedLocks = [...lockKeys.values()].sort(
          (left, right) => left[0] - right[0] || left[1] - right[1]
        );
        const lockRows = orderedLocks.map(
          ([one, two]) => Prisma.sql`(${one}::int, ${two}::int)`
        );
        await tx.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(keys.one, keys.two)
          FROM (
            SELECT raw.one, raw.two
            FROM (VALUES ${Prisma.join(lockRows)}) AS raw(one, two)
            ORDER BY raw.one, raw.two
          ) AS keys
        `);

        const existing = await tx.calendarReservation.findMany({
          where: {
            organizationId,
            idempotencyKey: {
              in: inputs.map((input) => input.idempotencyKey),
            },
          },
        });
        const existingByKey = new Map(
          existing.map((reservation) => [
            reservation.idempotencyKey,
            reservation,
          ])
        );
        const pending = projections.filter(
          ({ input }) => !existingByKey.has(input.idempotencyKey)
        );

        if (pending.length) {
          const now = new Date();
          await tx.calendarReservation.updateMany({
            where: {
              organizationId,
              mode: 'AUTHORITATIVE',
              state: 'HELD',
              leaseExpiresAt: { lte: now },
              OR: pending.map(({ input }) => ({
                integrationId: input.integrationId,
                scheduledAt: input.scheduledAt,
              })),
            },
            data: {
              state: 'RELEASED',
              leaseExpiresAt: null,
              releasedAt: now,
              outcomeCode: 'calendar_reservation_lease_expired',
              outcomeReason: 'The abandoned calendar reservation hold expired.',
              revision: { increment: 1 },
            },
          });
          const active = await tx.calendarReservation.findMany({
            where: {
              organizationId,
              mode: 'AUTHORITATIVE',
              state: { in: ['HELD', 'COMMITTED'] },
              OR: pending.map(({ input }) => ({
                integrationId: input.integrationId,
                scheduledAt: input.scheduledAt,
              })),
            },
            select: {
              id: true,
              integrationId: true,
              scheduledAt: true,
              ownerType: true,
              ownerId: true,
            },
          });
          const ownerBySlot = new Map(
            active.map((reservation) => [
              `${
                reservation.integrationId
              }\u0000${reservation.scheduledAt.toISOString()}`,
              reservation,
            ])
          );
          const rows: Prisma.CalendarReservationCreateManyInput[] = [];
          const audits: Prisma.AuditLogCreateManyInput[] = [];
          for (const projection of pending) {
            const { input, id, requestHash } = projection;
            const slotKey = `${
              input.integrationId
            }\u0000${input.scheduledAt.toISOString()}`;
            const conflict = ownerBySlot.get(slotKey);
            const conflicted = !!conflict;
            rows.push({
              id,
              organizationId,
              integrationId: input.integrationId,
              ownerType: input.ownerType,
              ownerId: input.ownerId,
              postId: input.postId,
              campaignId: input.campaignId,
              source: input.source,
              writer: input.writer,
              mode: 'AUTHORITATIVE',
              state: conflicted ? 'CONFLICTED' : input.state,
              scheduledAt: input.scheduledAt,
              localScheduledAt: input.localScheduledAt,
              timezone: input.timezone,
              utcOffsetMinutes: input.utcOffsetMinutes,
              dstFold: input.dstFold,
              pinned: input.pinned,
              ownerRevision: input.revision,
              idempotencyKey: input.idempotencyKey,
              requestHash,
              outcomeClass: conflicted ? 'conflicted' : undefined,
              outcomeCode: conflicted
                ? CALENDAR_RESERVATION_CODES.CONFLICTED
                : CALENDAR_RESERVATION_CODES.COMMITTED,
              outcomeReason: conflicted
                ? `The account calendar slot is already owned by reservation ${conflict.id}.`
                : 'The account calendar slot is committed transactionally.',
              metadata: input.metadata,
            });
            // A conflicted row is evidence, not an active owner. Keep the
            // first committed/held owner as the conflict subject for every
            // later duplicate in this batch.
            if (!conflicted) {
              ownerBySlot.set(slotKey, {
                id,
                integrationId: input.integrationId,
                scheduledAt: input.scheduledAt,
                ownerType: input.ownerType,
                ownerId: input.ownerId,
              });
            }
            audits.push(
              auditData({
                id: auditId('calendar.reservation.created', id),
                organizationId,
                actor: input.actor,
                action: conflicted
                  ? 'calendar.reservation.conflicted'
                  : 'calendar.reservation.created',
                targetId: id,
                metadata: {
                  integrationId: input.integrationId,
                  ownerType: input.ownerType,
                  ownerId: input.ownerId,
                  scheduledAt: input.scheduledAt.toISOString(),
                  state: conflicted ? 'CONFLICTED' : input.state,
                  conflictReservationId: conflict?.id,
                },
              })
            );
          }
          await tx.calendarReservation.createMany({ data: rows });
          await tx.auditLog.createMany({ data: audits, skipDuplicates: true });
        }

        const reservations = await tx.calendarReservation.findMany({
          where: {
            organizationId,
            idempotencyKey: {
              in: inputs.map((input) => input.idempotencyKey),
            },
          },
        });
        const byKey = new Map(
          reservations.map((reservation) => [
            reservation.idempotencyKey,
            reservation,
          ])
        );
        return projections.map(({ input, requestHash }) => {
          const reservation = byKey.get(input.idempotencyKey);
          if (!reservation) {
            throw new Error('calendar_reservation_batch_write_incomplete');
          }
          return {
            reservation,
            replayed: existingByKey.has(input.idempotencyKey),
            requestHash,
          };
        });
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  }

  async transition(input: {
    organizationId: string;
    reservationId: string;
    expectedRevision: number;
    from: CalendarReservationState[];
    to: CalendarReservationState;
    code: string;
    reason: string;
    outcomeClass?: BulkCampaignIssueClass;
    actor: ReservationActor;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const changed = await tx.calendarReservation.updateMany({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
          revision: input.expectedRevision,
          state: { in: input.from },
        },
        data: {
          state: input.to,
          revision: { increment: 1 },
          outcomeClass: input.outcomeClass,
          outcomeCode: input.code,
          outcomeReason: input.reason,
          leaseExpiresAt: null,
          ...(input.to === 'RELEASED' ? { releasedAt: input.now } : {}),
          ...(input.to === 'CANCELLED' ? { cancelledAt: input.now } : {}),
        },
      });
      if (changed.count !== 1) return null;
      const reservation = await tx.calendarReservation.findFirstOrThrow({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId(
            'calendar.reservation.transitioned',
            reservation.id,
            String(reservation.revision)
          ),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'calendar.reservation.transitioned',
          targetId: reservation.id,
          metadata: {
            from: input.from,
            to: input.to,
            revision: reservation.revision,
            code: input.code,
          },
        }),
      });
      return reservation;
    });
  }

  getWriterCutover(organizationId: string) {
    return this._db.model.calendarReservationBackfill.findUnique({
      where: {
        organizationId_source: {
          organizationId,
          source: LEGACY_BACKFILL_SOURCE,
        },
      },
      select: {
        id: true,
        state: true,
        authorityActivatedAt: true,
        authorityPromotedCount: true,
      },
    });
  }

  attachHeldPost(input: {
    organizationId: string;
    reservationId: string;
    postId: string;
    actor: ReservationActor;
    now?: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      await this.lockTenantWriter(tx, input.organizationId);
      await this.lockPostOwner(tx, input.organizationId, input.postId);
      const reservation = await tx.calendarReservation.findFirst({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
        },
      });
      if (!reservation) throw new Error('calendar_reservation_not_found');
      if (reservation.state === 'COMMITTED') return reservation;
      if (
        reservation.state !== 'HELD' ||
        reservation.ownerType !== 'POST' ||
        reservation.ownerId !== input.postId
      ) {
        throw new Error('calendar_reservation_attach_invalid');
      }
      const post = await tx.post.findFirst({
        where: {
          id: input.postId,
          organizationId: input.organizationId,
          deletedAt: null,
          parentPostId: null,
        },
        select: {
          id: true,
          integrationId: true,
          publishDate: true,
        },
      });
      if (!post) throw new Error('calendar_post_not_found');
      if (
        post.integrationId !== reservation.integrationId ||
        post.publishDate.getTime() !== reservation.scheduledAt.getTime()
      ) {
        throw new Error('calendar_post_reservation_mismatch');
      }
      const now = input.now || new Date();
      const changed = await tx.calendarReservation.updateMany({
        where: {
          id: reservation.id,
          organizationId: input.organizationId,
          state: 'HELD',
          revision: reservation.revision,
          leaseExpiresAt: { gt: now },
        },
        data: {
          postId: post.id,
          state: 'COMMITTED',
          leaseExpiresAt: null,
          revision: { increment: 1 },
          outcomeClass: null,
          outcomeCode: CALENDAR_RESERVATION_CODES.COMMITTED,
          outcomeReason:
            'The calendar hold was attached to the materialized post and committed before dispatch.',
        },
      });
      if (changed.count !== 1) {
        throw new Error('calendar_reservation_hold_expired');
      }
      const committed = await tx.calendarReservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId(
            'calendar.reservation.post_attached',
            committed.id,
            String(committed.revision)
          ),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'calendar.reservation.post_attached',
          targetId: committed.id,
          metadata: {
            postId: input.postId,
            state: committed.state,
            revision: committed.revision,
          },
        }),
      });
      return committed;
    });
  }

  mirrorPost(input: PostCalendarIntent) {
    return this._transaction.model.$transaction(async (tx) => {
      await this.lockTenantWriter(tx, input.organizationId);
      await this.lockPostOwner(tx, input.organizationId, input.postId);
      const post = await tx.post.findFirst({
        where: {
          id: input.postId,
          organizationId: input.organizationId,
          deletedAt: null,
          parentPostId: null,
        },
        select: {
          id: true,
          integrationId: true,
          publishDate: true,
          state: true,
        },
      });
      if (!post) throw new Error('calendar_post_not_found');
      if (
        post.integrationId !== input.integrationId ||
        post.publishDate.getTime() !== input.scheduledAt.getTime()
      ) {
        throw new Error('calendar_post_reservation_mismatch');
      }
      const replay = await tx.calendarReservation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay) return { reservation: replay, replayed: true as const };

      const active = await tx.calendarReservation.findMany({
        where: {
          organizationId: input.organizationId,
          ownerType: 'POST',
          ownerId: input.postId,
          mode: 'SHADOW',
          state: 'COMMITTED',
        },
        orderBy: { ownerRevision: 'desc' },
      });
      const exact = active.find(
        (row) =>
          row.integrationId === input.integrationId &&
          row.scheduledAt.getTime() === input.scheduledAt.getTime() &&
          row.localScheduledAt === input.localScheduledAt &&
          row.timezone === input.timezone &&
          row.utcOffsetMinutes === input.utcOffsetMinutes &&
          (row.dstFold ?? null) === (input.dstFold ?? null)
      );
      if (exact) return { reservation: exact, replayed: true as const };
      const pinnedMove = active.find(
        (row) =>
          row.pinned &&
          row.scheduledAt.getTime() !== input.scheduledAt.getTime()
      );
      if (pinnedMove) throw new Error('calendar_pinned_reservation_immutable');

      const maximum = await tx.calendarReservation.aggregate({
        where: {
          organizationId: input.organizationId,
          ownerType: 'POST',
          ownerId: input.postId,
        },
        _max: { ownerRevision: true },
      });
      const ownerRevision = (maximum._max.ownerRevision || 0) + 1;
      const conflict = await tx.calendarReservation.findFirst({
        where: {
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          scheduledAt: input.scheduledAt,
          mode: 'SHADOW',
          state: 'COMMITTED',
          NOT: { ownerType: 'POST', ownerId: input.postId },
        },
        select: { id: true },
      });
      const requestHash = calendarReservationRequestHash({
        integrationId: input.integrationId,
        ownerType: 'POST',
        ownerId: input.postId,
        postId: input.postId,
        source: input.source,
        scheduledAt: input.scheduledAt.toISOString(),
        localScheduledAt: input.localScheduledAt,
        timezone: input.timezone,
        utcOffsetMinutes: input.utcOffsetMinutes,
        dstFold: input.dstFold ?? null,
        pinned: !!input.pinned,
        ownerRevision,
        state: 'COMMITTED',
      });
      const reservation = await tx.calendarReservation.create({
        data: {
          id: deterministicReservationId(
            input.organizationId,
            input.idempotencyKey
          ),
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          ownerType: 'POST',
          ownerId: input.postId,
          postId: input.postId,
          source: input.source,
          writer: input.writer,
          mode: 'SHADOW',
          state: 'COMMITTED',
          scheduledAt: input.scheduledAt,
          localScheduledAt: input.localScheduledAt,
          timezone: input.timezone,
          utcOffsetMinutes: input.utcOffsetMinutes,
          dstFold: input.dstFold,
          pinned: input.pinned || post.state === 'PUBLISHED',
          ownerRevision,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          outcomeClass: conflict ? 'conflicted' : undefined,
          outcomeCode: conflict
            ? CALENDAR_RESERVATION_CODES.CONFLICTED
            : CALENDAR_RESERVATION_CODES.WRITER_SHADOWED,
          outcomeReason: conflict
            ? `Shadow comparison found another reservation at this account/instant (${conflict.id}).`
            : 'The post calendar mutation was mirrored before dispatch.',
          metadata: input.metadata,
        },
      });
      const now = new Date();
      await tx.calendarReservation.updateMany({
        where: {
          organizationId: input.organizationId,
          ownerType: 'POST',
          ownerId: input.postId,
          mode: 'SHADOW',
          state: 'COMMITTED',
          id: { not: reservation.id },
          pinned: false,
        },
        data: {
          state: 'RELEASED',
          releasedAt: now,
          revision: { increment: 1 },
          outcomeCode: CALENDAR_RESERVATION_CODES.RELEASED,
          outcomeReason:
            'A newer shadow revision replaced this calendar intent.',
        },
      });
      await tx.calendarReservationBackfill.updateMany({
        where: {
          organizationId: input.organizationId,
          source: LEGACY_BACKFILL_SOURCE,
          authorityActivatedAt: { not: null },
        },
        data: {
          authorityActivatedAt: null,
          authorityCursorCreatedAt: null,
          authorityCursorId: null,
          authorityPromotedCount: 0,
          outcomeCode: CALENDAR_RESERVATION_CODES.AUTHORITY_NOT_READY,
          outcomeReason:
            'A shadow-mode calendar write invalidated the prior authoritative cutover and requires catch-up.',
        },
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId('calendar.writer.shadowed', reservation.id),
          organizationId: input.organizationId,
          actor: input.actor,
          action: conflict
            ? 'calendar.writer.shadow_conflict'
            : 'calendar.writer.shadowed',
          targetId: reservation.id,
          metadata: {
            postId: input.postId,
            scheduledAt: input.scheduledAt.toISOString(),
            conflictReservationId: conflict?.id,
          },
        }),
      });
      return { reservation, replayed: false as const };
    });
  }

  reschedulePost(
    input: PostCalendarIntent & {
      mode: CalendarReservationMode;
      action: 'schedule' | 'update';
      allowPinnedMove?: boolean;
    }
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      await this.lockTenantWriter(tx, input.organizationId);
      await this.lockPostOwner(tx, input.organizationId, input.postId);
      const post = await tx.post.findFirst({
        where: {
          id: input.postId,
          organizationId: input.organizationId,
          deletedAt: null,
          parentPostId: null,
        },
        include: { integration: true },
      });
      if (!post) throw new Error('calendar_post_not_found');
      if (post.integrationId !== input.integrationId) {
        throw new Error('calendar_post_reservation_mismatch');
      }

      const replay = await tx.calendarReservation.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay) {
        if (
          replay.state === 'COMMITTED' &&
          post.publishDate.getTime() !== input.scheduledAt.getTime()
        ) {
          await tx.post.update({
            where: { id: post.id, organizationId: input.organizationId },
            data: {
              publishDate: input.scheduledAt,
              ...(input.action === 'schedule'
                ? {
                    state: post.state === 'DRAFT' ? 'DRAFT' : 'QUEUE',
                    releaseId: null,
                    releaseURL: null,
                  }
                : {}),
            },
          });
        }
        return { reservation: replay, post, replayed: true as const };
      }

      const active = await tx.calendarReservation.findMany({
        where: {
          organizationId: input.organizationId,
          ownerType: 'POST',
          ownerId: input.postId,
          mode: input.mode,
          state: { in: ['HELD', 'COMMITTED'] },
        },
        orderBy: { ownerRevision: 'desc' },
      });
      const pinnedMove = active.find(
        (row) =>
          row.pinned &&
          row.scheduledAt.getTime() !== input.scheduledAt.getTime()
      );
      if (pinnedMove && !input.allowPinnedMove) {
        throw new Error('calendar_pinned_reservation_immutable');
      }
      const exactActive = active.find(
        (row) =>
          row.integrationId === input.integrationId &&
          row.scheduledAt.getTime() === input.scheduledAt.getTime() &&
          row.localScheduledAt === input.localScheduledAt &&
          row.timezone === input.timezone &&
          row.utcOffsetMinutes === input.utcOffsetMinutes &&
          (row.dstFold ?? null) === (input.dstFold ?? null)
      );
      if (exactActive) {
        return {
          reservation: exactActive,
          post,
          replayed: true as const,
        };
      }
      if (input.mode === 'AUTHORITATIVE') {
        const [slotOne, slotTwo] = reservationAdvisoryLockKeys(input);
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${slotOne}::int, ${slotTwo}::int)`
        );
        await tx.calendarReservation.updateMany({
          where: {
            organizationId: input.organizationId,
            integrationId: input.integrationId,
            scheduledAt: input.scheduledAt,
            mode: 'AUTHORITATIVE',
            state: 'HELD',
            leaseExpiresAt: { lte: new Date() },
          },
          data: {
            state: 'RELEASED',
            leaseExpiresAt: null,
            releasedAt: new Date(),
            revision: { increment: 1 },
            outcomeCode: 'calendar_reservation_lease_expired',
            outcomeReason: 'The abandoned calendar reservation hold expired.',
          },
        });
      }
      const sameInstantOwner = active.filter(
        (row) =>
          row.integrationId === input.integrationId &&
          row.scheduledAt.getTime() === input.scheduledAt.getTime()
      );
      if (
        sameInstantOwner.some((row) => row.pinned) &&
        !input.allowPinnedMove
      ) {
        throw new Error('calendar_pinned_reservation_immutable');
      }
      if (sameInstantOwner.length) {
        await tx.calendarReservation.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: sameInstantOwner.map((row) => row.id) },
            state: { in: ['HELD', 'COMMITTED'] },
          },
          data: {
            state: 'RELEASED',
            leaseExpiresAt: null,
            releasedAt: new Date(),
            revision: { increment: 1 },
            outcomeCode: CALENDAR_RESERVATION_CODES.RELEASED,
            outcomeReason:
              'A newer local-time intent replaced this exact UTC account slot.',
          },
        });
      }

      const conflict = await tx.calendarReservation.findFirst({
        where: {
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          scheduledAt: input.scheduledAt,
          mode: input.mode,
          state:
            input.mode === 'AUTHORITATIVE'
              ? { in: ['HELD', 'COMMITTED'] }
              : 'COMMITTED',
          NOT: { ownerType: 'POST', ownerId: input.postId },
        },
        select: { id: true },
      });
      const maximum = await tx.calendarReservation.aggregate({
        where: {
          organizationId: input.organizationId,
          ownerType: 'POST',
          ownerId: input.postId,
        },
        _max: { ownerRevision: true },
      });
      const ownerRevision = (maximum._max.ownerRevision || 0) + 1;
      const isBlocked = input.mode === 'AUTHORITATIVE' && !!conflict;
      const requestHash = calendarReservationRequestHash({
        integrationId: input.integrationId,
        ownerType: 'POST',
        ownerId: input.postId,
        postId: input.postId,
        source: input.source,
        scheduledAt: input.scheduledAt.toISOString(),
        localScheduledAt: input.localScheduledAt,
        timezone: input.timezone,
        utcOffsetMinutes: input.utcOffsetMinutes,
        dstFold: input.dstFold ?? null,
        pinned: !!input.pinned,
        ownerRevision,
        state: 'COMMITTED',
      });
      const reservation = await tx.calendarReservation.create({
        data: {
          id: deterministicReservationId(
            input.organizationId,
            input.idempotencyKey
          ),
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          ownerType: 'POST',
          ownerId: input.postId,
          postId: input.postId,
          source: input.source,
          writer: input.writer,
          mode: input.mode,
          state: isBlocked ? 'CONFLICTED' : 'COMMITTED',
          scheduledAt: input.scheduledAt,
          localScheduledAt: input.localScheduledAt,
          timezone: input.timezone,
          utcOffsetMinutes: input.utcOffsetMinutes,
          dstFold: input.dstFold,
          pinned: !!input.pinned,
          ownerRevision,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          outcomeClass: conflict ? 'conflicted' : undefined,
          outcomeCode: conflict
            ? CALENDAR_RESERVATION_CODES.CONFLICTED
            : input.mode === 'AUTHORITATIVE'
            ? CALENDAR_RESERVATION_CODES.COMMITTED
            : CALENDAR_RESERVATION_CODES.WRITER_SHADOWED,
          outcomeReason: conflict
            ? `${
                input.mode === 'AUTHORITATIVE' ? 'The' : 'Shadow comparison:'
              } target account/instant is already represented by reservation ${
                conflict.id
              }.`
            : input.mode === 'AUTHORITATIVE'
            ? 'The replacement account calendar slot and Post date were committed transactionally.'
            : 'The replacement Post date was mirrored transactionally in shadow mode.',
          metadata: input.metadata,
        },
      });

      if (isBlocked) {
        await tx.auditLog.create({
          data: auditData({
            id: auditId(
              'calendar.writer.reschedule_conflicted',
              reservation.id
            ),
            organizationId: input.organizationId,
            actor: input.actor,
            action: 'calendar.writer.reschedule_conflicted',
            targetId: reservation.id,
            metadata: {
              postId: input.postId,
              conflictReservationId: conflict?.id,
              scheduledAt: input.scheduledAt.toISOString(),
            },
          }),
        });
        return { reservation, post, replayed: false as const };
      }

      const updatedPost = await tx.post.update({
        where: { id: post.id, organizationId: input.organizationId },
        data: {
          publishDate: input.scheduledAt,
          ...(input.action === 'schedule'
            ? {
                state: post.state === 'DRAFT' ? 'DRAFT' : 'QUEUE',
                releaseId: null,
                releaseURL: null,
              }
            : {}),
        },
      });
      const now = new Date();
      await tx.calendarReservation.updateMany({
        where: {
          organizationId: input.organizationId,
          ownerType: 'POST',
          ownerId: input.postId,
          mode: input.mode,
          state: { in: ['HELD', 'COMMITTED'] },
          id: { not: reservation.id },
          pinned: false,
        },
        data: {
          state: 'RELEASED',
          leaseExpiresAt: null,
          releasedAt: now,
          revision: { increment: 1 },
          outcomeCode: CALENDAR_RESERVATION_CODES.RELEASED,
          outcomeReason:
            'A committed reschedule revision replaced this account calendar slot.',
        },
      });
      if (input.mode === 'SHADOW') {
        await tx.calendarReservationBackfill.updateMany({
          where: {
            organizationId: input.organizationId,
            source: LEGACY_BACKFILL_SOURCE,
            authorityActivatedAt: { not: null },
          },
          data: {
            authorityActivatedAt: null,
            authorityCursorCreatedAt: null,
            authorityCursorId: null,
            authorityPromotedCount: 0,
            outcomeCode: CALENDAR_RESERVATION_CODES.AUTHORITY_NOT_READY,
            outcomeReason:
              'A shadow-mode reschedule invalidated the prior authoritative cutover.',
          },
        });
      }
      await tx.auditLog.create({
        data: auditData({
          id: auditId('calendar.writer.rescheduled', reservation.id),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'calendar.writer.rescheduled',
          targetId: reservation.id,
          metadata: {
            postId: input.postId,
            mode: input.mode,
            scheduledAt: input.scheduledAt.toISOString(),
            action: input.action,
          },
        }),
      });
      return { reservation, post: updatedPost, replayed: false as const };
    });
  }

  cancelPostGroup(input: {
    organizationId: string;
    group: string;
    actor: ReservationActor;
    now?: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      await this.lockTenantWriter(tx, input.organizationId);
      const posts = await tx.post.findMany({
        where: {
          organizationId: input.organizationId,
          group: input.group,
          deletedAt: null,
        },
        select: { id: true, parentPostId: true },
      });
      const root = posts.find((post) => !post.parentPostId);
      if (!root) return null;
      for (const post of [...posts].sort((a, b) => a.id.localeCompare(b.id))) {
        await this.lockPostOwner(tx, input.organizationId, post.id);
      }
      const now = input.now || new Date();
      await tx.post.updateMany({
        where: {
          organizationId: input.organizationId,
          group: input.group,
          deletedAt: null,
        },
        data: { deletedAt: now },
      });
      await cancelCalendarReservationsInTransaction(tx, {
        organizationId: input.organizationId,
        postIds: posts.map((post) => post.id),
        action: 'calendar.writer.group_reservations_cancelled',
        subject: input.group,
        code: CALENDAR_RESERVATION_CODES.CANCELLED,
        reason:
          'The post group was cancelled by an explicit calendar writer request.',
        actor: input.actor,
        now,
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId('calendar.writer.group_cancelled', root.id, input.group),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'calendar.writer.group_cancelled',
          targetId: root.id,
          metadata: {
            group: input.group,
            postCount: posts.length,
          },
        }),
      });
      return root;
    });
  }

  promoteAuthorityBatch(
    organizationId: string,
    limit: number,
    actor: ReservationActor,
    now = new Date()
  ) {
    return this._transaction.model.$transaction(async (tx) => {
      // Exclusive only against calendar writers for this tenant; different
      // tenants and provider workers remain fully concurrent.
      await this.lockTenantWriter(tx, organizationId, true);
      const backfill = await tx.calendarReservationBackfill.findUnique({
        where: {
          organizationId_source: {
            organizationId,
            source: LEGACY_BACKFILL_SOURCE,
          },
        },
      });
      if (!backfill || backfill.state !== 'VERIFIED') {
        throw new Error('calendar_backfill_not_verified');
      }
      if (backfill.authorityActivatedAt) {
        return {
          backfill,
          processed: 0,
          promoted: 0,
          replayed: 0,
          conflicted: 0,
          missing: 0,
          activated: true,
        };
      }

      const posts = await tx.post.findMany({
        where: {
          organizationId,
          deletedAt: null,
          parentPostId: null,
          ...(backfill.authorityCursorCreatedAt
            ? {
                OR: [
                  { createdAt: { gt: backfill.authorityCursorCreatedAt } },
                  {
                    createdAt: backfill.authorityCursorCreatedAt,
                    id: { gt: backfill.authorityCursorId! },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: {
          id: true,
          organizationId: true,
          integrationId: true,
          publishDate: true,
          createdAt: true,
          state: true,
        },
      });
      let promoted = 0;
      let replayed = 0;
      let conflicted = 0;
      for (const post of posts) {
        await this.lockPostOwner(tx, organizationId, post.id);
        const existing = await tx.calendarReservation.findFirst({
          where: {
            organizationId,
            ownerType: 'POST',
            ownerId: post.id,
            integrationId: post.integrationId,
            scheduledAt: post.publishDate,
            mode: 'AUTHORITATIVE',
            state: 'COMMITTED',
          },
        });
        if (existing) {
          replayed += 1;
          continue;
        }
        await tx.calendarReservation.updateMany({
          where: {
            organizationId,
            ownerType: 'POST',
            ownerId: post.id,
            mode: 'AUTHORITATIVE',
            state: { in: ['HELD', 'COMMITTED'] },
            pinned: false,
            OR: [
              { integrationId: { not: post.integrationId } },
              { scheduledAt: { not: post.publishDate } },
            ],
          },
          data: {
            state: 'RELEASED',
            leaseExpiresAt: null,
            releasedAt: now,
            revision: { increment: 1 },
            outcomeCode: CALENDAR_RESERVATION_CODES.RELEASED,
            outcomeReason:
              'Authority catch-up released a stale unpinned owner revision.',
          },
        });
        const [slotOne, slotTwo] = reservationAdvisoryLockKeys({
          organizationId,
          integrationId: post.integrationId,
          scheduledAt: post.publishDate,
        });
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(${slotOne}::int, ${slotTwo}::int)`
        );
        const slotConflict = await tx.calendarReservation.findFirst({
          where: {
            organizationId,
            integrationId: post.integrationId,
            scheduledAt: post.publishDate,
            mode: 'AUTHORITATIVE',
            state: { in: ['HELD', 'COMMITTED'] },
            NOT: { ownerType: 'POST', ownerId: post.id },
          },
          select: { id: true },
        });
        const maximum = await tx.calendarReservation.aggregate({
          where: {
            organizationId,
            ownerType: 'POST',
            ownerId: post.id,
          },
          _max: { ownerRevision: true },
        });
        const ownerRevision = (maximum._max.ownerRevision || 0) + 1;
        const shadow = await tx.calendarReservation.findFirst({
          where: {
            organizationId,
            ownerType: 'POST',
            ownerId: post.id,
            integrationId: post.integrationId,
            scheduledAt: post.publishDate,
            mode: 'SHADOW',
            state: { in: ['COMMITTED', 'CONFLICTED'] },
          },
          orderBy: { ownerRevision: 'desc' },
        });
        const local = shadow || utcBackfillLocalIntent(post.publishDate);
        const baseIdempotencyKey = `authority-post:${
          post.id
        }:${post.publishDate.toISOString()}`;
        const priorAttempt = await tx.calendarReservation.findFirst({
          where: {
            organizationId,
            ownerType: 'POST',
            ownerId: post.id,
            integrationId: post.integrationId,
            scheduledAt: post.publishDate,
            source: 'calendar_authority_promotion_v1',
          },
          orderBy: { ownerRevision: 'desc' },
        });
        const promotionBlocked = !!slotConflict || !shadow;
        const blockerCode = slotConflict
          ? CALENDAR_RESERVATION_CODES.CONFLICTED
          : CALENDAR_RESERVATION_CODES.SHADOW_MISSING;
        if (
          priorAttempt?.state === 'CONFLICTED' &&
          promotionBlocked &&
          priorAttempt.outcomeCode === blockerCode
        ) {
          // The durable conflict remains the visible result. Do not create one
          // more row on every bounded catch-up pass while it is unresolved.
          replayed += 1;
          continue;
        }
        const idempotencyKey = priorAttempt
          ? `${baseIdempotencyKey}:r${ownerRevision}`
          : baseIdempotencyKey;
        const requestHash = calendarReservationRequestHash({
          integrationId: post.integrationId,
          ownerType: 'POST',
          ownerId: post.id,
          postId: post.id,
          source: 'calendar_authority_promotion_v1',
          scheduledAt: post.publishDate.toISOString(),
          localScheduledAt: local.localScheduledAt,
          timezone: local.timezone,
          utcOffsetMinutes: local.utcOffsetMinutes,
          dstFold: local.dstFold ?? null,
          pinned: post.state === 'PUBLISHED',
          ownerRevision,
          state: promotionBlocked ? 'CONFLICTED' : 'COMMITTED',
        });
        const reservation = await tx.calendarReservation.create({
          data: {
            id: deterministicReservationId(organizationId, idempotencyKey),
            organizationId,
            integrationId: post.integrationId,
            ownerType: 'POST',
            ownerId: post.id,
            postId: post.id,
            source: 'calendar_authority_promotion_v1',
            writer: 'stage5_cutover',
            mode: 'AUTHORITATIVE',
            state: promotionBlocked ? 'CONFLICTED' : 'COMMITTED',
            scheduledAt: post.publishDate,
            localScheduledAt: local.localScheduledAt,
            timezone: local.timezone,
            utcOffsetMinutes: local.utcOffsetMinutes,
            dstFold: local.dstFold,
            pinned: post.state === 'PUBLISHED',
            ownerRevision,
            idempotencyKey,
            requestHash,
            outcomeClass: promotionBlocked ? 'conflicted' : undefined,
            outcomeCode: slotConflict
              ? blockerCode
              : !shadow
              ? blockerCode
              : CALENDAR_RESERVATION_CODES.AUTHORITY_PROMOTED,
            outcomeReason: slotConflict
              ? `Authority promotion was blocked by reservation ${slotConflict.id}; no Post was skipped.`
              : !shadow
              ? 'Authority promotion found no exact shadow reservation for this live Post; the item remains visible and authority was not granted.'
              : 'The verified shadow calendar row was promoted to authoritative ownership.',
            metadata: {
              backfillId: backfill.id,
              shadowReservationId: shadow?.id || null,
            },
          },
        });
        if (promotionBlocked) conflicted += 1;
        else promoted += 1;
        await tx.auditLog.create({
          data: auditData({
            id: auditId('calendar.authority.promoted', reservation.id),
            organizationId,
            actor,
            action: promotionBlocked
              ? 'calendar.authority.promotion_conflicted'
              : 'calendar.authority.promoted',
            targetId: reservation.id,
            metadata: {
              postId: post.id,
              scheduledAt: post.publishDate.toISOString(),
              conflictReservationId: slotConflict?.id,
            },
          }),
        });
      }

      const last = posts.length ? posts[posts.length - 1] : undefined;
      const reachedEnd = posts.length < limit;
      let missing = 0;
      let activated = false;
      if (reachedEnd) {
        const rows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "Post" p
          WHERE p."organizationId" = ${organizationId}
            AND p."deletedAt" IS NULL
            AND p."parentPostId" IS NULL
            AND NOT EXISTS (
              SELECT 1
              FROM "CalendarReservation" r
              WHERE r."organizationId" = p."organizationId"
                AND r."postId" = p."id"
                AND r."integrationId" = p."integrationId"
                AND r."scheduledAt" = p."publishDate"
                AND r."mode" = 'AUTHORITATIVE'
                AND r."state" = 'COMMITTED'
            )
        `);
        missing = rows[0] ? Number(rows[0].count) : 0;
        activated = missing === 0 && conflicted === 0;
      }
      const updated = await tx.calendarReservationBackfill.update({
        where: { id: backfill.id },
        data: {
          authorityCursorCreatedAt: reachedEnd
            ? null
            : last?.createdAt || backfill.authorityCursorCreatedAt,
          authorityCursorId: reachedEnd
            ? null
            : last?.id || backfill.authorityCursorId,
          authorityPromotedCount: { increment: promoted },
          authorityActivatedAt: activated ? now : null,
          conflictCount: { increment: conflicted },
          outcomeCode: activated
            ? CALENDAR_RESERVATION_CODES.AUTHORITY_ACTIVE
            : CALENDAR_RESERVATION_CODES.AUTHORITY_NOT_READY,
          outcomeReason: activated
            ? 'Every live root Post has an exact authoritative reservation; calendar writer cutover is active.'
            : reachedEnd
            ? `${missing} live Post calendar row(s) still lack exact authoritative ownership.`
            : 'Authoritative promotion is continuing in bounded batches.',
        },
      });
      if (activated) {
        await tx.auditLog.create({
          data: auditData({
            id: auditId('calendar.authority.activated', updated.id),
            organizationId,
            actor,
            action: 'calendar.authority.activated',
            targetId: updated.id,
            metadata: {
              authorityPromotedCount: updated.authorityPromotedCount,
              activatedAt: now.toISOString(),
            },
          }),
        });
      }
      return {
        backfill: updated,
        processed: posts.length,
        promoted,
        replayed,
        conflicted,
        missing,
        activated,
      };
    });
  }

  initializeBackfill(organizationId: string, now = new Date()) {
    return this._transaction.model.$transaction(async (tx) => {
      const existing = await tx.calendarReservationBackfill.findUnique({
        where: {
          organizationId_source: {
            organizationId,
            source: LEGACY_BACKFILL_SOURCE,
          },
        },
      });
      if (existing?.state === 'FAILED') {
        const resumed = await tx.calendarReservationBackfill.update({
          where: { id: existing.id },
          data: {
            state: 'RUNNING',
            cursorCreatedAt: null,
            cursorId: null,
            scannedCount: 0,
            insertedCount: 0,
            replayedCount: 0,
            conflictCount: 0,
            mismatchCount: 0,
            authorityCursorCreatedAt: null,
            authorityCursorId: null,
            authorityPromotedCount: 0,
            authorityActivatedAt: null,
            outcomeCode: CALENDAR_RESERVATION_CODES.BACKFILL_RUNNING,
            outcomeReason:
              'The failed shadow verification was restarted from its fixed high watermark.',
            startedAt: now,
            completedAt: null,
            verifiedAt: null,
          },
        });
        await tx.auditLog.create({
          data: auditData({
            id: auditId(
              'calendar.backfill.resumed',
              resumed.id,
              now.toISOString()
            ),
            organizationId,
            actor: { actorType: 'system' },
            action: 'calendar.backfill.resumed',
            targetId: resumed.id,
            metadata: { source: LEGACY_BACKFILL_SOURCE },
          }),
        });
        return resumed;
      }
      if (existing) return existing;
      const watermark = await tx.post.findFirst({
        where: { organizationId, deletedAt: null, parentPostId: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true, id: true },
      });
      const backfill = await tx.calendarReservationBackfill.create({
        data: {
          id: deterministicBackfillId(organizationId, LEGACY_BACKFILL_SOURCE),
          organizationId,
          source: LEGACY_BACKFILL_SOURCE,
          state: watermark ? 'RUNNING' : 'VERIFYING',
          sourceHighWatermarkAt: watermark?.createdAt,
          sourceHighWatermarkId: watermark?.id,
          outcomeCode: watermark
            ? CALENDAR_RESERVATION_CODES.BACKFILL_RUNNING
            : CALENDAR_RESERVATION_CODES.BACKFILL_VERIFYING,
          outcomeReason: watermark
            ? 'Legacy root posts are being copied into the shadow reservation ledger.'
            : 'The tenant has no eligible legacy root posts; verification may run.',
          startedAt: now,
          completedAt: watermark ? undefined : now,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          id: auditId('calendar.backfill.started', backfill.id),
          organizationId,
          actor: { actorType: 'system' },
          action: 'calendar.backfill.started',
          targetId: backfill.id,
          metadata: {
            source: LEGACY_BACKFILL_SOURCE,
            highWatermarkId: watermark?.id,
          },
        }),
      });
      return backfill;
    });
  }

  backfillNextBatch(organizationId: string, limit: number, now = new Date()) {
    return this._transaction.model.$transaction(async (tx) => {
      const backfill = await tx.calendarReservationBackfill.findUnique({
        where: {
          organizationId_source: {
            organizationId,
            source: LEGACY_BACKFILL_SOURCE,
          },
        },
      });
      if (!backfill || backfill.state !== 'RUNNING') {
        return { backfill, processed: 0, inserted: 0, replayed: 0 };
      }
      const posts = await tx.post.findMany({
        where: {
          organizationId,
          deletedAt: null,
          parentPostId: null,
          OR: backfill.cursorCreatedAt
            ? [
                { createdAt: { gt: backfill.cursorCreatedAt } },
                {
                  createdAt: backfill.cursorCreatedAt,
                  id: { gt: backfill.cursorId! },
                },
              ]
            : undefined,
          AND: backfill.sourceHighWatermarkAt
            ? [
                {
                  OR: [
                    { createdAt: { lt: backfill.sourceHighWatermarkAt } },
                    {
                      createdAt: backfill.sourceHighWatermarkAt,
                      id: { lte: backfill.sourceHighWatermarkId! },
                    },
                  ],
                },
              ]
            : undefined,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit,
        select: {
          id: true,
          organizationId: true,
          integrationId: true,
          publishDate: true,
          createdAt: true,
          state: true,
        },
      });
      const rows = posts.map((post) => {
        const idempotencyKey = `legacy-post:${post.id}:1`;
        const local = utcBackfillLocalIntent(post.publishDate);
        return {
          id: deterministicReservationId(organizationId, idempotencyKey),
          organizationId,
          integrationId: post.integrationId,
          ownerType: 'POST' as const,
          ownerId: post.id,
          postId: post.id,
          source: LEGACY_BACKFILL_SOURCE,
          writer: 'stage4_shadow_backfill',
          mode: 'SHADOW' as const,
          state: 'COMMITTED' as const,
          scheduledAt: post.publishDate,
          ...local,
          pinned: post.state === 'PUBLISHED',
          revision: 1,
          ownerRevision: 1,
          idempotencyKey,
          requestHash: calendarReservationRequestHash({
            postId: post.id,
            integrationId: post.integrationId,
            scheduledAt: post.publishDate.toISOString(),
            source: LEGACY_BACKFILL_SOURCE,
          }),
          outcomeCode: CALENDAR_RESERVATION_CODES.LEGACY_SHADOWED,
          outcomeReason:
            'The legacy root post was copied into the shadow reservation ledger using explicit UTC intent.',
        };
      });
      const created = rows.length
        ? await tx.calendarReservation.createMany({
            data: rows,
            skipDuplicates: true,
          })
        : { count: 0 };
      const last = posts.length ? posts[posts.length - 1] : undefined;
      const finished = posts.length < limit;
      const updated = await tx.calendarReservationBackfill.update({
        where: { id: backfill.id },
        data: {
          cursorCreatedAt: last?.createdAt || backfill.cursorCreatedAt,
          cursorId: last?.id || backfill.cursorId,
          scannedCount: { increment: posts.length },
          insertedCount: { increment: created.count },
          replayedCount: { increment: posts.length - created.count },
          ...(finished
            ? {
                state: 'VERIFYING' as const,
                completedAt: now,
                outcomeCode: CALENDAR_RESERVATION_CODES.BACKFILL_VERIFYING,
                outcomeReason:
                  'The shadow copy reached its high watermark and awaits verification.',
              }
            : {}),
        },
      });
      return {
        backfill: updated,
        processed: posts.length,
        inserted: created.count,
        replayed: posts.length - created.count,
      };
    });
  }

  verifyBackfill(organizationId: string, now = new Date()) {
    return this._transaction.model.$transaction(async (tx) => {
      const backfill = await tx.calendarReservationBackfill.findUnique({
        where: {
          organizationId_source: {
            organizationId,
            source: LEGACY_BACKFILL_SOURCE,
          },
        },
      });
      if (!backfill || !['VERIFYING', 'FAILED'].includes(backfill.state)) {
        return null;
      }

      await tx.$executeRaw(Prisma.sql`
        WITH duplicate_slots AS (
          SELECT "integrationId", "scheduledAt"
          FROM "CalendarReservation"
          WHERE "organizationId" = ${organizationId}
            AND "source" = ${LEGACY_BACKFILL_SOURCE}
            AND "mode" = 'SHADOW'
          GROUP BY "integrationId", "scheduledAt"
          HAVING COUNT(*) > 1
        )
        UPDATE "CalendarReservation" AS reservation
        SET "state" = 'CONFLICTED',
            "outcomeClass" = 'conflicted',
            "outcomeCode" = ${CALENDAR_RESERVATION_CODES.LEGACY_CONFLICT},
            "outcomeReason" = 'Multiple legacy root posts occupy this account and UTC instant.',
            "verifiedAt" = ${now},
            "updatedAt" = ${now}
        FROM duplicate_slots
        WHERE reservation."organizationId" = ${organizationId}
          AND reservation."source" = ${LEGACY_BACKFILL_SOURCE}
          AND reservation."integrationId" = duplicate_slots."integrationId"
          AND reservation."scheduledAt" = duplicate_slots."scheduledAt"
      `);
      await tx.calendarReservation.updateMany({
        where: {
          organizationId,
          source: LEGACY_BACKFILL_SOURCE,
          verifiedAt: null,
        },
        data: { verifiedAt: now },
      });

      const cutoff = backfill.sourceHighWatermarkAt
        ? Prisma.sql`AND (post."createdAt" < ${backfill.sourceHighWatermarkAt} OR (post."createdAt" = ${backfill.sourceHighWatermarkAt} AND post."id" <= ${backfill.sourceHighWatermarkId}))`
        : Prisma.sql`AND FALSE`;
      const [counts] = await tx.$queryRaw<
        Array<{
          missing_count: bigint;
          mismatch_count: bigint;
          extra_count: bigint;
          conflict_count: bigint;
        }>
      >(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM "Post" post
           WHERE post."organizationId" = ${organizationId}
             AND post."deletedAt" IS NULL AND post."parentPostId" IS NULL
             ${cutoff}
             AND NOT EXISTS (
               SELECT 1 FROM "CalendarReservation" reservation
               WHERE reservation."organizationId" = post."organizationId"
                 AND reservation."postId" = post."id"
                 AND reservation."source" = ${LEGACY_BACKFILL_SOURCE}
             )) AS missing_count,
          (SELECT COUNT(*) FROM "CalendarReservation" reservation
           JOIN "Post" post ON post."id" = reservation."postId"
             AND post."organizationId" = reservation."organizationId"
           WHERE reservation."organizationId" = ${organizationId}
             AND reservation."source" = ${LEGACY_BACKFILL_SOURCE}
             AND (reservation."integrationId" <> post."integrationId"
                OR reservation."scheduledAt" <> post."publishDate"
                OR reservation."pinned" <> (post."state" = 'PUBLISHED'))) AS mismatch_count,
          (SELECT COUNT(*) FROM "CalendarReservation" reservation
           JOIN "Post" post ON post."id" = reservation."postId"
             AND post."organizationId" = reservation."organizationId"
           WHERE reservation."organizationId" = ${organizationId}
             AND reservation."source" = ${LEGACY_BACKFILL_SOURCE}
             AND (post."deletedAt" IS NOT NULL OR post."parentPostId" IS NOT NULL)) AS extra_count,
          (SELECT COUNT(*) FROM "CalendarReservation" reservation
           WHERE reservation."organizationId" = ${organizationId}
             AND reservation."source" = ${LEGACY_BACKFILL_SOURCE}
             AND reservation."state" = 'CONFLICTED') AS conflict_count
      `);
      const missing = Number(counts?.missing_count || 0);
      const fieldMismatch = Number(counts?.mismatch_count || 0);
      const extra = Number(counts?.extra_count || 0);
      const conflicts = Number(counts?.conflict_count || 0);
      const mismatchCount = missing + fieldMismatch + extra;
      const verified = mismatchCount === 0;
      const updated = await tx.calendarReservationBackfill.update({
        where: { id: backfill.id },
        data: {
          state: verified ? 'VERIFIED' : 'FAILED',
          conflictCount: conflicts,
          mismatchCount,
          outcomeCode: verified
            ? CALENDAR_RESERVATION_CODES.BACKFILL_VERIFIED
            : CALENDAR_RESERVATION_CODES.BACKFILL_MISMATCH,
          outcomeReason: verified
            ? `The shadow ledger matches its legacy-post watermark; ${conflicts} conflicting row(s) are classified durably.`
            : `Shadow verification found ${missing} missing, ${fieldMismatch} changed, and ${extra} extra row(s).`,
          verifiedAt: verified ? now : null,
          completedAt: backfill.completedAt || now,
        },
      });
      const verificationAudit = auditData({
        id: auditId(
          'calendar.backfill.verified',
          backfill.id,
          String(mismatchCount),
          String(conflicts)
        ),
        organizationId,
        actor: { actorType: 'system' },
        action: verified
          ? 'calendar.backfill.verified'
          : 'calendar.backfill.failed',
        targetId: backfill.id,
        metadata: { missing, fieldMismatch, extra, conflicts },
      });
      await tx.auditLog.upsert({
        where: { id: verificationAudit.id },
        create: verificationAudit,
        update: {},
      });
      return {
        backfill: updated,
        counts: { missing, fieldMismatch, extra, conflicts },
      };
    });
  }
}

export { LEGACY_BACKFILL_SOURCE };
