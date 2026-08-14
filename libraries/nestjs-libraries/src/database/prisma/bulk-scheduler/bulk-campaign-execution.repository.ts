import { Injectable } from '@nestjs/common';
import {
  BulkCampaignIssueClass,
  BulkCampaignJob,
  BulkCampaignJobState,
  PostFailureClass,
  Prisma,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { cancelCalendarReservationsInTransaction } from './calendar-reservation.mutation';

export type CampaignJobCursor = { createdAt: Date; id: string } | null;

function auditId(action: string, ...parts: string[]) {
  return `bulk_exec_audit_${sha256([action, ...parts].join(':')).slice(0, 36)}`;
}

function auditData(input: {
  id: string;
  organizationId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    actorType: 'system',
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: JSON.stringify(input.metadata),
  };
}

@Injectable()
export class BulkCampaignExecutionRepository {
  constructor(
    private _db: PrismaRepository<
      | 'bulkCampaign'
      | 'bulkCampaignIntent'
      | 'bulkCampaignIssue'
      | 'bulkCampaignAsset'
      | 'bulkCampaignJob'
      | 'bulkPublishingJobAsset'
      | 'publishingJob'
      | 'post'
      | 'integration'
      | 'calendarReservation'
      | 'providerMediaGrant'
      | 'publishingAttempt'
      | 'auditLog'
      | '$executeRaw'
    >,
    private _transaction: PrismaTransaction
  ) {}

  getPlanningSource(organizationId: string, campaignId: string) {
    return this._db.model.bulkCampaign.findFirst({
      where: { id: campaignId, organizationId },
      include: {
        intents: {
          where: { organizationId },
          orderBy: { revision: 'desc' },
          take: 1,
        },
        assets: {
          where: { organizationId },
          include: { asset: true },
          orderBy: [{ position: 'asc' }, { assetId: 'asc' }],
        },
      },
    });
  }

  listPreservableJobs(organizationId: string, campaignId: string) {
    return this._db.model.bulkCampaignJob.findMany({
      where: {
        organizationId,
        campaignId,
        OR: [{ pinned: true }, { state: 'PUBLISHED' }],
      },
      orderBy: [
        { intentRevision: 'desc' },
        { updatedAt: 'desc' },
        { id: 'desc' },
      ],
      take: 100_001,
    });
  }

  countRevisionJobs(input: {
    organizationId: string;
    campaignId: string;
    intentRevision: number;
  }) {
    return this._db.model.bulkCampaignJob.count({ where: input });
  }

  async insertPlanChunk(input: {
    organizationId: string;
    campaignId: string;
    intentRevision: number;
    chunkOrdinal: number;
    jobs: Prisma.BulkCampaignJobCreateManyInput[];
    issues: Prisma.BulkCampaignIssueCreateManyInput[];
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const campaign = await tx.bulkCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: input.organizationId,
          currentRevision: input.intentRevision,
        },
        select: { id: true },
      });
      if (!campaign) return { type: 'stale' as const };
      const created = await tx.bulkCampaignJob.createMany({
        data: input.jobs,
        skipDuplicates: true,
      });
      const issueResult = input.issues.length
        ? await tx.bulkCampaignIssue.createMany({
            data: input.issues,
            skipDuplicates: true,
          })
        : { count: 0 };
      if (issueResult.count) {
        await tx.bulkCampaign.update({
          where: { id: input.campaignId },
          data: {
            issueCount: { increment: issueResult.count },
            openIssueCount: { increment: issueResult.count },
          },
        });
      }
      await tx.auditLog.upsert({
        where: {
          id: auditId(
            'bulk.campaign.plan-chunk',
            input.campaignId,
            String(input.intentRevision),
            String(input.chunkOrdinal)
          ),
        },
        create: auditData({
          id: auditId(
            'bulk.campaign.plan-chunk',
            input.campaignId,
            String(input.intentRevision),
            String(input.chunkOrdinal)
          ),
          organizationId: input.organizationId,
          action: 'bulk.campaign.plan-chunk',
          targetType: 'bulkCampaign',
          targetId: input.campaignId,
          metadata: {
            intentRevision: input.intentRevision,
            chunkOrdinal: input.chunkOrdinal,
            requestedJobs: input.jobs.length,
            insertedJobs: created.count,
            insertedIssues: issueResult.count,
          },
        }),
        update: {},
      });
      return {
        type: 'written' as const,
        insertedJobs: created.count,
        insertedIssues: issueResult.count,
      };
    });
  }

  listRevisionIntegrationIds(input: {
    organizationId: string;
    campaignId: string;
    intentRevision: number;
    states?: BulkCampaignJobState[];
  }) {
    return this._db.model.bulkCampaignJob.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        intentRevision: input.intentRevision,
        ...(input.states ? { state: { in: input.states } } : {}),
      },
      distinct: ['integrationId'],
      orderBy: [{ integrationId: 'asc' }],
      select: { integrationId: true },
    });
  }

  listRevisionJobsPage(input: {
    organizationId: string;
    campaignId: string;
    intentRevision: number;
    states?: BulkCampaignJobState[];
    integrationId?: string;
    afterOrdinal?: number;
    limit: number;
  }) {
    return this._db.model.bulkCampaignJob.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        intentRevision: input.intentRevision,
        ...(input.states ? { state: { in: input.states } } : {}),
        ...(input.integrationId ? { integrationId: input.integrationId } : {}),
        ...(input.afterOrdinal === undefined
          ? {}
          : { ordinal: { gt: input.afterOrdinal } }),
      },
      orderBy: [{ ordinal: 'asc' }],
      take: Math.max(1, Math.min(input.limit, 500)),
    });
  }

  async beginReservation(input: { organizationId: string; jobId: string }) {
    const changed = await this._db.model.bulkCampaignJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        state: { in: ['PLANNED', 'RETRYABLE_FAILURE', 'CONFLICTED'] },
      },
      data: {
        state: 'RESERVING',
        outcomeClass: null,
        outcomeCode: 'calendar_reservation_started',
        outcomeReason: 'Publishly is acquiring this campaign calendar slot.',
      },
    });
    return changed.count === 1;
  }

  async beginReservationBatch(input: {
    organizationId: string;
    campaignId: string;
    jobIds: string[];
  }) {
    if (!input.jobIds.length || input.jobIds.length > 500) {
      throw new Error('bulk_reservation_batch_size_invalid');
    }
    await this._db.model.bulkCampaignJob.updateMany({
      where: {
        id: { in: input.jobIds },
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        state: { in: ['PLANNED', 'RETRYABLE_FAILURE', 'CONFLICTED'] },
      },
      data: {
        state: 'RESERVING',
        outcomeClass: null,
        outcomeCode: 'calendar_reservation_started',
        outcomeReason: 'Publishly is acquiring this campaign calendar slot.',
      },
    });
    return this._db.model.bulkCampaignJob.count({
      where: {
        id: { in: input.jobIds },
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        state: 'RESERVING',
      },
    });
  }

  async linkReservation(input: {
    organizationId: string;
    jobId: string;
    reservationId: string;
    slot: {
      scheduledAt: Date;
      localScheduledAt: string;
      timezone: string;
      utcOffsetMinutes: number;
      dstFold: number | null;
    };
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const reservation = await tx.calendarReservation.findFirst({
        where: {
          id: input.reservationId,
          organizationId: input.organizationId,
          ownerType: 'BULK_CAMPAIGN_SLOT',
          ownerId: input.jobId,
          mode: 'AUTHORITATIVE',
          state: 'COMMITTED',
          scheduledAt: input.slot.scheduledAt,
        },
        select: { id: true },
      });
      if (!reservation) return false;
      const changed = await tx.bulkCampaignJob.updateMany({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          state: { in: ['RESERVING', 'RESERVED'] },
          OR: [{ reservationId: null }, { reservationId: input.reservationId }],
        },
        data: {
          state: 'RESERVED',
          reservationId: input.reservationId,
          ...input.slot,
          outcomeClass: null,
          outcomeCode: 'calendar_reserved',
          outcomeReason:
            'The campaign job owns a committed calendar reservation.',
        },
      });
      return changed.count === 1;
    });
  }

  async linkReservationBatch(input: {
    organizationId: string;
    campaignId: string;
    rows: Array<{
      jobId: string;
      reservationId: string;
      slot: {
        scheduledAt: Date;
        localScheduledAt: string;
        timezone: string;
        utcOffsetMinutes: number;
        dstFold: number | null;
      };
    }>;
  }) {
    if (!input.rows.length || input.rows.length > 500) {
      throw new Error('bulk_reservation_link_batch_size_invalid');
    }
    const values = input.rows.map(
      (row) =>
        Prisma.sql`(
        ${row.jobId}::text,
        ${row.reservationId}::text,
        ${row.slot.scheduledAt}::timestamptz,
        ${row.slot.localScheduledAt}::text,
        ${row.slot.timezone}::text,
        ${row.slot.utcOffsetMinutes}::int,
        ${row.slot.dstFold}::int
      )`
    );
    // This is one atomic SQL statement. Running it directly avoids imposing
    // Prisma's interactive-transaction lifetime on a bounded 500-row update.
    const changed = await this._db.model.$executeRaw(Prisma.sql`
        UPDATE "BulkCampaignJob" AS job
           SET "state" = 'RESERVED'::"BulkCampaignJobState",
               "reservationId" = batch."reservation_id",
               "scheduledAt" = batch."scheduled_at",
               "localScheduledAt" = batch."local_scheduled_at",
               "timezone" = batch."timezone",
               "utcOffsetMinutes" = batch."utc_offset_minutes",
               "dstFold" = batch."dst_fold",
               "outcomeClass" = NULL,
               "outcomeCode" = 'calendar_reserved',
               "outcomeReason" = 'The authoritative calendar ledger committed this campaign slot.',
               "updatedAt" = NOW()
          FROM (
            VALUES ${Prisma.join(values)}
          ) AS batch(
            "job_id",
            "reservation_id",
            "scheduled_at",
            "local_scheduled_at",
            "timezone",
            "utc_offset_minutes",
            "dst_fold"
          )
          INNER JOIN "CalendarReservation" AS reservation
             ON reservation."id" = batch."reservation_id"
            AND reservation."organizationId" = ${input.organizationId}
            AND reservation."ownerType" = 'BULK_CAMPAIGN_SLOT'::"CalendarReservationOwnerType"
            AND reservation."ownerId" = batch."job_id"
            AND reservation."mode" = 'AUTHORITATIVE'::"CalendarReservationMode"
            AND reservation."state" = 'COMMITTED'::"CalendarReservationState"
            AND reservation."scheduledAt" = batch."scheduled_at"
         WHERE job."id" = batch."job_id"
           AND job."organizationId" = ${input.organizationId}
           AND job."campaignId" = ${input.campaignId}
           AND job."state" = 'RESERVING'::"BulkCampaignJobState"
    `);
    return Number(changed);
  }

  async markOutcome(input: {
    organizationId: string;
    jobId: string;
    from: BulkCampaignJobState[];
    to: BulkCampaignJobState;
    outcomeClass?: BulkCampaignIssueClass | null;
    code: string;
    reason: string;
    now?: Date;
  }) {
    const now = input.now || new Date();
    const changed = await this._db.model.bulkCampaignJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        state: { in: input.from },
      },
      data: {
        state: input.to,
        outcomeClass: input.outcomeClass ?? null,
        outcomeCode: input.code,
        outcomeReason: input.reason,
        claimTokenHash: null,
        leaseExpiresAt: null,
        ...(input.to === 'PUBLISHED' ? { publishedAt: now } : {}),
        ...(input.to === 'CANCELLED' ? { cancelledAt: now } : {}),
      },
    });
    return changed.count === 1;
  }

  async recordJobIssue(input: {
    id: string;
    organizationId: string;
    campaignId: string;
    eventKey: string;
    issueClass: BulkCampaignIssueClass;
    failureClass: PostFailureClass;
    code: string;
    reason: string;
    jobId: string;
    retryable: boolean;
    details?: Prisma.InputJsonValue;
    occurredAt?: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const created = await tx.bulkCampaignIssue.createMany({
        data: [
          {
            id: input.id,
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            eventKey: input.eventKey,
            issueClass: input.issueClass,
            failureClass: input.failureClass,
            code: input.code,
            reason: input.reason,
            subjectType: 'publish_job',
            subjectId: input.jobId,
            retryable: input.retryable,
            details: input.details,
            occurredAt: input.occurredAt || new Date(),
          },
        ],
        skipDuplicates: true,
      });
      if (created.count) {
        await tx.bulkCampaign.updateMany({
          where: { id: input.campaignId, organizationId: input.organizationId },
          data: {
            issueCount: { increment: 1 },
            openIssueCount: { increment: 1 },
          },
        });
      }
      return created.count === 1;
    });
  }

  async claimDue(input: {
    /** Optional shard used by bounded workers and mandatory isolation/load gates. */
    organizationId?: string;
    horizon: Date;
    now: Date;
    limit: number;
    leaseExpiresAt: Date;
    claimTokenHash: string;
  }) {
    const tenantFilter = input.organizationId
      ? Prisma.sql`AND job."organizationId" = ${input.organizationId}`
      : Prisma.empty;
    return this._transaction.model.$transaction(async (tx) => {
      return tx.$queryRaw<BulkCampaignJob[]>(Prisma.sql`
        WITH candidates AS (
          SELECT job."id"
          FROM "BulkCampaignJob" AS job
          INNER JOIN "BulkCampaign" AS campaign
            ON campaign."id" = job."campaignId"
           AND campaign."organizationId" = job."organizationId"
          WHERE job."state" IN (
              'RESERVED'::"BulkCampaignJobState",
              'RETRYABLE_FAILURE'::"BulkCampaignJobState"
            )
            AND job."scheduledAt" <= ${input.horizon}
            AND (job."leaseExpiresAt" IS NULL OR job."leaseExpiresAt" <= ${input.now})
            ${tenantFilter}
            AND job."intentRevision" = campaign."currentRevision"
            AND campaign."state" IN ('SCHEDULED'::"BulkCampaignState", 'DISPATCHING'::"BulkCampaignState")
          ORDER BY job."scheduledAt" ASC, job."id" ASC
          FOR UPDATE OF job SKIP LOCKED
          LIMIT ${input.limit}
        )
        UPDATE "BulkCampaignJob" AS job
           SET "state" = 'CLAIMED'::"BulkCampaignJobState",
               "claimTokenHash" = ${input.claimTokenHash},
               "leaseExpiresAt" = ${input.leaseExpiresAt},
               "attemptCount" = job."attemptCount" + 1,
               "outcomeClass" = NULL,
               "outcomeCode" = 'materializer_claimed',
               "outcomeReason" = 'The bounded materializer claimed this due campaign job.',
               "updatedAt" = ${input.now}
          FROM candidates
         WHERE job."id" = candidates."id"
        RETURNING job.*
      `);
    });
  }

  markMaterializing(input: {
    organizationId: string;
    jobId: string;
    claimTokenHash: string;
    now: Date;
  }) {
    return this._db.model.bulkCampaignJob.updateMany({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        state: 'CLAIMED',
        claimTokenHash: input.claimTokenHash,
        leaseExpiresAt: { gt: input.now },
      },
      data: {
        state: 'MATERIALIZING',
        outcomeCode: 'materialization_started',
        outcomeReason:
          'Publishly is materializing this job through the V109 Post path.',
      },
    });
  }

  getJobContext(organizationId: string, jobId: string) {
    return this._db.model.bulkCampaignJob.findFirst({
      where: { id: jobId, organizationId },
      include: {
        campaign: {
          include: {
            intents: {
              where: { organizationId },
              orderBy: { revision: 'desc' },
              take: 1,
            },
          },
        },
        asset: true,
        integration: true,
        reservation: true,
        publishingJob: true,
        post: true,
      },
    });
  }

  async attachMaterialized(input: {
    organizationId: string;
    jobId: string;
    claimTokenHash: string;
    postId: string;
    publishingJobId: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.bulkCampaignJob.findFirst({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          state: 'MATERIALIZING',
          claimTokenHash: input.claimTokenHash,
          leaseExpiresAt: { gt: input.now },
        },
      });
      if (!job) return { type: 'claim_lost' as const };
      const publishingJob = await tx.publishingJob.findFirst({
        where: {
          id: input.publishingJobId,
          organizationId: input.organizationId,
          postId: input.postId,
          integrationId: job.integrationId,
        },
      });
      if (!publishingJob) return { type: 'publishing_job_mismatch' as const };
      await tx.bulkPublishingJobAsset.upsert({
        where: {
          publishingJobId_assetId_organizationId: {
            publishingJobId: publishingJob.id,
            assetId: job.assetId,
            organizationId: input.organizationId,
          },
        },
        create: {
          organizationId: input.organizationId,
          publishingJobId: publishingJob.id,
          assetId: job.assetId,
          ordinal: 0,
        },
        update: {},
      });
      const changed = await tx.bulkCampaignJob.updateMany({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          state: 'MATERIALIZING',
          claimTokenHash: input.claimTokenHash,
        },
        data: {
          state: 'SCHEDULED',
          postId: input.postId,
          publishingJobId: publishingJob.id,
          claimTokenHash: null,
          leaseExpiresAt: null,
          materializedAt: input.now,
          outcomeClass: null,
          outcomeCode: 'materialized_v109',
          outcomeReason:
            'The campaign job was linked to the only V109 publishing path.',
        },
      });
      if (changed.count !== 1) return { type: 'claim_lost' as const };
      await tx.auditLog.upsert({
        where: { id: auditId('bulk.campaign.job-materialized', job.id) },
        create: auditData({
          id: auditId('bulk.campaign.job-materialized', job.id),
          organizationId: input.organizationId,
          action: 'bulk.campaign.job-materialized',
          targetType: 'bulkCampaignJob',
          targetId: job.id,
          metadata: {
            campaignId: job.campaignId,
            postId: input.postId,
            publishingJobId: publishingJob.id,
            capabilityTupleId: job.capabilityTupleId,
          },
        }),
        update: {},
      });
      return { type: 'attached' as const, jobId: job.id };
    });
  }

  getDispatchContext(organizationId: string, postId: string) {
    return this._db.model.bulkCampaignJob.findFirst({
      where: { organizationId, postId },
      include: {
        campaign: true,
        asset: true,
        integration: true,
        reservation: true,
        publishingJob: true,
      },
    });
  }

  listCancellingCampaigns(limit: number) {
    return this._db.model.bulkCampaign.findMany({
      where: { state: 'CANCELLING' },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(limit, 50)),
      select: { id: true, organizationId: true },
    });
  }

  async cancelCampaignBatch(input: {
    organizationId: string;
    campaignId: string;
    limit: number;
    userId?: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.campaignId}:cancel`}, 0))`;
      const campaign = await tx.bulkCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: input.organizationId,
          state: 'CANCELLING',
        },
        select: { id: true },
      });
      if (!campaign) return { type: 'not_cancelling' as const };
      const cancellableStates: BulkCampaignJobState[] = [
        'PLANNED',
        'RESERVING',
        'RESERVED',
        'CLAIMED',
        'MATERIALIZING',
        'SCHEDULED',
        'PAUSED',
        'RETRYABLE_FAILURE',
        'CONFLICTED',
        'OVERFLOW',
        'QUARANTINED',
        'BLOCKED',
      ];
      const jobs = await tx.bulkCampaignJob.findMany({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          pinned: false,
          state: { in: cancellableStates },
        },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        take: Math.max(1, Math.min(input.limit, 500)),
        select: {
          id: true,
          postId: true,
          publishingJobId: true,
          reservationId: true,
        },
      });
      const ids = jobs.map((job) => job.id);
      const postIds = jobs.flatMap((job) => (job.postId ? [job.postId] : []));
      const publishingJobIds = jobs.flatMap((job) =>
        job.publishingJobId ? [job.publishingJobId] : []
      );
      const reservationIds = jobs.flatMap((job) =>
        job.reservationId ? [job.reservationId] : []
      );
      if (reservationIds.length) {
        await cancelCalendarReservationsInTransaction(tx, {
          organizationId: input.organizationId,
          reservationIds,
          action: 'bulk.campaign.cancellation-reservations',
          subject: `${input.campaignId}:${ids[0]}:${ids.at(-1)}`,
          code: 'campaign_cancelled',
          reason:
            'The campaign was cancelled; this future unpinned calendar work will not dispatch.',
          actor: {
            userId: input.userId,
            actorType: input.userId ? 'user' : 'system',
          },
          now: input.now,
        });
      }
      if (publishingJobIds.length) {
        await tx.providerMediaGrant.updateMany({
          where: {
            organizationId: input.organizationId,
            publishingJobId: { in: publishingJobIds },
            revokedAt: null,
          },
          data: {
            revokedAt: input.now,
            revocationCode: 'campaign_cancelled',
          },
        });
        await tx.publishingJob.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: publishingJobIds },
            state: { notIn: ['PUBLISHED', 'CANCELLED'] },
          },
          data: {
            state: 'CANCELLED',
            completedAt: input.now,
            nextAttemptAt: null,
            lastError: null,
            failureCategory: null,
            failureClass: null,
            failureCode: null,
            failureReason: null,
          },
        });
      }
      if (postIds.length) {
        await tx.post.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: postIds },
            state: { not: 'PUBLISHED' },
            deletedAt: null,
          },
          data: { deletedAt: input.now },
        });
      }
      if (ids.length) {
        await tx.bulkCampaignJob.updateMany({
          where: {
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            id: { in: ids },
            pinned: false,
            state: { in: cancellableStates },
          },
          data: {
            state: 'CANCELLED',
            cancelledAt: input.now,
            claimTokenHash: null,
            leaseExpiresAt: null,
            outcomeClass: 'blocked',
            outcomeCode: 'campaign_cancelled',
            outcomeReason:
              'The campaign was cancelled before this item dispatched.',
          },
        });
      }
      const remaining = await tx.bulkCampaignJob.count({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          pinned: false,
          state: { in: cancellableStates },
        },
      });
      const needsReview = await tx.bulkCampaignJob.count({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          state: { in: ['DISPATCHING', 'NEEDS_REVIEW'] },
        },
      });
      if (ids.length) {
        const audit = `bulk_cancel_audit_${sha256(
          `${input.organizationId}:${input.campaignId}:${ids[0]}:${ids.at(-1)}`
        ).slice(0, 36)}`;
        await tx.auditLog.createMany({
          data: [
            {
              id: audit,
              organizationId: input.organizationId,
              userId: input.userId,
              actorType: input.userId ? 'user' : 'system',
              action: 'bulk.campaign.cancellation-batch',
              targetType: 'bulkCampaign',
              targetId: input.campaignId,
              metadata: JSON.stringify({
                firstJobId: ids[0],
                lastJobId: ids.at(-1),
                cancelledJobs: ids.length,
                cancelledPosts: postIds.length,
                cancelledReservations: reservationIds.length,
              }),
            },
          ],
          skipDuplicates: true,
        });
      }
        return {
          type: 'processed' as const,
          processed: ids.length,
          remaining,
          needsReview,
        };
      },
      // Cancelling 500 jobs updates their reservation evidence, jobs, optional
      // materialized publisher rows, counts, and one audit atomically. A busy
      // but healthy Postgres can exceed Prisma's 5-second default; the row
      // bound remains fixed and the lock wait/lifetime are explicit.
      { maxWait: 10_000, timeout: 30_000 }
    );
  }

  preserveJobsChunk(input: {
    organizationId: string;
    campaignId: string;
    intentRevision: number;
    rows: Array<{
      id: string;
      ordinal: number;
      destinationOrdinal: number;
    }>;
  }) {
    if (input.rows.length > 500) {
      throw new Error('bulk_preservation_chunk_too_large');
    }
    return this._transaction.model.$transaction(async (tx) => {
      let preserved = 0;
      for (const row of input.rows) {
        const changed = await tx.bulkCampaignJob.updateMany({
          where: {
            id: row.id,
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            OR: [{ pinned: true }, { state: 'PUBLISHED' }],
          },
          data: {
            intentRevision: input.intentRevision,
            ordinal: row.ordinal,
            destinationOrdinal: row.destinationOrdinal,
            revision: { increment: 1 },
            outcomeCode: 'preserved_during_replan',
            outcomeReason:
              'This published or manually pinned item retained its slot during replanning.',
          },
        });
        preserved += changed.count;
      }
      return { preserved };
    });
  }

  async retireStaleRevisionBatch(input: {
    organizationId: string;
    campaignId: string;
    currentRevision: number;
    limit: number;
    userId?: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const states: BulkCampaignJobState[] = [
        'PLANNED',
        'RESERVING',
        'RESERVED',
        'CLAIMED',
        'MATERIALIZING',
        'SCHEDULED',
        'PAUSED',
        'RETRYABLE_FAILURE',
        'CONFLICTED',
        'OVERFLOW',
        'QUARANTINED',
        'BLOCKED',
        'FINAL_FAILURE',
      ];
      const jobs = await tx.bulkCampaignJob.findMany({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          intentRevision: { lt: input.currentRevision },
          pinned: false,
          state: { in: states },
        },
        orderBy: [{ intentRevision: 'asc' }, { ordinal: 'asc' }, { id: 'asc' }],
        take: Math.max(1, Math.min(input.limit, 500)),
        select: {
          id: true,
          postId: true,
          publishingJobId: true,
          reservationId: true,
        },
      });
      const ids = jobs.map((job) => job.id);
      const postIds = jobs.flatMap((job) => (job.postId ? [job.postId] : []));
      const publishingJobIds = jobs.flatMap((job) =>
        job.publishingJobId ? [job.publishingJobId] : []
      );
      const reservationIds = jobs.flatMap((job) =>
        job.reservationId ? [job.reservationId] : []
      );
      if (reservationIds.length) {
        await cancelCalendarReservationsInTransaction(tx, {
          organizationId: input.organizationId,
          reservationIds,
          action: 'bulk.campaign.replan-reservations',
          subject: `${input.campaignId}:${input.currentRevision}:${
            ids[0]
          }:${ids.at(-1)}`,
          code: 'campaign_replanned',
          reason:
            'A newer campaign intent replaced this future unpinned calendar work.',
          actor: {
            userId: input.userId,
            actorType: input.userId ? 'user' : 'system',
          },
          now: input.now,
        });
      }
      if (publishingJobIds.length) {
        await tx.providerMediaGrant.updateMany({
          where: {
            organizationId: input.organizationId,
            publishingJobId: { in: publishingJobIds },
            revokedAt: null,
          },
          data: {
            revokedAt: input.now,
            revocationCode: 'campaign_replanned',
          },
        });
        await tx.publishingJob.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: publishingJobIds },
            state: { notIn: ['PUBLISHED', 'CANCELLED'] },
          },
          data: {
            state: 'CANCELLED',
            completedAt: input.now,
            nextAttemptAt: null,
          },
        });
      }
      if (postIds.length) {
        await tx.post.updateMany({
          where: {
            organizationId: input.organizationId,
            id: { in: postIds },
            state: { not: 'PUBLISHED' },
            deletedAt: null,
          },
          data: { deletedAt: input.now },
        });
      }
      if (ids.length) {
        await tx.bulkCampaignJob.updateMany({
          where: {
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            id: { in: ids },
            pinned: false,
            state: { in: states },
          },
          data: {
            state: 'CANCELLED',
            cancelledAt: input.now,
            claimTokenHash: null,
            leaseExpiresAt: null,
            outcomeClass: 'blocked',
            outcomeCode: 'campaign_replanned',
            outcomeReason:
              'A newer campaign intent replaced this future unpinned item.',
          },
        });
      }
      const remaining = await tx.bulkCampaignJob.count({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          intentRevision: { lt: input.currentRevision },
          pinned: false,
          state: { in: states },
        },
      });
      return { retired: ids.length, remaining };
    });
  }

  async markCampaignDispatching(input: {
    organizationId: string;
    campaignId: string;
  }) {
    const changed = await this._db.model.bulkCampaign.updateMany({
      where: {
        id: input.campaignId,
        organizationId: input.organizationId,
        state: 'SCHEDULED',
      },
      data: { state: 'DISPATCHING' },
    });
    return changed.count === 1;
  }

  listJobs(input: {
    organizationId: string;
    campaignId: string;
    state?: BulkCampaignJobState;
    cursor: CampaignJobCursor;
    limit: number;
  }) {
    return this._db.model.bulkCampaignJob.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { gt: input.cursor.createdAt } },
                {
                  createdAt: input.cursor.createdAt,
                  id: { gt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
  }

  async setJobPinned(input: {
    organizationId: string;
    campaignId: string;
    jobId: string;
    expectedRevision: number;
    pinned: boolean;
    userId?: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.jobId}:pin`}, 0))`;
      const job = await tx.bulkCampaignJob.findFirst({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
        },
        include: { reservation: true, post: { select: { state: true } } },
      });
      if (!job) return { type: 'not_found' as const };
      if (job.post?.state === 'PUBLISHED' && !input.pinned) {
        return { type: 'published_immutable' as const, job };
      }
      if (
        job.pinned === input.pinned &&
        job.reservation?.pinned === input.pinned
      ) {
        return { type: 'replay' as const, job };
      }
      if (job.revision !== input.expectedRevision) {
        return {
          type: 'revision_conflict' as const,
          currentRevision: job.revision,
        };
      }
      if (
        !job.reservation ||
        job.reservation.organizationId !== input.organizationId ||
        job.reservation.ownerType !== 'BULK_CAMPAIGN_SLOT' ||
        job.reservation.ownerId !== job.id ||
        job.reservation.mode !== 'AUTHORITATIVE' ||
        job.reservation.state !== 'COMMITTED'
      ) {
        return { type: 'reservation_unavailable' as const, job };
      }
      if (
        !['RESERVED', 'SCHEDULED', 'PAUSED', 'PUBLISHED'].includes(job.state)
      ) {
        return { type: 'state_invalid' as const, state: job.state };
      }
      const changed = await tx.bulkCampaignJob.updateMany({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          revision: input.expectedRevision,
        },
        data: {
          pinned: input.pinned,
          revision: { increment: 1 },
          outcomeCode: input.pinned
            ? 'calendar_slot_pinned'
            : 'calendar_slot_unpinned',
          outcomeReason: input.pinned
            ? 'A user pinned this slot; future replanning will preserve it.'
            : 'A user unpinned this unpublished slot; future replanning may move it.',
        },
      });
      if (changed.count !== 1) return { type: 'revision_race' as const };
      await tx.calendarReservation.update({
        where: { id: job.reservation.id },
        data: {
          pinned: input.pinned,
          revision: { increment: 1 },
          outcomeCode: input.pinned
            ? 'calendar_slot_pinned'
            : 'calendar_slot_unpinned',
          outcomeReason: input.pinned
            ? 'A user pinned this authoritative campaign reservation.'
            : 'A user unpinned this unpublished authoritative campaign reservation.',
        },
      });
      const action = input.pinned
        ? 'bulk.campaign.job-pinned'
        : 'bulk.campaign.job-unpinned';
      const id = auditId(action, job.id, String(input.expectedRevision));
      await tx.auditLog.upsert({
        where: { id },
        create: {
          ...auditData({
            id,
            organizationId: input.organizationId,
            action,
            targetType: 'bulkCampaignJob',
            targetId: job.id,
            metadata: {
              campaignId: input.campaignId,
              reservationId: job.reservation.id,
              pinned: input.pinned,
              expectedRevision: input.expectedRevision,
            },
          }),
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
        update: {},
      });
      return {
        type: 'updated' as const,
        job: await tx.bulkCampaignJob.findUniqueOrThrow({
          where: { id: job.id },
        }),
      };
    });
  }

  async retryJob(input: {
    organizationId: string;
    campaignId: string;
    jobId: string;
    operationId: string;
    userId?: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.jobId}:retry`}, 0))`;
      const replay = await tx.auditLog.findFirst({
        where: { id: input.operationId, organizationId: input.organizationId },
      });
      const job = await tx.bulkCampaignJob.findFirst({
        where: {
          id: input.jobId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
        },
        include: {
          campaign: true,
          integration: true,
          reservation: true,
          publishingJob: {
            include: {
              publishingAttempts: {
                where: {
                  OR: [
                    { state: { in: ['AMBIGUOUS', 'NEEDS_REVIEW'] } },
                    { state: 'STARTED', mutationInvoked: true },
                  ],
                },
                take: 1,
              },
            },
          },
        },
      });
      if (!job) return { type: 'not_found' as const };
      if (replay) return { type: 'replay' as const, job };
      if (
        !['SCHEDULED', 'DISPATCHING', 'PAUSED'].includes(job.campaign.state)
      ) {
        return {
          type: 'campaign_state_invalid' as const,
          state: job.campaign.state,
        };
      }
      if (!['RETRYABLE_FAILURE', 'BLOCKED'].includes(job.state)) {
        return { type: 'state_invalid' as const, state: job.state };
      }
      if (job.integration.disabled) {
        return { type: 'connection_unavailable' as const };
      }
      if (
        !job.reservation ||
        job.reservation.mode !== 'AUTHORITATIVE' ||
        job.reservation.state !== 'COMMITTED' ||
        job.reservation.ownerId !== job.id
      ) {
        return { type: 'reservation_unavailable' as const };
      }
      if (job.publishingJob?.publishingAttempts.length) {
        return { type: 'ambiguity_unresolved' as const };
      }
      if (
        job.publishingJob &&
        !['FAILED', 'RETRYING'].includes(job.publishingJob.state)
      ) {
        return {
          type: 'publishing_state_invalid' as const,
          state: job.publishingJob.state,
        };
      }
      if (job.publishingJob) {
        await tx.publishingJob.update({
          where: { id: job.publishingJob.id },
          data: {
            state: 'RETRYING',
            nextAttemptAt: input.now,
            completedAt: null,
            lastError: null,
            failureCategory: null,
            failureClass: null,
            failureCode: null,
            failureReason: null,
          },
        });
      }
      const targetState = job.publishingJob ? 'SCHEDULED' : 'RESERVED';
      const updated = await tx.bulkCampaignJob.update({
        where: { id: job.id },
        data: {
          state: targetState,
          claimTokenHash: null,
          leaseExpiresAt: null,
          outcomeClass: null,
          outcomeCode: 'manual_retry_queued',
          outcomeReason: job.publishingJob
            ? 'A user queued a safe retry through the existing V109 publishing path.'
            : 'A user returned this item to the bounded campaign materializer.',
          revision: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          ...auditData({
            id: input.operationId,
            organizationId: input.organizationId,
            action: 'bulk.campaign.job-retry-requested',
            targetType: 'bulkCampaignJob',
            targetId: job.id,
            metadata: {
              campaignId: input.campaignId,
              publishingJobId: job.publishingJobId,
              targetState,
            },
          }),
          userId: input.userId,
          actorType: input.userId ? 'user' : 'system',
        },
      });
      return { type: 'queued' as const, job: updated };
    });
  }
}
