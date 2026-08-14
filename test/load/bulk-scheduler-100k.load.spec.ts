import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

// This gate must prove planning/reservation/claim behavior without loading the
// browser-only Post DTO graph or invoking any publishing mutation.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);

import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { BulkCampaignRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign.repository';
import { BulkCampaignService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign.service';
import { BulkCampaignExecutionRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.repository';
import { BulkCampaignExecutionService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.service';
import { CalendarReservationRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.repository';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';
import { planBulkCampaign } from '@gitroom/helpers/bulk-scheduler/execution.contract';
import type { BulkCampaignIntentV1 } from '@gitroom/helpers/bulk-scheduler/campaign.contract';

const ASSET_COUNT = 1_000;
const DESTINATION_COUNT = 100;
const EXPECTED_JOBS = 100_000;
const TUPLE_ID = 'instagram.professional.reel.video';
const PAGE_SIZE = 100;
const CLAIM_WORKERS = 4;
const CLAIMS_PER_WORKER = 250;
const MAX_PEAK_RSS_MIB = 1_536;
const MAX_PLAN_AND_RESERVE_MS = 15 * 60_000;
const ARTIFACT_PATH = path.resolve(
  process.cwd(),
  'docs/evidence/bulk-scheduler/benchmarks/stage7-100k.json'
);

function assertDedicatedTestDatabase(value: string | undefined) {
  if (!value) throw new Error('TEST_DATABASE_URL is required for this mandatory suite.');
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/(?:^|[-_])(test|ci)(?:[-_]|$)/i.test(database)) {
    throw new Error(
      `Refusing 100,000-job workload against non-test database ${database}.`
    );
  }
  return database;
}

const expectedDatabase = assertDedicatedTestDatabase(
  process.env.TEST_DATABASE_URL
);
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const db = new PrismaRepository(prisma as any) as any;
const transaction = new PrismaTransaction(prisma as any);
const campaignRepository = new BulkCampaignRepository(db, transaction);
const campaigns = new BulkCampaignService(campaignRepository);
const reservationRepository = new CalendarReservationRepository(db, transaction);
const reservations = new CalendarReservationService(reservationRepository);
const executionRepository = new BulkCampaignExecutionRepository(db, transaction);
const execution = new BulkCampaignExecutionService(
  executionRepository,
  campaigns,
  reservations,
  {} as any
);

const runId = randomUUID();
const organizationId = `bulk_load_org_${runId}`;
const campaignId = `bulk_load_campaign_${runId}`;
const sentinelOrganizationId = `bulk_load_sentinel_org_${runId}`;
const integrationIds = Array.from(
  { length: DESTINATION_COUNT },
  (_, index) => `bulk_load_integration_${runId}_${String(index).padStart(3, '0')}`
);
const assets = Array.from({ length: ASSET_COUNT }, (_, index) => ({
  id: `bulk_load_asset_${runId}_${String(index).padStart(4, '0')}`,
  originalName: `${String(index).padStart(4, '0')}.mp4`,
  position: index,
}));
const intent: BulkCampaignIntentV1 = {
  schemaVersion: 1,
  selection: {
    destinations: integrationIds.map((integrationId) => ({
      integrationId,
      capabilityTupleId: TUPLE_ID,
    })),
  },
  distribution: { mode: 'cross_post' },
  cadence: { scope: 'per_account', postsPerDay: 100 },
  schedule: {
    startDate: '2099-01-04',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timezone: 'UTC',
    windowStart: '00:00',
    windowEnd: '23:59',
    spacingMinutes: 10,
    slotStrategy: 'even',
    conflictBehavior: 'next_available',
  },
  ordering: { mode: 'upload' },
  publication: { caption: 'Mandatory 100,000-job test fixture; never published.' },
};

const previousEnvironment = new Map<string, string | undefined>();
const controlledEnvironment: Record<string, string> = {
  BULK_SCHEDULER_KILL_ALL: 'false',
  BULK_SCHEDULER_KILL_INSTAGRAM_PROFESSIONAL_REEL_VIDEO: 'false',
  BULK_SCHEDULER_CANARY_MODE: 'true',
  BULK_SCHEDULER_CANARY_TUPLES: TUPLE_ID,
  BULK_SCHEDULER_CANARY_INTEGRATIONS: integrationIds.join(','),
  CALENDAR_RESERVATION_KILL_ALL: 'false',
  CALENDAR_RESERVATION_SHADOW_ENABLED: 'true',
  CALENDAR_RESERVATION_ENFORCEMENT: 'true',
  CALENDAR_RESERVATION_ENFORCED_TENANTS: organizationId,
};

type BenchmarkArtifact = {
  schemaVersion: number;
  stage: number;
  status: 'running' | 'passed' | 'failed';
  generatedAt: string;
  runId: string;
  gitRevision: string | null;
  runtime: { node: string; platform: string; arch: string };
  workload: Record<string, unknown>;
  thresholds: Record<string, number>;
  timingsMs: Record<string, number>;
  counts: Record<string, number>;
  checks: Record<string, boolean>;
  memory: {
    startRssMiB: number;
    peakRssMiB: number;
    endRssMiB: number;
    peakHeapUsedMiB: number;
  };
  failure?: { name: string; message: string };
};

const toMiB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
const startedAt = performance.now();
const startMemory = process.memoryUsage();
let peakRss = startMemory.rss;
let peakHeapUsed = startMemory.heapUsed;
let memoryTimer: NodeJS.Timeout | undefined;
let seeded = false;
let cleaned = false;
const artifact: BenchmarkArtifact = {
  schemaVersion: 1,
  stage: 7,
  status: 'running',
  generatedAt: new Date().toISOString(),
  runId,
  gitRevision: process.env.GITHUB_SHA || null,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  workload: {
    assets: ASSET_COUNT,
    destinations: DESTINATION_COUNT,
    distribution: 'cross_post',
    cadenceScope: 'per_account',
    expandedJobs: EXPECTED_JOBS,
    formula: `${ASSET_COUNT} assets x ${DESTINATION_COUNT} destinations = ${EXPECTED_JOBS} jobs`,
    database: expectedDatabase,
    providerMutationInvoked: false,
  },
  thresholds: {
    maximumPeakRssMiB: MAX_PEAK_RSS_MIB,
    maximumPlanAndReserveMs: MAX_PLAN_AND_RESERVE_MS,
    maximumReservationBatch: 500,
    maximumCursorPage: PAGE_SIZE,
    maximumClaimBatch: CLAIMS_PER_WORKER,
    maximumCancellationBatch: 500,
  },
  timingsMs: {},
  counts: {},
  checks: {},
  memory: {
    startRssMiB: toMiB(startMemory.rss),
    peakRssMiB: toMiB(startMemory.rss),
    endRssMiB: toMiB(startMemory.rss),
    peakHeapUsedMiB: toMiB(startMemory.heapUsed),
  },
};

function persistArtifact() {
  const memory = process.memoryUsage();
  artifact.generatedAt = new Date().toISOString();
  artifact.memory = {
    startRssMiB: toMiB(startMemory.rss),
    peakRssMiB: toMiB(peakRss),
    endRssMiB: toMiB(memory.rss),
    peakHeapUsedMiB: toMiB(peakHeapUsed),
  };
  mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

async function measured<T>(name: string, work: () => Promise<T> | T) {
  const start = performance.now();
  try {
    return await work();
  } finally {
    artifact.timingsMs[name] = Math.round((performance.now() - start) * 100) / 100;
    persistArtifact();
  }
}

async function seed() {
  await prisma.organization.createMany({
    data: [
      { id: organizationId, name: 'Mandatory Bulk Scheduler load tenant' },
      {
        id: sentinelOrganizationId,
        name: 'Mandatory Bulk Scheduler isolation sentinel',
      },
    ],
  });
  seeded = true;
  await prisma.integration.createMany({
    data: integrationIds.map((id, index) => ({
      id,
      organizationId,
      internalId: `bulk_load_internal_${runId}_${index}`,
      name: `Designated load destination ${index}`,
      providerIdentifier: 'instagram',
      token: 'test-only-token-never-sent',
      type: 'social',
    })),
  });
  await prisma.bulkCampaign.create({
    data: {
      id: campaignId,
      organizationId,
      name: 'Mandatory 100,000-job campaign',
      state: 'DRAFT',
      idempotencyKeyHash: '1'.repeat(64),
      requestHash: '2'.repeat(64),
    },
  });
  await prisma.bulkCampaignIntent.create({
    data: {
      id: `bulk_load_intent_${runId}`,
      organizationId,
      campaignId,
      revision: 1,
      intent: intent as unknown as Prisma.InputJsonValue,
      intentHash: '3'.repeat(64),
    },
  });
  await prisma.bulkAsset.createMany({
    data: assets.map((asset, index) => ({
      id: asset.id,
      organizationId,
      storageKey: `bulk-load/${organizationId}/${asset.id}.mp4`,
      originalName: asset.originalName,
      mimeType: 'video/mp4',
      byteLength: 1_024 + index,
      sha256: index.toString(16).padStart(64, '0'),
      state: 'READY' as const,
    })),
  });
  await prisma.bulkCampaignAsset.createMany({
    data: assets.map((asset) => ({
      organizationId,
      campaignId,
      assetId: asset.id,
      position: asset.position,
    })),
  });
  const cutoverAt = new Date();
  await prisma.calendarReservationBackfill.create({
    data: {
      id: `bulk_load_backfill_${runId}`,
      organizationId,
      source: 'legacy_post_backfill_v1',
      state: 'VERIFIED',
      outcomeCode: 'calendar_backfill_verified',
      outcomeReason:
        'The isolated load tenant contains no legacy Posts and is verified for authoritative reservations.',
      startedAt: cutoverAt,
      completedAt: cutoverAt,
      verifiedAt: cutoverAt,
      authorityActivatedAt: cutoverAt,
    },
  });
  await prisma.auditLog.create({
    data: {
      id: `bulk_load_sentinel_audit_${runId}`,
      organizationId: sentinelOrganizationId,
      actorType: 'system',
      action: 'bulk.load.foreign-sentinel',
      targetType: 'bulkCampaign',
      targetId: `foreign_${runId}`,
      metadata: JSON.stringify({ organizationId: sentinelOrganizationId }),
    },
  });
}

async function cleanup() {
  if (!seeded || cleaned) return;
  await prisma.providerMediaFetchEvent.deleteMany({ where: { organizationId } });
  await prisma.providerMediaGrant.deleteMany({ where: { organizationId } });
  await prisma.publishingAttempt.deleteMany({ where: { organizationId } });
  await prisma.bulkPublishingJobAsset.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignJob.deleteMany({ where: { organizationId } });
  await prisma.bulkUploadPart.deleteMany({ where: { organizationId } });
  await prisma.bulkUploadSession.deleteMany({ where: { organizationId } });
  await prisma.calendarReservation.deleteMany({ where: { organizationId } });
  await prisma.calendarReservationBackfill.deleteMany({
    where: { organizationId },
  });
  await prisma.bulkCampaignIssue.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignAsset.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignIntent.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaign.deleteMany({ where: { organizationId } });
  await prisma.publishingReceipt.deleteMany({ where: { organizationId } });
  await prisma.publishingFailure.deleteMany({ where: { organizationId } });
  await prisma.publishingJob.deleteMany({ where: { organizationId } });
  await prisma.post.deleteMany({ where: { organizationId } });
  await prisma.bulkAsset.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({
    where: { organizationId: { in: [organizationId, sentinelOrganizationId] } },
  });
  await prisma.integration.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({
    where: { id: { in: [organizationId, sentinelOrganizationId] } },
  });
  cleaned = true;
}

describe('Bulk Scheduler mandatory 100,000-job database gate', () => {
  jest.setTimeout(30 * 60_000);
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    for (const [key, value] of Object.entries(controlledEnvironment)) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
    await prisma.$connect();
    const [{ current_database: currentDatabase }] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(currentDatabase).toBe(expectedDatabase);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    memoryTimer = setInterval(() => {
      const current = process.memoryUsage();
      peakRss = Math.max(peakRss, current.rss);
      peakHeapUsed = Math.max(peakHeapUsed, current.heapUsed);
    }, 100);
    persistArtifact();
  });

  afterAll(async () => {
    if (memoryTimer) clearInterval(memoryTimer);
    await cleanup();
    await prisma.$disconnect();
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('plans, reserves, pages, claims, retries, pauses, cancels, aggregates, and isolates exactly 100,000 jobs', async () => {
    try {
      const purePlan = await measured('purePlanner', () =>
        planBulkCampaign({ assets, intent })
      );
      expect(purePlan.expansion).toMatchObject({
        assetCount: ASSET_COUNT,
        destinationCount: DESTINATION_COUNT,
        expandedJobCount: EXPECTED_JOBS,
      });
      expect(purePlan.jobs).toHaveLength(EXPECTED_JOBS);
      expect(purePlan.overflow).toHaveLength(0);
      artifact.counts.purePlannerJobs = purePlan.jobs.length;
      artifact.checks.expansionMathExact = true;

      await measured('seedDatabase', seed);
      const result = await measured('planAndReserve', () =>
        execution.planAndReserve({ organizationId, campaignId })
      );
      expect(result.expansion.expandedJobCount).toBe(EXPECTED_JOBS);
      expect(result.overflowCount).toBe(0);
      expect(artifact.timingsMs.planAndReserve).toBeLessThanOrEqual(
        MAX_PLAN_AND_RESERVE_MS
      );

      const [jobCount, reservationCount, reservationConflicts, issueCount] =
        await measured('authoritativeCountChecks', () =>
          Promise.all([
            prisma.bulkCampaignJob.count({ where: { organizationId, campaignId } }),
            prisma.calendarReservation.count({
              where: {
                organizationId,
                campaignId,
                mode: 'AUTHORITATIVE',
                state: 'COMMITTED',
              },
            }),
            prisma.calendarReservation.count({
              where: { organizationId, campaignId, state: 'CONFLICTED' },
            }),
            prisma.bulkCampaignIssue.count({ where: { organizationId, campaignId } }),
          ])
        );
      expect(jobCount).toBe(EXPECTED_JOBS);
      expect(reservationCount).toBe(EXPECTED_JOBS);
      expect(reservationConflicts).toBe(0);
      expect(issueCount).toBe(0);
      artifact.counts.jobsPlanned = jobCount;
      artifact.counts.authoritativeReservations = reservationCount;
      artifact.counts.reservationConflicts = reservationConflicts;
      artifact.counts.planningIssues = issueCount;
      artifact.checks.databaseIsSourceOfTruth = true;
      artifact.checks.authoritativeReservationCardinality = true;

      const seenJobIds = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      await measured('cursorPagination', async () => {
        do {
          const page = await execution.listJobs({
            organizationId,
            campaignId,
            cursor,
            limit: PAGE_SIZE,
          });
          expect(page.items.length).toBeGreaterThan(0);
          expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE);
          for (const item of page.items) {
            expect(seenJobIds.has(item.id)).toBe(false);
            expect(item.organizationId).toBe(organizationId);
            seenJobIds.add(item.id);
          }
          pages += 1;
          cursor = page.nextCursor || undefined;
        } while (cursor);
      });
      expect(seenJobIds.size).toBe(EXPECTED_JOBS);
      expect(pages).toBe(EXPECTED_JOBS / PAGE_SIZE);
      artifact.counts.cursorPages = pages;
      artifact.counts.uniqueJobsPaged = seenJobIds.size;
      artifact.checks.cursorPaginationCompleteAndUnique = true;

      const horizon = new Date('2200-01-01T00:00:00.000Z');
      const claimedGroups = await measured('concurrentClaims', () =>
        Promise.all(
          Array.from({ length: CLAIM_WORKERS }, (_, worker) =>
            executionRepository.claimDue({
              organizationId,
              horizon,
              now: new Date(),
              limit: CLAIMS_PER_WORKER,
              leaseExpiresAt: new Date(Date.now() + 10 * 60_000),
              claimTokenHash: `${worker}`.repeat(64),
            })
          )
        )
      );
      const claimedIds = claimedGroups.flat().map((job) => job.id);
      expect(claimedGroups.map((group) => group.length)).toEqual([
        CLAIMS_PER_WORKER,
        CLAIMS_PER_WORKER,
        CLAIMS_PER_WORKER,
        CLAIMS_PER_WORKER,
      ]);
      expect(new Set(claimedIds).size).toBe(
        CLAIM_WORKERS * CLAIMS_PER_WORKER
      );
      expect(claimedGroups.flat().every((job) => job.organizationId === organizationId)).toBe(
        true
      );
      artifact.counts.concurrentClaims = claimedIds.length;
      artifact.checks.claimSkipLockedNoDuplicates = true;
      artifact.checks.claimTenantShardIsolated = true;

      await prisma.bulkCampaignJob.updateMany({
        where: { organizationId, campaignId, id: { in: claimedIds } },
        data: {
          state: 'RESERVED',
          claimTokenHash: null,
          leaseExpiresAt: null,
          outcomeClass: null,
          outcomeCode: 'calendar_reserved',
          outcomeReason: 'The load gate returned this bounded claim to its reservation.',
        },
      });

      const retryRows = await prisma.bulkCampaignJob.findMany({
        where: { organizationId, campaignId, state: 'RESERVED' },
        orderBy: [{ ordinal: 'asc' }],
        take: CLAIMS_PER_WORKER,
        select: { id: true },
      });
      await prisma.bulkCampaignJob.updateMany({
        where: {
          organizationId,
          campaignId,
          id: { in: retryRows.map((row) => row.id) },
        },
        data: {
          state: 'RETRYABLE_FAILURE',
          outcomeClass: 'failed',
          outcomeCode: 'provider_temporarily_unavailable',
          outcomeReason:
            'The load gate injected a classified recoverable failure for retry.',
        },
      });
      const manualRetry = await execution.retryJob({
        organizationId,
        campaignId,
        jobId: retryRows[0].id,
        idempotencyKey: 'bulk-load-manual-retry-0001',
      });
      expect(manualRetry.job.state).toBe('RESERVED');
      const retryClaims = await measured('retryClaims', () =>
        executionRepository.claimDue({
          organizationId,
          horizon,
          now: new Date(),
          limit: CLAIMS_PER_WORKER,
          leaseExpiresAt: new Date(Date.now() + 10 * 60_000),
          claimTokenHash: 'r'.repeat(64),
        })
      );
      expect(retryClaims).toHaveLength(CLAIMS_PER_WORKER);
      expect(new Set(retryClaims.map((job) => job.id)).size).toBe(
        CLAIMS_PER_WORKER
      );
      artifact.counts.retryClaims = retryClaims.length;
      artifact.checks.classifiedRetriesClaimedOnce = true;

      await prisma.bulkCampaignJob.updateMany({
        where: {
          organizationId,
          campaignId,
          state: { in: ['CLAIMED', 'RETRYABLE_FAILURE'] },
        },
        data: {
          state: 'RESERVED',
          claimTokenHash: null,
          leaseExpiresAt: null,
          outcomeClass: null,
          outcomeCode: 'calendar_reserved',
          outcomeReason: 'The load gate restored this job after retry verification.',
        },
      });

      const paused = await measured('pause', () =>
        campaigns.pause({
          organizationId,
          campaignId,
          idempotencyKey: 'bulk-load-pause-0001',
        })
      );
      expect(paused.campaign.state).toBe('PAUSED');
      const whilePaused = await executionRepository.claimDue({
        organizationId,
        horizon,
        now: new Date(),
        limit: 10,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        claimTokenHash: 'p'.repeat(64),
      });
      expect(whilePaused).toHaveLength(0);
      const resumed = await measured('resume', () =>
        campaigns.resume({
          organizationId,
          campaignId,
          idempotencyKey: 'bulk-load-resume-0001',
        })
      );
      expect(resumed.campaign.state).toBe('SCHEDULED');
      artifact.checks.pausePreventsClaims = true;
      artifact.checks.resumeRestoresCampaignState = true;

      const pinCandidate = await prisma.bulkCampaignJob.findFirstOrThrow({
        where: { organizationId, campaignId, state: 'RESERVED' },
        orderBy: [{ ordinal: 'asc' }],
      });
      const pinned = await execution.setJobPinned({
        organizationId,
        campaignId,
        jobId: pinCandidate.id,
        expectedRevision: pinCandidate.revision,
        pinned: true,
      });
      expect(pinned.job.pinned).toBe(true);
      artifact.checks.manualPinPersisted = true;

      const cancellation = await measured('cancelFirstBatch', () =>
        execution.cancel({
          organizationId,
          campaignId,
          idempotencyKey: 'bulk-load-cancel-0001',
        })
      );
      let cancellationBatches = 1;
      let remaining = cancellation.batch.type === 'processed' ? cancellation.batch.remaining : -1;
      await measured('cancelRemainingBatches', async () => {
        while (remaining > 0) {
          const batch = await execution.processCancellationBatch({
            organizationId,
            campaignId,
            limit: 500,
          });
          expect(batch.type).toBe('processed');
          if (batch.type !== 'processed') throw new Error('cancellation_batch_not_processed');
          expect(batch.processed).toBeLessThanOrEqual(500);
          remaining = batch.remaining;
          cancellationBatches += 1;
          if (cancellationBatches > 201) {
            throw new Error('cancellation_batch_bound_exceeded');
          }
        }
      });

      const [campaign, jobAggregation, reservationAggregation, unclassified, postCount, publishingJobCount] =
        await measured('finalAggregation', () =>
          Promise.all([
            prisma.bulkCampaign.findFirstOrThrow({
              where: { id: campaignId, organizationId },
            }),
            prisma.bulkCampaignJob.groupBy({
              by: ['state'],
              where: { organizationId, campaignId },
              _count: { _all: true },
            }),
            prisma.calendarReservation.groupBy({
              by: ['state'],
              where: { organizationId, campaignId },
              _count: { _all: true },
            }),
            prisma.bulkCampaignJob.count({
              where: {
                organizationId,
                campaignId,
                state: 'CANCELLED',
                OR: [
                  { outcomeClass: null },
                  { outcomeCode: '' },
                  { outcomeReason: '' },
                ],
              },
            }),
            prisma.post.count({ where: { organizationId } }),
            prisma.publishingJob.count({ where: { organizationId } }),
          ])
        );
      const jobsByState = Object.fromEntries(
        jobAggregation.map((row) => [row.state, row._count._all])
      );
      const reservationsByState = Object.fromEntries(
        reservationAggregation.map((row) => [row.state, row._count._all])
      );
      expect(campaign.state).toBe('CANCELLED');
      expect(jobsByState.CANCELLED).toBe(EXPECTED_JOBS - 1);
      expect(jobsByState.RESERVED).toBe(1);
      expect(reservationsByState.CANCELLED).toBe(EXPECTED_JOBS - 1);
      expect(reservationsByState.COMMITTED).toBe(1);
      expect(unclassified).toBe(0);
      expect(postCount).toBe(0);
      expect(publishingJobCount).toBe(0);
      artifact.counts.cancellationBatches = cancellationBatches;
      artifact.counts.cancelledJobs = jobsByState.CANCELLED || 0;
      artifact.counts.preservedPinnedJobs = jobsByState.RESERVED || 0;
      artifact.counts.cancelledReservations = reservationsByState.CANCELLED || 0;
      artifact.counts.postsCreated = postCount;
      artifact.counts.publishingJobsCreated = publishingJobCount;
      artifact.checks.cancellationChunked = true;
      artifact.checks.pinnedSlotPreserved = true;
      artifact.checks.cancelledOutcomesClassified = true;
      artifact.checks.noPublisherOrProviderMutation = true;

      const ownEvents = await prisma.auditLog.findMany({
        where: { organizationId },
        select: { organizationId: true, targetId: true, metadata: true },
      });
      expect(ownEvents.length).toBeGreaterThan(0);
      expect(ownEvents.every((event) => event.organizationId === organizationId)).toBe(
        true
      );
      expect(JSON.stringify(ownEvents)).not.toContain(sentinelOrganizationId);
      artifact.counts.tenantAuditEvents = ownEvents.length;
      artifact.checks.auditEventIsolation = true;

      artifact.timingsMs.cleanup = await (async () => {
        const cleanupStart = performance.now();
        await cleanup();
        return Math.round((performance.now() - cleanupStart) * 100) / 100;
      })();
      expect(
        await prisma.organization.count({
          where: { id: { in: [organizationId, sentinelOrganizationId] } },
        })
      ).toBe(0);
      artifact.checks.exactTargetCleanup = true;

      const currentMemory = process.memoryUsage();
      peakRss = Math.max(peakRss, currentMemory.rss);
      peakHeapUsed = Math.max(peakHeapUsed, currentMemory.heapUsed);
      expect(toMiB(peakRss)).toBeLessThanOrEqual(MAX_PEAK_RSS_MIB);
      artifact.checks.memoryBoundPassed = true;
      artifact.timingsMs.total =
        Math.round((performance.now() - startedAt) * 100) / 100;
      artifact.status = 'passed';
      persistArtifact();
    } catch (error) {
      artifact.status = 'failed';
      artifact.failure = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      };
      artifact.timingsMs.total =
        Math.round((performance.now() - startedAt) * 100) / 100;
      persistArtifact();
      throw error;
    }
  });
});
