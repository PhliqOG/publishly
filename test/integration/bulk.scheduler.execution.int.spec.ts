import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { BulkCampaignExecutionRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.repository';
import { PublishingAttemptRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-attempt.repository';
import { PublishingAttemptService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-attempt.service';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const transaction = new PrismaTransaction(prisma as any);
const execution = new BulkCampaignExecutionRepository(
  new PrismaRepository(prisma as any) as any,
  transaction
);
const attempts = new PublishingAttemptService(
  new PublishingAttemptRepository(
    new PrismaRepository(prisma as any) as any,
    transaction
  )
);
const organizations: string[] = [];

const intent = {
  schemaVersion: 1,
  selection: {
    destinations: [
      {
        integrationId: 'fixture-replaced',
        capabilityTupleId: 'instagram.professional.reel.video',
      },
    ],
  },
  distribution: { mode: 'cross_post' },
  cadence: { scope: 'per_account', postsPerDay: 3 },
  schedule: {
    startDate: '2026-09-01',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timezone: 'UTC',
    windowStart: '09:00',
    windowEnd: '17:00',
    spacingMinutes: 60,
    slotStrategy: 'even',
    conflictBehavior: 'next_available',
  },
  ordering: { mode: 'upload' },
};

async function seedTenant(prefix: string) {
  const suffix = randomUUID();
  const organizationId = `${prefix}_org_${suffix}`;
  const integrationId = `${prefix}_integration_${suffix}`;
  const campaignId = `${prefix}_campaign_${suffix}`;
  organizations.push(organizationId);
  await prisma.organization.create({
    data: { id: organizationId, name: `${prefix} execution tenant` },
  });
  await prisma.integration.create({
    data: {
      id: integrationId,
      organizationId,
      internalId: `${prefix}_internal_${suffix}`,
      name: `${prefix} test destination`,
      providerIdentifier: 'testprovider',
      token: 'test-only-token',
      type: 'social',
    },
  });
  await prisma.bulkCampaign.create({
    data: {
      id: campaignId,
      organizationId,
      name: `${prefix} campaign`,
      idempotencyKeyHash: `${prefix}_key_${suffix}`,
      requestHash: `${prefix}_request_${suffix}`,
      state: 'SCHEDULED',
    },
  });
  await prisma.bulkCampaignIntent.create({
    data: {
      id: `${prefix}_intent_${suffix}`,
      organizationId,
      campaignId,
      revision: 1,
      intent: {
        ...intent,
        selection: {
          destinations: [
            {
              integrationId,
              capabilityTupleId: 'instagram.professional.reel.video',
            },
          ],
        },
      } as Prisma.InputJsonValue,
      intentHash: 'a'.repeat(64),
    },
  });
  return { organizationId, integrationId, campaignId, suffix };
}

async function seedAssets(
  tenant: Awaited<ReturnType<typeof seedTenant>>,
  count: number
) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `asset_${tenant.suffix}_${index}`,
    organizationId: tenant.organizationId,
    storageKey: `bulk-test/${tenant.suffix}/${index}.mp4`,
    originalName: `${index}.mp4`,
    mimeType: 'video/mp4',
    byteLength: 1_024 + index,
    sha256: `${index}`.padStart(64, '0'),
    state: 'READY' as const,
  }));
  await prisma.bulkAsset.createMany({ data: rows });
  await prisma.bulkCampaignAsset.createMany({
    data: rows.map((row, position) => ({
      organizationId: tenant.organizationId,
      campaignId: tenant.campaignId,
      assetId: row.id,
      position,
    })),
  });
  return rows;
}

function jobData(input: {
  tenant: Awaited<ReturnType<typeof seedTenant>>;
  assetId: string;
  ordinal: number;
  state?: 'RESERVED' | 'SCHEDULED' | 'DISPATCHING' | 'BLOCKED';
  pinned?: boolean;
  postId?: string;
  publishingJobId?: string;
  reservationId?: string;
}) {
  return {
    id: `job_${input.tenant.suffix}_${input.ordinal}`,
    organizationId: input.tenant.organizationId,
    campaignId: input.tenant.campaignId,
    intentRevision: 1,
    assetId: input.assetId,
    integrationId: input.tenant.integrationId,
    capabilityTupleId: 'instagram.professional.reel.video',
    ordinal: input.ordinal,
    destinationOrdinal: 0,
    state: input.state || ('RESERVED' as const),
    scheduledAt: new Date(Date.now() - 60_000 + input.ordinal),
    localScheduledAt: '2026-09-01T09:00:00',
    timezone: 'UTC',
    utcOffsetMinutes: 0,
    dstFold: null,
    pinned: input.pinned || false,
    postId: input.postId,
    publishingJobId: input.publishingJobId,
    reservationId: input.reservationId,
    outcomeClass: input.state === 'BLOCKED' ? ('blocked' as const) : undefined,
    outcomeCode:
      input.state === 'BLOCKED'
        ? 'connection_disconnected'
        : 'calendar_reserved',
    outcomeReason:
      input.state === 'BLOCKED'
        ? 'Reconnect this designated test destination.'
        : 'The real database fixture owns a reserved slot.',
    ...(input.state === 'DISPATCHING' ? { dispatchedAt: new Date() } : {}),
  };
}

async function cleanupOrganization(organizationId: string) {
  await prisma.providerMediaFetchEvent.deleteMany({
    where: { organizationId },
  });
  await prisma.providerMediaGrant.deleteMany({ where: { organizationId } });
  await prisma.publishingAttempt.deleteMany({ where: { organizationId } });
  await prisma.bulkPublishingJobAsset.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignJob.deleteMany({ where: { organizationId } });
  await prisma.calendarReservation.deleteMany({ where: { organizationId } });
  await prisma.publishingReceipt.deleteMany({ where: { organizationId } });
  await prisma.publishingFailure.deleteMany({ where: { organizationId } });
  await prisma.accountPublishingQueueItem.deleteMany({
    where: { organizationId },
  });
  await prisma.publishingJob.deleteMany({ where: { organizationId } });
  await prisma.post.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignIssue.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignAsset.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignIntent.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaign.deleteMany({ where: { organizationId } });
  await prisma.bulkAsset.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.integration.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

describe('Bulk Scheduler Stage 6 durable execution integration', () => {
  jest.setTimeout(120_000);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    for (const organizationId of organizations.reverse()) {
      await cleanupOrganization(organizationId);
    }
    await prisma.$disconnect();
  });

  it('enforces tenant-qualified links and mandatory classified failure outcomes', async () => {
    const tenantA = await seedTenant('tenant_a');
    const tenantB = await seedTenant('tenant_b');
    const [assetA] = await seedAssets(tenantA, 1);
    const [assetB] = await seedAssets(tenantB, 1);

    await expect(
      prisma.bulkCampaignJob.create({
        data: {
          ...jobData({ tenant: tenantB, assetId: assetA.id, ordinal: 0 }),
          integrationId: tenantA.integrationId,
        },
      })
    ).rejects.toThrow();

    await expect(
      prisma.bulkCampaignJob.create({
        data: {
          ...jobData({
            tenant: tenantB,
            assetId: assetB.id,
            ordinal: 1,
            state: 'BLOCKED',
          }),
          outcomeClass: null,
        },
      })
    ).rejects.toThrow();

    expect(
      await prisma.bulkCampaignJob.count({
        where: { organizationId: tenantB.organizationId },
      })
    ).toBe(0);
  });

  it('claims due jobs in bounded disjoint sets with SKIP LOCKED', async () => {
    const tenant = await seedTenant('claims');
    const assets = await seedAssets(tenant, 12);
    await prisma.bulkCampaignJob.createMany({
      data: assets.map((asset, ordinal) =>
        jobData({ tenant, assetId: asset.id, ordinal })
      ),
    });
    const now = new Date();
    const [left, right] = await Promise.all([
      execution.claimDue({
        horizon: new Date(now.getTime() + 60_000),
        now,
        limit: 7,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        claimTokenHash: 'claim-left',
      }),
      execution.claimDue({
        horizon: new Date(now.getTime() + 60_000),
        now,
        limit: 7,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        claimTokenHash: 'claim-right',
      }),
    ]);
    const leftIds = new Set(left.map((job) => job.id));
    const rightIds = new Set(right.map((job) => job.id));
    expect(left.length + right.length).toBe(12);
    expect([...leftIds].filter((id) => rightIds.has(id))).toEqual([]);
    expect(
      await prisma.bulkCampaignJob.count({
        where: { organizationId: tenant.organizationId, state: 'CLAIMED' },
      })
    ).toBe(12);
  });

  it('turns accepted-then-timeout into readback and never allocates a second mutation', async () => {
    const tenant = await seedTenant('ambiguous');
    const [asset] = await seedAssets(tenant, 1);
    const post = await prisma.post.create({
      data: {
        id: `post_${tenant.suffix}`,
        organizationId: tenant.organizationId,
        integrationId: tenant.integrationId,
        state: 'QUEUE',
        publishDate: new Date(),
        content: 'Ambiguous acceptance integration proof',
        group: `group_${tenant.suffix}`,
        settings: '{}',
        image: '[]',
      },
    });
    const publishingJob = await prisma.publishingJob.create({
      data: {
        id: `publishing_${tenant.suffix}`,
        organizationId: tenant.organizationId,
        integrationId: tenant.integrationId,
        postId: post.id,
        provider: 'testprovider',
        state: 'PROCESSING',
        idempotencyKey: `publish:${post.id}`,
      },
    });
    await prisma.bulkCampaignJob.create({
      data: jobData({
        tenant,
        assetId: asset.id,
        ordinal: 0,
        state: 'SCHEDULED',
        postId: post.id,
        publishingJobId: publishingJob.id,
      }),
    });
    const context = {
      attemptNumber: 1,
      activityKey: `v109:mutation:${post.id}:1`,
    };
    const first = await attempts.beginMutation({
      organizationId: tenant.organizationId,
      postId: post.id,
      provider: 'testprovider',
      posts: [{ id: post.id, content: post.content }],
      context,
    });
    expect(first.terminalReplay).toBe(false);
    await attempts.markMutationInvoked({
      organizationId: tenant.organizationId,
      postId: post.id,
      attemptId: first.attempt.id,
      mutationFingerprint: first.mutationFingerprint,
    });
    await attempts.failed({
      organizationId: tenant.organizationId,
      attemptId: first.attempt.id,
      mutationFingerprint: first.mutationFingerprint,
      error: new Error('provider accepted the post and the response timed out'),
      safeAbsentProof: false,
    });

    const replay = await attempts.beginMutation({
      organizationId: tenant.organizationId,
      postId: post.id,
      provider: 'testprovider',
      posts: [{ id: post.id, content: post.content }],
      context,
    });
    expect(replay.terminalReplay).toBe(true);
    expect(replay.attempt.id).toBe(first.attempt.id);
    expect(
      await prisma.publishingAttempt.count({
        where: {
          organizationId: tenant.organizationId,
          publishingJobId: publishingJob.id,
          phase: 'MUTATION',
        },
      })
    ).toBe(1);

    const reconciliation = await attempts.beginReconciliation({
      organizationId: tenant.organizationId,
      postId: post.id,
      attemptNumber: 1,
    });
    await attempts.completeReconciliation({
      organizationId: tenant.organizationId,
      postId: post.id,
      attemptId: reconciliation.attempt.id,
      mutationFingerprint: reconciliation.mutation.mutationFingerprint,
      result: {
        status: 'inconclusive',
        method: 'designated-test-readback',
        reason: 'The designated provider readback could not prove absence.',
      },
    });
    await expect(
      attempts.beginMutation({
        organizationId: 'wrong-tenant',
        postId: post.id,
        provider: 'testprovider',
        posts: [{ id: post.id }],
        context,
      })
    ).rejects.toThrow('publishing_attempt_job_not_found');
    expect(
      await prisma.bulkCampaignJob.findUnique({
        where: { id: `job_${tenant.suffix}_0` },
        select: {
          state: true,
          outcomeClass: true,
          outcomeCode: true,
          outcomeReason: true,
        },
      })
    ).toMatchObject({
      state: 'NEEDS_REVIEW',
      outcomeClass: 'blocked',
      outcomeCode: 'provider_timeout_ambiguous',
      outcomeReason:
        'The designated provider readback could not prove absence.',
    });
  });

  it('serializes concurrent cancellation chunks and preserves pinned or in-flight work', async () => {
    const tenant = await seedTenant('cancel');
    await prisma.bulkCampaign.update({
      where: { id: tenant.campaignId },
      data: { state: 'CANCELLING' },
    });
    const assets = await seedAssets(tenant, 14);
    await prisma.bulkCampaignJob.createMany({
      data: assets.map((asset, ordinal) =>
        jobData({
          tenant,
          assetId: asset.id,
          ordinal,
          state: ordinal >= 12 ? 'DISPATCHING' : 'RESERVED',
          pinned: ordinal >= 10 && ordinal < 12,
        })
      ),
    });
    const now = new Date();
    const [first, second] = await Promise.all([
      execution.cancelCampaignBatch({
        organizationId: tenant.organizationId,
        campaignId: tenant.campaignId,
        limit: 5,
        now,
      }),
      execution.cancelCampaignBatch({
        organizationId: tenant.organizationId,
        campaignId: tenant.campaignId,
        limit: 5,
        now,
      }),
    ]);
    expect(first.type).toBe('processed');
    expect(second.type).toBe('processed');
    expect(first.processed + second.processed).toBe(10);
    const states = await prisma.bulkCampaignJob.groupBy({
      by: ['state'],
      where: { organizationId: tenant.organizationId },
      _count: { _all: true },
    });
    expect(
      Object.fromEntries(states.map((row) => [row.state, row._count._all]))
    ).toEqual({
      CANCELLED: 10,
      RESERVED: 2,
      DISPATCHING: 2,
    });
    const cancelled = await prisma.bulkCampaignJob.findMany({
      where: { organizationId: tenant.organizationId, state: 'CANCELLED' },
    });
    expect(cancelled).toHaveLength(10);
    expect(
      cancelled.every(
        (job) =>
          job.outcomeClass === 'blocked' &&
          job.outcomeCode === 'campaign_cancelled' &&
          Boolean(job.outcomeReason) &&
          Boolean(job.cancelledAt)
      )
    ).toBe(true);
  });

  it('pins the job and authoritative reservation atomically and replays the same desired state', async () => {
    const tenant = await seedTenant('pin');
    const [asset] = await seedAssets(tenant, 1);
    const jobId = `job_${tenant.suffix}_0`;
    const reservationId = `reservation_${tenant.suffix}`;
    await prisma.calendarReservation.create({
      data: {
        id: reservationId,
        organizationId: tenant.organizationId,
        integrationId: tenant.integrationId,
        ownerType: 'BULK_CAMPAIGN_SLOT',
        ownerId: jobId,
        campaignId: tenant.campaignId,
        source: 'bulk_scheduler_v1',
        writer: 'bulk_campaign_execution',
        mode: 'AUTHORITATIVE',
        state: 'COMMITTED',
        scheduledAt: new Date('2026-09-01T09:00:00.000Z'),
        localScheduledAt: '2026-09-01T09:00:00',
        timezone: 'UTC',
        utcOffsetMinutes: 0,
        idempotencyKey: `reservation:${jobId}`,
        requestHash: 'b'.repeat(64),
        outcomeCode: 'calendar_reserved',
        outcomeReason:
          'The test slot is committed in the authoritative ledger.',
      },
    });
    await prisma.bulkCampaignJob.create({
      data: jobData({
        tenant,
        assetId: asset.id,
        ordinal: 0,
        reservationId,
      }),
    });
    const pinned = await execution.setJobPinned({
      organizationId: tenant.organizationId,
      campaignId: tenant.campaignId,
      jobId,
      expectedRevision: 1,
      pinned: true,
      now: new Date(),
    });
    expect(pinned.type).toBe('updated');
    expect(
      await prisma.bulkCampaignJob.findUnique({ where: { id: jobId } })
    ).toMatchObject({
      pinned: true,
      revision: 2,
      outcomeCode: 'calendar_slot_pinned',
    });
    expect(
      await prisma.calendarReservation.findUnique({
        where: { id: reservationId },
      })
    ).toMatchObject({
      pinned: true,
      revision: 2,
      outcomeCode: 'calendar_slot_pinned',
    });
    await expect(
      execution.setJobPinned({
        organizationId: 'wrong-tenant',
        campaignId: tenant.campaignId,
        jobId,
        expectedRevision: 2,
        pinned: false,
        now: new Date(),
      })
    ).resolves.toEqual({ type: 'not_found' });
    expect(
      (
        await execution.setJobPinned({
          organizationId: tenant.organizationId,
          campaignId: tenant.campaignId,
          jobId,
          expectedRevision: 1,
          pinned: true,
          now: new Date(),
        })
      ).type
    ).toBe('replay');
  });

  it('requeues a safe item idempotently but refuses unresolved provider ambiguity', async () => {
    const tenant = await seedTenant('manual_retry');
    const [asset] = await seedAssets(tenant, 1);
    const jobId = `job_${tenant.suffix}_0`;
    const reservationId = `reservation_${tenant.suffix}`;
    await prisma.calendarReservation.create({
      data: {
        id: reservationId,
        organizationId: tenant.organizationId,
        integrationId: tenant.integrationId,
        ownerType: 'BULK_CAMPAIGN_SLOT',
        ownerId: jobId,
        campaignId: tenant.campaignId,
        source: 'bulk_scheduler_v1',
        writer: 'bulk_campaign_execution',
        mode: 'AUTHORITATIVE',
        state: 'COMMITTED',
        scheduledAt: new Date('2026-09-01T09:00:00.000Z'),
        localScheduledAt: '2026-09-01T09:00:00',
        timezone: 'UTC',
        utcOffsetMinutes: 0,
        idempotencyKey: `reservation:${jobId}`,
        requestHash: 'c'.repeat(64),
        outcomeCode: 'calendar_reserved',
        outcomeReason:
          'The test slot is committed in the authoritative ledger.',
      },
    });
    await prisma.bulkCampaignJob.create({
      data: {
        ...jobData({
          tenant,
          assetId: asset.id,
          ordinal: 0,
          reservationId,
        }),
        state: 'RETRYABLE_FAILURE',
        outcomeClass: 'failed',
        outcomeCode: 'provider_unavailable',
        outcomeReason: 'The provider was temporarily unavailable.',
      },
    });
    const operationId = `manual-retry-${tenant.suffix}`;
    expect(
      (
        await execution.retryJob({
          organizationId: tenant.organizationId,
          campaignId: tenant.campaignId,
          jobId,
          operationId,
          now: new Date(),
        })
      ).type
    ).toBe('queued');
    expect(
      (
        await execution.retryJob({
          organizationId: tenant.organizationId,
          campaignId: tenant.campaignId,
          jobId,
          operationId,
          now: new Date(),
        })
      ).type
    ).toBe('replay');
    expect(
      await prisma.bulkCampaignJob.findUnique({ where: { id: jobId } })
    ).toMatchObject({ state: 'RESERVED', outcomeCode: 'manual_retry_queued' });

    await prisma.bulkCampaignJob.update({
      where: { id: jobId },
      data: {
        state: 'RETRYABLE_FAILURE',
        outcomeClass: 'failed',
        outcomeCode: 'provider_timeout_ambiguous',
        outcomeReason: 'Provider acceptance could not be disproved.',
      },
    });
    const post = await prisma.post.create({
      data: {
        id: `post_retry_${tenant.suffix}`,
        organizationId: tenant.organizationId,
        integrationId: tenant.integrationId,
        state: 'ERROR',
        publishDate: new Date(),
        content: 'Ambiguous manual retry guard',
        group: `retry_group_${tenant.suffix}`,
        settings: '{}',
        image: '[]',
      },
    });
    const publishingJob = await prisma.publishingJob.create({
      data: {
        id: `publishing_retry_${tenant.suffix}`,
        organizationId: tenant.organizationId,
        integrationId: tenant.integrationId,
        postId: post.id,
        provider: 'testprovider',
        state: 'FAILED',
        idempotencyKey: `publish:${post.id}`,
        lastError: 'Provider acceptance could not be disproved.',
        failureCategory: 'provider_timeout_ambiguous',
        failureClass: 'recoverable',
        failureCode: 'provider_timeout_ambiguous',
        failureReason: 'Provider acceptance could not be disproved.',
        completedAt: new Date(),
      },
    });
    await prisma.bulkCampaignJob.update({
      where: { id: jobId },
      data: { postId: post.id, publishingJobId: publishingJob.id },
    });
    await prisma.publishingAttempt.create({
      data: {
        id: `attempt_retry_${tenant.suffix}`,
        organizationId: tenant.organizationId,
        publishingJobId: publishingJob.id,
        attemptNumber: 1,
        phase: 'MUTATION',
        state: 'AMBIGUOUS',
        activityKey: `mutation:${post.id}:1`,
        mutationFingerprint: 'd'.repeat(64),
        mutationInvoked: true,
        failureClass: 'recoverable',
        failureCode: 'provider_timeout_ambiguous',
        failureReason: 'Provider acceptance could not be disproved.',
        completedAt: new Date(),
      },
    });
    expect(
      (
        await execution.retryJob({
          organizationId: tenant.organizationId,
          campaignId: tenant.campaignId,
          jobId,
          operationId: `manual-retry-ambiguous-${tenant.suffix}`,
          now: new Date(),
        })
      ).type
    ).toBe('ambiguity_unresolved');
  });
});
