import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

// The isolation gate never materializes a Post. Keep the browser-oriented DTO
// sanitizer graph out of this Node-only database suite while still exercising
// the real Bulk Scheduler execution service and repositories.
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
import { BulkUploadRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.repository';
import { BulkUploadService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.service';
import { CalendarReservationRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.repository';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';
import { ProviderMediaRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/provider-media.repository';
import { ProviderMediaService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/provider-media.service';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const TUPLE_ID = 'instagram.professional.reel.video';

function assertDedicatedTestDatabase(value: string | undefined) {
  if (!value) throw new Error('TEST_DATABASE_URL is required for this mandatory suite.');
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!/(?:^|[-_])(test|ci)(?:[-_]|$)/i.test(database)) {
    throw new Error(
      `Refusing tenant-isolation workload against non-test database ${database}.`
    );
  }
  return database;
}

const expectedDatabase = assertDedicatedTestDatabase(DATABASE_URL);
const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
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
const uploadRepository = new BulkUploadRepository(db, transaction);
const uploads = new BulkUploadService(uploadRepository);
const providerMediaRepository = new ProviderMediaRepository(db, transaction);
const providerMedia = new ProviderMediaService(providerMediaRepository);

type Tenant = {
  organizationId: string;
  integrationId: string;
  campaignId: string;
  intentId: string;
  assetId: string;
  jobId: string;
  reservationId: string;
  uploadId: string;
  issueId: string;
  postId: string;
  publishingJobId: string;
};

const tenantIds: string[] = [];

function campaignIntent(integrationId: string): Prisma.InputJsonValue {
  return {
    schemaVersion: 1,
    selection: {
      destinations: [{ integrationId, capabilityTupleId: TUPLE_ID }],
    },
    distribution: { mode: 'cross_post' },
    cadence: { scope: 'per_account', postsPerDay: 3 },
    schedule: {
      startDate: '2099-01-04',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timezone: 'UTC',
      windowStart: '09:00',
      windowEnd: '17:00',
      spacingMinutes: 60,
      slotStrategy: 'even',
      conflictBehavior: 'next_available',
    },
    ordering: { mode: 'upload' },
  } as Prisma.InputJsonValue;
}

async function seedTenant(label: string): Promise<Tenant> {
  const suffix = randomUUID();
  const organizationId = `bulk_iso_${label}_org_${suffix}`;
  const integrationId = `bulk_iso_${label}_integration_${suffix}`;
  const campaignId = `bulk_iso_${label}_campaign_${suffix}`;
  const intentId = `bulk_iso_${label}_intent_${suffix}`;
  const assetId = `bulk_iso_${label}_asset_${suffix}`;
  const jobId = `bulk_iso_${label}_job_${suffix}`;
  const reservationId = `bulk_iso_${label}_reservation_${suffix}`;
  const uploadId = `bulk_iso_${label}_upload_${suffix}`;
  const issueId = `bulk_iso_${label}_issue_${suffix}`;
  const postId = `bulk_iso_${label}_post_${suffix}`;
  const publishingJobId = `bulk_iso_${label}_publishing_${suffix}`;
  const scheduledAt = new Date('2099-01-04T09:00:00.000Z');
  tenantIds.push(organizationId);

  await prisma.organization.create({
    data: { id: organizationId, name: `Bulk isolation ${label}` },
  });
  await prisma.integration.create({
    data: {
      id: integrationId,
      organizationId,
      internalId: `bulk_iso_${label}_internal_${suffix}`,
      name: `Designated ${label} test destination`,
      providerIdentifier: 'instagram',
      token: 'test-only-token-never-sent',
      type: 'social',
    },
  });
  await prisma.bulkCampaign.create({
    data: {
      id: campaignId,
      organizationId,
      name: `${label} private campaign`,
      state: 'SCHEDULED',
      idempotencyKeyHash: `bulk_iso_${label}_key_${suffix}`,
      requestHash: `bulk_iso_${label}_request_${suffix}`,
      issueCount: 1,
      openIssueCount: 1,
    },
  });
  await prisma.bulkCampaignIntent.create({
    data: {
      id: intentId,
      organizationId,
      campaignId,
      revision: 1,
      intent: campaignIntent(integrationId),
      intentHash: label.repeat(64).slice(0, 64),
    },
  });
  await prisma.bulkAsset.create({
    data: {
      id: assetId,
      organizationId,
      storageKey: `bulk-test/${organizationId}/${assetId}.mp4`,
      originalName: `${label}.mp4`,
      mimeType: 'video/mp4',
      byteLength: 1024,
      sha256: (label === 'a' ? 'a' : 'b').repeat(64),
      state: 'READY',
    },
  });
  await prisma.bulkCampaignAsset.create({
    data: { organizationId, campaignId, assetId, position: 0 },
  });
  await prisma.calendarReservation.create({
    data: {
      id: reservationId,
      organizationId,
      integrationId,
      ownerType: 'BULK_CAMPAIGN_SLOT',
      ownerId: jobId,
      campaignId,
      source: 'bulk_campaign',
      writer: 'bulk_scheduler_v1',
      mode: 'AUTHORITATIVE',
      state: 'COMMITTED',
      scheduledAt,
      localScheduledAt: '2099-01-04T09:00:00',
      timezone: 'UTC',
      utcOffsetMinutes: 0,
      idempotencyKey: `bulk_iso_${label}_reservation_key_${suffix}`,
      requestHash: (label === 'a' ? 'c' : 'd').repeat(64),
      outcomeCode: 'calendar_reservation_committed',
      outcomeReason: 'The isolated test slot is committed.',
    },
  });
  await prisma.bulkCampaignJob.create({
    data: {
      id: jobId,
      organizationId,
      campaignId,
      intentRevision: 1,
      assetId,
      integrationId,
      capabilityTupleId: TUPLE_ID,
      ordinal: 0,
      destinationOrdinal: 0,
      state: 'RETRYABLE_FAILURE',
      scheduledAt,
      localScheduledAt: '2099-01-04T09:00:00',
      timezone: 'UTC',
      utcOffsetMinutes: 0,
      reservationId,
      outcomeClass: 'failed',
      outcomeCode: 'provider_temporarily_unavailable',
      outcomeReason: 'The designated test provider returned a recoverable error.',
    },
  });
  await prisma.bulkCampaignIssue.create({
    data: {
      id: issueId,
      organizationId,
      campaignId,
      eventKey: `bulk_iso_${label}_event_${suffix}`,
      issueClass: 'failed',
      failureClass: 'recoverable',
      code: 'provider_temporarily_unavailable',
      reason: 'A durable isolated test issue.',
      subjectType: 'publish_job',
      subjectId: jobId,
      retryable: true,
    },
  });
  await prisma.bulkUploadSession.create({
    data: {
      id: uploadId,
      organizationId,
      campaignId,
      clientUploadId: `bulk_iso_${label}_client_${suffix}`,
      batchKeyHash: (label === 'a' ? '1' : '2').repeat(64),
      batchRequestHash: (label === 'a' ? 'e' : 'f').repeat(64),
      originalName: `${label}-pending.mp4`,
      relativePath: `private/${label}-pending.mp4`,
      declaredMimeType: 'video/mp4',
      expectedByteLength: 100,
      chunkSize: 100,
      totalParts: 1,
      position: 1,
      state: 'INITIATED',
      storagePrefix: `bulk-upload/${organizationId}/${uploadId}`,
      expiresAt: new Date('2099-01-05T00:00:00.000Z'),
    },
  });
  await prisma.post.create({
    data: {
      id: postId,
      organizationId,
      integrationId,
      state: 'QUEUE',
      publishDate: scheduledAt,
      content: 'Tenant-private canary fixture; never dispatched.',
      group: `bulk-iso-${label}`,
      image: '[]',
      settings: '{}',
    },
  });
  await prisma.publishingJob.create({
    data: {
      id: publishingJobId,
      organizationId,
      integrationId,
      postId,
      provider: 'instagram',
      state: 'FAILED',
      idempotencyKey: `bulk_iso_${label}_publish_${suffix}`,
      failureClass: 'recoverable',
      failureCode: 'provider_temporarily_unavailable',
      failureReason: 'A durable isolated publishing failure.',
    },
  });
  await prisma.bulkPublishingJobAsset.create({
    data: { organizationId, publishingJobId, assetId, ordinal: 0 },
  });
  await prisma.auditLog.create({
    data: {
      id: `bulk_iso_${label}_audit_${suffix}`,
      organizationId,
      actorType: 'system',
      action: 'bulk.isolation.fixture-created',
      targetType: 'bulkCampaign',
      targetId: campaignId,
      metadata: JSON.stringify({ organizationId, campaignId }),
    },
  });

  return {
    organizationId,
    integrationId,
    campaignId,
    intentId,
    assetId,
    jobId,
    reservationId,
    uploadId,
    issueId,
    postId,
    publishingJobId,
  };
}

async function cleanup() {
  if (!tenantIds.length) return;
  const where = { organizationId: { in: tenantIds } };
  await prisma.providerMediaFetchEvent.deleteMany({ where });
  await prisma.providerMediaGrant.deleteMany({ where });
  await prisma.publishingAttempt.deleteMany({ where });
  await prisma.bulkPublishingJobAsset.deleteMany({ where });
  await prisma.bulkCampaignJob.deleteMany({ where });
  await prisma.bulkUploadPart.deleteMany({ where });
  await prisma.bulkUploadSession.deleteMany({ where });
  await prisma.calendarReservation.deleteMany({ where });
  await prisma.calendarReservationBackfill.deleteMany({ where });
  await prisma.bulkCampaignIssue.deleteMany({ where });
  await prisma.bulkCampaignAsset.deleteMany({ where });
  await prisma.bulkCampaignIntent.deleteMany({ where });
  await prisma.bulkCampaign.deleteMany({ where });
  await prisma.publishingReceipt.deleteMany({ where });
  await prisma.publishingFailure.deleteMany({ where });
  await prisma.publishingJob.deleteMany({ where });
  await prisma.post.deleteMany({ where });
  await prisma.bulkAsset.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.integration.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: { in: tenantIds } } });
}

describe('Bulk Scheduler mandatory tenant-isolation gate', () => {
  jest.setTimeout(180_000);
  let tenantA: Tenant;
  let tenantB: Tenant;

  beforeAll(async () => {
    await prisma.$connect();
    const [{ current_database: currentDatabase }] = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database()`;
    expect(currentDatabase).toBe(expectedDatabase);
    tenantA = await seedTenant('a');
    tenantB = await seedTenant('b');
    process.env.BULK_SCHEDULER_KILL_ALL = 'false';
    process.env.BULK_SCHEDULER_CANARY_MODE = 'true';
    process.env.BULK_SCHEDULER_CANARY_TUPLES = TUPLE_ID;
    process.env.BULK_SCHEDULER_CANARY_INTEGRATIONS = [
      tenantA.integrationId,
      tenantB.integrationId,
    ].join(',');
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('scopes campaign, intent, issue, job, upload, reservation, and cursor reads', async () => {
    await expect(
      campaigns.get(tenantA.organizationId, tenantB.campaignId)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      campaigns.listIntents({
        organizationId: tenantA.organizationId,
        campaignId: tenantB.campaignId,
        limit: 1,
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      campaigns.listIssues({
        organizationId: tenantA.organizationId,
        campaignId: tenantB.campaignId,
        limit: 1,
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      execution.listJobs({
        organizationId: tenantA.organizationId,
        campaignId: tenantB.campaignId,
        limit: 1,
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      uploads.get(
        tenantA.organizationId,
        tenantB.campaignId,
        tenantB.uploadId
      )
    ).rejects.toMatchObject({ status: 404 });

    const ownCampaigns = await campaigns.list({
      organizationId: tenantA.organizationId,
      limit: 1,
    });
    expect(ownCampaigns.items.map((item) => item.id)).toEqual([
      tenantA.campaignId,
    ]);
    expect(JSON.stringify(ownCampaigns)).not.toContain(tenantB.campaignId);

    const ownIssues = await campaigns.listIssues({
      organizationId: tenantA.organizationId,
      campaignId: tenantA.campaignId,
      limit: 1,
    });
    expect(ownIssues.items.map((item) => item.id)).toEqual([tenantA.issueId]);
    expect(JSON.stringify(ownIssues)).not.toContain(tenantB.issueId);

    const ownJobs = await execution.listJobs({
      organizationId: tenantA.organizationId,
      campaignId: tenantA.campaignId,
      limit: 1,
    });
    expect(ownJobs.items.map((item) => item.id)).toEqual([tenantA.jobId]);
    expect(JSON.stringify(ownJobs)).not.toContain(tenantB.jobId);

    const calendar = await reservations.list({
      organizationId: tenantA.organizationId,
      limit: 10,
    });
    expect(calendar.items.map((item) => item.id)).toContain(
      tenantA.reservationId
    );
    expect(calendar.items.map((item) => item.id)).not.toContain(
      tenantB.reservationId
    );
  });

  it('rejects cross-tenant pin, retry, job context, and private-media operations', async () => {
    await expect(
      execution.setJobPinned({
        organizationId: tenantA.organizationId,
        campaignId: tenantB.campaignId,
        jobId: tenantB.jobId,
        expectedRevision: 1,
        pinned: true,
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      execution.retryJob({
        organizationId: tenantA.organizationId,
        campaignId: tenantB.campaignId,
        jobId: tenantB.jobId,
        idempotencyKey: 'tenant-isolation-retry-0001',
      })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      executionRepository.getJobContext(
        tenantA.organizationId,
        tenantB.jobId
      )
    ).resolves.toBeNull();
    await expect(
      providerMediaRepository.getJobAsset(
        tenantA.organizationId,
        tenantB.publishingJobId,
        tenantB.assetId
      )
    ).resolves.toBeNull();
    await expect(
      providerMedia.issueProviderPullGrant({
        organizationId: tenantA.organizationId,
        publishingJobId: tenantB.publishingJobId,
        assetId: tenantB.assetId,
        tupleId: TUPLE_ID,
      })
    ).rejects.toThrow('bulk_job_asset_not_found');
  });

  it('enforces tenant equality in composite foreign keys', async () => {
    await expect(
      prisma.bulkCampaignAsset.create({
        data: {
          organizationId: tenantA.organizationId,
          campaignId: tenantA.campaignId,
          assetId: tenantB.assetId,
          position: 99,
        },
      })
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(
      prisma.bulkCampaignJob.create({
        data: {
          id: `bulk_iso_cross_job_${randomUUID()}`,
          organizationId: tenantA.organizationId,
          campaignId: tenantA.campaignId,
          intentRevision: 2,
          assetId: tenantA.assetId,
          integrationId: tenantB.integrationId,
          capabilityTupleId: TUPLE_ID,
          ordinal: 99,
          destinationOrdinal: 99,
          state: 'BLOCKED',
          timezone: 'UTC',
          outcomeClass: 'blocked',
          outcomeCode: 'tenant_mismatch',
          outcomeReason: 'This intentionally invalid fixture must be rejected.',
        },
      })
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(
      prisma.calendarReservation.create({
        data: {
          id: `bulk_iso_cross_reservation_${randomUUID()}`,
          organizationId: tenantA.organizationId,
          integrationId: tenantB.integrationId,
          ownerType: 'BULK_CAMPAIGN_SLOT',
          ownerId: `cross_${randomUUID()}`,
          campaignId: tenantA.campaignId,
          source: 'tenant_isolation_test',
          writer: 'tenant_isolation_test',
          mode: 'AUTHORITATIVE',
          state: 'CONFLICTED',
          scheduledAt: new Date('2099-01-04T12:00:00.000Z'),
          localScheduledAt: '2099-01-04T12:00:00',
          timezone: 'UTC',
          utcOffsetMinutes: 0,
          idempotencyKey: `cross_${randomUUID()}`,
          requestHash: '9'.repeat(64),
          outcomeClass: 'conflicted',
          outcomeCode: 'tenant_mismatch',
          outcomeReason: 'This intentionally invalid fixture must be rejected.',
        },
      })
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('keeps durable audit and issue events isolated by organization', async () => {
    const auditA = await prisma.auditLog.findMany({
      where: {
        organizationId: tenantA.organizationId,
        action: 'bulk.isolation.fixture-created',
      },
    });
    const issueA = await prisma.bulkCampaignIssue.findMany({
      where: { organizationId: tenantA.organizationId },
    });
    expect(auditA).toHaveLength(1);
    expect(issueA).toHaveLength(1);
    expect(JSON.stringify(auditA)).not.toContain(tenantB.organizationId);
    expect(JSON.stringify(issueA)).not.toContain(tenantB.issueId);
    expect(issueA[0]).toMatchObject({
      issueClass: 'failed',
      failureClass: 'recoverable',
      code: expect.any(String),
      reason: expect.any(String),
    });
  });
});
