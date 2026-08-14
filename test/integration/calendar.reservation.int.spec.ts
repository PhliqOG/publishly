import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { CalendarReservationRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.repository';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://publishly-local:publishly-local-pwd@localhost:5433/publishly-db-local',
    },
  },
});

const repository = new CalendarReservationRepository(
  new PrismaRepository(prisma) as any,
  new PrismaTransaction(prisma)
);
const service = new CalendarReservationService(repository);
const testOrganizations: string[] = [];

async function seedOrganization(prefix: string) {
  const organizationId = `${prefix}_${randomUUID()}`;
  testOrganizations.push(organizationId);
  await prisma.organization.create({
    data: { id: organizationId, name: `Stage 4 ${prefix}` },
  });
  const integration = await prisma.integration.create({
    data: {
      id: `${prefix}_integration_${randomUUID()}`,
      organizationId,
      internalId: `${prefix}_${randomUUID()}`,
      name: 'Reservation test channel',
      providerIdentifier: 'testprovider',
      token: 'test-only-token',
      type: 'social',
    },
  });
  return { organizationId, integration };
}

async function seedPost(input: {
  organizationId: string;
  integrationId: string;
  id?: string;
  publishDate: Date;
  createdAt?: Date;
  state?: 'QUEUE' | 'DRAFT' | 'PUBLISHED';
  parentPostId?: string;
}) {
  return prisma.post.create({
    data: {
      id: input.id || `stage4_post_${randomUUID()}`,
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      publishDate: input.publishDate,
      createdAt: input.createdAt,
      state: input.state || 'QUEUE',
      content: 'Stage 4 reservation integration proof',
      group: `stage4_group_${randomUUID()}`,
      settings: '{}',
      image: '[]',
      parentPostId: input.parentPostId,
    },
  });
}

describe('calendar reservation ledger integration', () => {
  jest.setTimeout(120_000);
  const previousEnforcement = process.env.CALENDAR_RESERVATION_ENFORCEMENT;
  const previousShadow = process.env.CALENDAR_RESERVATION_SHADOW_ENABLED;
  const previousKill = process.env.CALENDAR_RESERVATION_KILL_ALL;

  beforeAll(async () => {
    process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'true';
    process.env.CALENDAR_RESERVATION_SHADOW_ENABLED = 'true';
    process.env.CALENDAR_RESERVATION_KILL_ALL = 'false';
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const organizationId of testOrganizations) {
      await prisma.calendarReservation.deleteMany({
        where: { organizationId },
      });
      await prisma.calendarReservationBackfill.deleteMany({
        where: { organizationId },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.post.deleteMany({ where: { organizationId } });
      await prisma.bulkCampaign.deleteMany({ where: { organizationId } });
      await prisma.integration.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
    if (previousEnforcement === undefined) {
      delete process.env.CALENDAR_RESERVATION_ENFORCEMENT;
    } else {
      process.env.CALENDAR_RESERVATION_ENFORCEMENT = previousEnforcement;
    }
    if (previousShadow === undefined) {
      delete process.env.CALENDAR_RESERVATION_SHADOW_ENABLED;
    } else {
      process.env.CALENDAR_RESERVATION_SHADOW_ENABLED = previousShadow;
    }
    if (previousKill === undefined) {
      delete process.env.CALENDAR_RESERVATION_KILL_ALL;
    } else {
      process.env.CALENDAR_RESERVATION_KILL_ALL = previousKill;
    }
  });

  it('serializes an exact account slot, replays exactly, and persists the loser as conflicted', async () => {
    const { organizationId, integration } = await seedOrganization('acquire');
    const scheduledAt = new Date('2026-09-10T14:00:00.000Z');
    const firstPost = await seedPost({
      organizationId,
      integrationId: integration.id,
      publishDate: scheduledAt,
    });
    const secondPost = await seedPost({
      organizationId,
      integrationId: integration.id,
      publishDate: scheduledAt,
    });
    const base = {
      organizationId,
      integrationId: integration.id,
      ownerType: 'POST' as const,
      source: 'stage4_integration',
      writer: 'integration_test',
      scheduledAt,
      localScheduledAt: '2026-09-10T10:00:00',
      timezone: 'America/New_York',
      utcOffsetMinutes: -240,
      dstFold: null,
      pinned: false,
      revision: 1,
      state: 'COMMITTED' as const,
      actor: { actorType: 'system' as const },
    };
    const [first, second] = await Promise.all([
      service.acquire({
        ...base,
        ownerId: firstPost.id,
        postId: firstPost.id,
        idempotencyKey: `reserve:${firstPost.id}:1`,
      }),
      service.acquire({
        ...base,
        ownerId: secondPost.id,
        postId: secondPost.id,
        idempotencyKey: `reserve:${secondPost.id}:1`,
      }),
    ]);
    expect([first.reservation.state, second.reservation.state].sort()).toEqual([
      'COMMITTED',
      'CONFLICTED',
    ]);
    const conflicted = first.conflicted ? first : second;
    expect(conflicted.reservation.outcomeClass).toBe('conflicted');
    expect(conflicted.reservation.outcomeCode).toBe('calendar_slot_conflict');
    expect(conflicted.reservation.outcomeReason).toMatch(/already owned/);

    const winner = first.conflicted ? second : first;
    const winnerPost = first.conflicted ? secondPost : firstPost;
    const replay = await service.acquire({
      ...base,
      ownerId: winnerPost.id,
      postId: winnerPost.id,
      idempotencyKey: `reserve:${winnerPost.id}:1`,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.reservation.id).toBe(winner.reservation.id);

    await expect(
      service.acquire({
        ...base,
        scheduledAt: new Date('2026-09-10T15:00:00.000Z'),
        localScheduledAt: '2026-09-10T11:00:00',
        ownerId: winnerPost.id,
        postId: winnerPost.id,
        idempotencyKey: `reserve:${winnerPost.id}:1`,
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('batch-reserves and audits campaign slots with deterministic replay and conflict visibility', async () => {
    const { organizationId, integration } = await seedOrganization('batch');
    const campaign = await prisma.bulkCampaign.create({
      data: {
        id: `batch_campaign_${randomUUID()}`,
        organizationId,
        name: 'Batch reservation proof',
        idempotencyKeyHash: randomUUID(),
        requestHash: randomUUID(),
      },
    });
    const row = (ordinal: number, hour: number) => ({
      organizationId,
      integrationId: integration.id,
      ownerType: 'BULK_CAMPAIGN_SLOT' as const,
      ownerId: `batch_job_${ordinal}_${randomUUID()}`,
      campaignId: campaign.id,
      source: 'bulk_scheduler_v1',
      writer: 'integration_test',
      scheduledAt: new Date(
        `2026-09-15T${String(hour).padStart(2, '0')}:00:00.000Z`
      ),
      localScheduledAt: `2026-09-15T${String(hour).padStart(2, '0')}:00:00`,
      timezone: 'UTC',
      utcOffsetMinutes: 0,
      dstFold: null,
      pinned: false,
      revision: 1,
      state: 'COMMITTED' as const,
      idempotencyKey: `batch-reserve-${ordinal}-${randomUUID()}`,
      actor: { actorType: 'system' as const },
    });
    const inputs = [row(0, 10), row(1, 10), row(2, 11)];
    const first = await service.acquireBatch(inputs);
    expect(first.map((result) => result.reservation.state)).toEqual([
      'COMMITTED',
      'CONFLICTED',
      'COMMITTED',
    ]);
    expect(first[1].reservation.outcomeClass).toBe('conflicted');
    const replay = await service.acquireBatch(inputs);
    expect(replay.every((result) => result.replayed)).toBe(true);
    expect(replay.map((result) => result.reservation.id)).toEqual(
      first.map((result) => result.reservation.id)
    );
    await expect(
      service.acquireBatch([
        {
          ...inputs[0],
          scheduledAt: new Date('2026-09-15T12:00:00.000Z'),
          localScheduledAt: '2026-09-15T12:00:00',
        },
      ])
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'calendar_idempotency_key_reused' },
    });
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId,
          action: {
            in: [
              'calendar.reservation.created',
              'calendar.reservation.conflicted',
            ],
          },
        },
      })
    ).toBe(3);
  });

  it('blocks cross-tenant integration attachment and tenant-scopes reads', async () => {
    const tenantA = await seedOrganization('tenant_a');
    const tenantB = await seedOrganization('tenant_b');
    await expect(
      service.acquire({
        organizationId: tenantB.organizationId,
        integrationId: tenantA.integration.id,
        ownerType: 'BULK_CAMPAIGN_SLOT',
        ownerId: 'slot-1',
        campaignId: 'not-reached-because-integration-is-foreign',
        source: 'stage4_integration',
        writer: 'integration_test',
        scheduledAt: new Date('2026-09-11T14:00:00.000Z'),
        localScheduledAt: '2026-09-11T10:00:00',
        timezone: 'America/New_York',
        utcOffsetMinutes: -240,
        revision: 1,
        state: 'COMMITTED',
        idempotencyKey: 'foreign-integration-attempt',
        actor: { actorType: 'system' },
      })
    ).rejects.toMatchObject({
      response: { code: 'calendar_integration_not_found' },
    });

    const page = await service.list({ organizationId: tenantB.organizationId });
    expect(page.items).toEqual([]);
  });

  it('uses optimistic transitions and preserves pinned reservations', async () => {
    const { organizationId, integration } = await seedOrganization(
      'transition'
    );
    const post = await seedPost({
      organizationId,
      integrationId: integration.id,
      publishDate: new Date('2026-09-12T14:00:00.000Z'),
    });
    const held = await service.acquire({
      organizationId,
      integrationId: integration.id,
      ownerType: 'POST',
      ownerId: post.id,
      postId: post.id,
      source: 'stage4_integration',
      writer: 'integration_test',
      scheduledAt: post.publishDate,
      localScheduledAt: '2026-09-12T10:00:00',
      timezone: 'America/New_York',
      utcOffsetMinutes: -240,
      revision: 1,
      state: 'HELD',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: `hold:${post.id}:1`,
      actor: { actorType: 'system' },
    });
    const committed = await service.transition({
      organizationId,
      reservationId: held.reservation.id,
      expectedRevision: 1,
      to: 'COMMITTED',
      code: 'calendar_reservation_committed',
      reason: 'The held test slot was committed.',
      actor: { actorType: 'system' },
    });
    expect(committed.state).toBe('COMMITTED');
    expect(committed.revision).toBe(2);
    await expect(
      service.transition({
        organizationId,
        reservationId: held.reservation.id,
        expectedRevision: 1,
        to: 'RELEASED',
        code: 'calendar_reservation_released',
        reason: 'Stale transition.',
        actor: { actorType: 'system' },
      })
    ).rejects.toMatchObject({ status: 409 });

    const pinnedPost = await seedPost({
      organizationId,
      integrationId: integration.id,
      publishDate: new Date('2026-09-12T15:00:00.000Z'),
      state: 'PUBLISHED',
    });
    const pinned = await service.acquire({
      organizationId,
      integrationId: integration.id,
      ownerType: 'POST',
      ownerId: pinnedPost.id,
      postId: pinnedPost.id,
      source: 'stage4_integration',
      writer: 'integration_test',
      scheduledAt: pinnedPost.publishDate,
      localScheduledAt: '2026-09-12T11:00:00',
      timezone: 'America/New_York',
      utcOffsetMinutes: -240,
      pinned: true,
      revision: 1,
      state: 'COMMITTED',
      idempotencyKey: `pin:${pinnedPost.id}:1`,
      actor: { actorType: 'system' },
    });
    await expect(
      service.transition({
        organizationId,
        reservationId: pinned.reservation.id,
        expectedRevision: 1,
        to: 'CANCELLED',
        code: 'campaign_cancelled',
        reason: 'Ordinary replanning attempted cancellation.',
        actor: { actorType: 'system' },
      })
    ).rejects.toMatchObject({
      response: { code: 'calendar_pinned_reservation_immutable' },
    });
  });

  it('backfills bounded pages to a fixed watermark and classifies legacy conflicts', async () => {
    const { organizationId, integration } = await seedOrganization('backfill');
    const duplicateTime = new Date('2026-09-20T14:00:00.000Z');
    const first = await seedPost({
      id: `stage4_backfill_a_${randomUUID()}`,
      organizationId,
      integrationId: integration.id,
      publishDate: duplicateTime,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await seedPost({
      id: `stage4_backfill_b_${randomUUID()}`,
      organizationId,
      integrationId: integration.id,
      publishDate: duplicateTime,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      state: 'DRAFT',
    });
    await seedPost({
      id: `stage4_backfill_c_${randomUUID()}`,
      organizationId,
      integrationId: integration.id,
      publishDate: new Date('2026-09-21T14:00:00.000Z'),
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      state: 'PUBLISHED',
    });
    await seedPost({
      organizationId,
      integrationId: integration.id,
      publishDate: duplicateTime,
      createdAt: new Date('2026-08-02T12:00:00.000Z'),
      parentPostId: first.id,
    });

    const firstBatch = await service.runBackfillBatch(organizationId, 1);
    expect(firstBatch.processed).toBe(1);
    expect(firstBatch.backfill?.state).toBe('RUNNING');

    const afterWatermark = await seedPost({
      organizationId,
      integrationId: integration.id,
      publishDate: new Date('2026-09-22T14:00:00.000Z'),
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
    });

    let state = firstBatch.backfill?.state;
    while (state === 'RUNNING') {
      const batch = await service.runBackfillBatch(organizationId, 2);
      state = batch.backfill?.state;
    }
    expect(state).toBe('VERIFYING');
    const verification = await service.verifyBackfill(organizationId);
    expect(verification.backfill.state).toBe('VERIFIED');
    expect(verification.backfill.scannedCount).toBe(3);
    expect(verification.counts).toEqual({
      missing: 0,
      fieldMismatch: 0,
      extra: 0,
      conflicts: 2,
    });
    const rows = await prisma.calendarReservation.findMany({
      where: { organizationId, source: 'legacy_post_backfill_v1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.state === 'CONFLICTED')).toHaveLength(2);
    expect(rows.every((row) => row.timezone === 'UTC')).toBe(true);
    expect(rows.every((row) => row.verifiedAt)).toBe(true);
    expect(
      rows.find((row) => row.postId === afterWatermark.id)
    ).toBeUndefined();

    await expect(service.verifyBackfill(organizationId)).rejects.toMatchObject({
      status: 409,
    });
  });
});
