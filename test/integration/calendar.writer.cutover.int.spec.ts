import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { CalendarReservationRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.repository';
import { CalendarReservationService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service';
import { PostCalendarWriterService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/post-calendar-writer.service';

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
const reservationService = new CalendarReservationService(repository);
const writer = new PostCalendarWriterService(reservationService, repository);
const organizations: string[] = [];

async function seedTenant(prefix: string) {
  const organizationId = `${prefix}_${randomUUID()}`;
  organizations.push(organizationId);
  await prisma.organization.create({
    data: { id: organizationId, name: `Stage 5 ${prefix}` },
  });
  const integration = await prisma.integration.create({
    data: {
      id: `${prefix}_integration_${randomUUID()}`,
      organizationId,
      internalId: `${prefix}_${randomUUID()}`,
      name: 'Stage 5 writer channel',
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
  publishDate: Date;
  id?: string;
  group?: string;
}) {
  return prisma.post.create({
    data: {
      id: input.id || `stage5_post_${randomUUID()}`,
      organizationId: input.organizationId,
      integrationId: input.integrationId,
      publishDate: input.publishDate,
      content: 'Stage 5 calendar writer proof',
      group: input.group || `stage5_group_${randomUUID()}`,
      settings: '{}',
      image: '[]',
      state: 'QUEUE',
      creationMethod: 'API',
    },
  });
}

async function verifyAndPromote(organizationId: string) {
  process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'false';
  for (;;) {
    const result = await reservationService.runBackfillBatch(organizationId, 2);
    if (result.backfill?.state === 'VERIFYING') break;
  }
  const verification = await reservationService.verifyBackfill(organizationId);
  expect(verification.backfill.state).toBe('VERIFIED');
  for (;;) {
    const result = await reservationService.promoteAuthorityBatch(
      organizationId,
      1,
      { actorType: 'system' }
    );
    if (result.activated) break;
  }
  process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'true';
}

describe('Stage 5 calendar writer cutover integration', () => {
  jest.setTimeout(120_000);
  const prior = {
    enforcement: process.env.CALENDAR_RESERVATION_ENFORCEMENT,
    shadow: process.env.CALENDAR_RESERVATION_SHADOW_ENABLED,
    kill: process.env.CALENDAR_RESERVATION_KILL_ALL,
    enforcedTenants: process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS,
  };

  beforeAll(async () => {
    process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'false';
    process.env.CALENDAR_RESERVATION_SHADOW_ENABLED = 'true';
    process.env.CALENDAR_RESERVATION_KILL_ALL = 'false';
    delete process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS;
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const organizationId of organizations) {
      await prisma.calendarReservation.deleteMany({
        where: { organizationId },
      });
      await prisma.calendarReservationBackfill.deleteMany({
        where: { organizationId },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.post.deleteMany({ where: { organizationId } });
      await prisma.integration.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
    for (const [name, value] of Object.entries({
      CALENDAR_RESERVATION_ENFORCEMENT: prior.enforcement,
      CALENDAR_RESERVATION_SHADOW_ENABLED: prior.shadow,
      CALENDAR_RESERVATION_KILL_ALL: prior.kill,
      CALENDAR_RESERVATION_ENFORCED_TENANTS: prior.enforcedTenants,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('mirrors a post in shadow mode before any dispatch boundary', async () => {
    const tenant = await seedTenant('shadow_writer');
    const scheduledAt = new Date('2026-10-01T14:00:00.000Z');
    const postId = `stage5_shadow_${randomUUID()}`;
    const prepared = await writer.prepareCreate({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId,
      scheduledAt,
      creationMethod: 'API',
      source: 'stage5_integration',
    });
    expect(prepared.mode).toBe('SHADOW');
    expect(prepared.reservationId).toBeUndefined();
    await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: scheduledAt,
      id: postId,
    });
    const reservation = await writer.finalizeCreate(prepared);
    expect(reservation).toMatchObject({
      organizationId: tenant.organizationId,
      postId,
      mode: 'SHADOW',
      state: 'COMMITTED',
      outcomeCode: 'calendar_writer_shadowed',
    });
  });

  it('promotes in bounded batches, holds before insert, and attaches before dispatch', async () => {
    const tenant = await seedTenant('authority_writer');
    await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: new Date('2026-10-02T14:00:00.000Z'),
    });
    await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: new Date('2026-10-02T15:00:00.000Z'),
    });
    await verifyAndPromote(tenant.organizationId);

    const cutover = await repository.getWriterCutover(tenant.organizationId);
    expect(cutover?.authorityActivatedAt).toBeInstanceOf(Date);
    expect(cutover?.authorityPromotedCount).toBe(2);

    const postId = `stage5_held_${randomUUID()}`;
    const scheduledAt = new Date('2026-10-03T14:00:00.000Z');
    const prepared = await writer.prepareCreate({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId,
      scheduledAt,
      localIntent: {
        localScheduledAt: '2026-10-03T10:00:00',
        timezone: 'America/New_York',
        utcOffsetMinutes: -240,
      },
      creationMethod: 'API',
      source: 'stage5_integration',
    });
    const held = await prisma.calendarReservation.findUniqueOrThrow({
      where: { id: prepared.reservationId },
    });
    expect(held).toMatchObject({
      state: 'HELD',
      postId: null,
      ownerId: postId,
    });

    await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: scheduledAt,
      id: postId,
    });
    const committed = await writer.finalizeCreate(prepared);
    expect(committed).toMatchObject({
      state: 'COMMITTED',
      postId,
      timezone: 'America/New_York',
    });
  });

  it('leaves a conflicted reschedule unchanged and durably classifies it', async () => {
    const tenant = await seedTenant('reschedule_writer');
    const first = await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: new Date('2026-10-04T14:00:00.000Z'),
    });
    const second = await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: new Date('2026-10-04T15:00:00.000Z'),
    });
    await verifyAndPromote(tenant.organizationId);
    await expect(
      writer.reschedule({
        organizationId: tenant.organizationId,
        integrationId: tenant.integration.id,
        postId: second.id,
        scheduledAt: first.publishDate,
        creationMethod: 'WEB',
        source: 'stage5_conflict_test',
        action: 'schedule',
      })
    ).rejects.toMatchObject({
      response: { code: 'calendar_slot_conflict' },
    });
    const unchanged = await prisma.post.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(unchanged.publishDate).toEqual(second.publishDate);
    const issue = await prisma.calendarReservation.findFirstOrThrow({
      where: {
        organizationId: tenant.organizationId,
        ownerId: second.id,
        state: 'CONFLICTED',
      },
      orderBy: { ownerRevision: 'desc' },
    });
    expect(issue).toMatchObject({
      outcomeClass: 'conflicted',
      outcomeCode: 'calendar_slot_conflict',
    });
    expect(issue.outcomeReason).toMatch(/already represented/);
  });

  it('does not activate over a legacy conflict and resumes after explicit resolution', async () => {
    const tenant = await seedTenant('promotion_conflict');
    const occupied = new Date('2026-10-04T18:00:00.000Z');
    await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: occupied,
    });
    const duplicate = await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: occupied,
    });
    process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'false';
    for (;;) {
      const batch = await reservationService.runBackfillBatch(
        tenant.organizationId,
        10
      );
      if (batch.backfill?.state === 'VERIFYING') break;
    }
    await reservationService.verifyBackfill(tenant.organizationId);
    const blocked = await reservationService.promoteAuthorityBatch(
      tenant.organizationId,
      10,
      { actorType: 'system' }
    );
    expect(blocked.activated).toBe(false);
    expect(blocked.missing).toBe(1);
    expect(blocked.conflicted).toBe(1);

    const resolvedAt = new Date('2026-10-04T19:00:00.000Z');
    await writer.reschedule({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId: duplicate.id,
      scheduledAt: resolvedAt,
      creationMethod: 'WEB',
      source: 'stage5_conflict_resolution',
      action: 'schedule',
    });
    const resumed = await reservationService.promoteAuthorityBatch(
      tenant.organizationId,
      10,
      { actorType: 'system' }
    );
    expect(resumed.activated).toBe(true);
    expect(resumed.missing).toBe(0);
    const durableConflict = await prisma.calendarReservation.findFirstOrThrow({
      where: {
        organizationId: tenant.organizationId,
        ownerId: duplicate.id,
        source: 'calendar_authority_promotion_v1',
        state: 'CONFLICTED',
      },
    });
    expect(durableConflict.outcomeReason).toMatch(/no Post was skipped/);
    const replacement = await prisma.calendarReservation.findFirstOrThrow({
      where: {
        organizationId: tenant.organizationId,
        ownerId: duplicate.id,
        scheduledAt: resolvedAt,
        mode: 'AUTHORITATIVE',
        state: 'COMMITTED',
      },
    });
    expect(replacement.ownerRevision).toBeGreaterThan(
      durableConflict.ownerRevision
    );
  });

  it('fails closed when the exact shadow row is missing and resumes only after repair', async () => {
    const tenant = await seedTenant('promotion_missing_shadow');
    const publishDate = new Date('2026-10-05T18:00:00.000Z');
    const post = await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate,
    });
    process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'false';
    for (;;) {
      const batch = await reservationService.runBackfillBatch(
        tenant.organizationId,
        10
      );
      if (batch.backfill?.state === 'VERIFYING') break;
    }
    await reservationService.verifyBackfill(tenant.organizationId);
    await prisma.calendarReservation.deleteMany({
      where: {
        organizationId: tenant.organizationId,
        ownerId: post.id,
        mode: 'SHADOW',
      },
    });

    const blocked = await reservationService.promoteAuthorityBatch(
      tenant.organizationId,
      10,
      { actorType: 'system' }
    );
    expect(blocked).toMatchObject({
      activated: false,
      conflicted: 1,
      missing: 1,
    });
    const issue = await prisma.calendarReservation.findFirstOrThrow({
      where: {
        organizationId: tenant.organizationId,
        ownerId: post.id,
        source: 'calendar_authority_promotion_v1',
        state: 'CONFLICTED',
      },
    });
    expect(issue).toMatchObject({
      outcomeClass: 'conflicted',
      outcomeCode: 'calendar_writer_shadow_missing',
    });
    expect(issue.outcomeReason).toMatch(/no exact shadow reservation/);

    await writer.ensurePost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId: post.id,
      scheduledAt: publishDate,
      creationMethod: 'API',
      source: 'stage5_shadow_repair',
    });
    const repaired = await reservationService.promoteAuthorityBatch(
      tenant.organizationId,
      10,
      { actorType: 'system' }
    );
    expect(repaired).toMatchObject({ activated: true, missing: 0 });
  });

  it('renews an expired idempotent hold and repairs the post-insert crash boundary', async () => {
    const tenant = await seedTenant('hold_recovery');
    await verifyAndPromote(tenant.organizationId);
    const postId = `stage5_recovery_${randomUUID()}`;
    const scheduledAt = new Date('2026-10-06T14:00:00.000Z');
    const input = {
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId,
      scheduledAt,
      creationMethod: 'API' as const,
      source: 'stage5_recovery_test',
      operationKey: 'stable-recovery-key',
    };
    const first = await writer.prepareCreate(input);
    await prisma.calendarReservation.update({
      where: { id: first.reservationId },
      data: { leaseExpiresAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    const renewed = await writer.prepareCreate(input);
    expect(renewed.reservationId).toBe(first.reservationId);
    const renewedRow = await prisma.calendarReservation.findUniqueOrThrow({
      where: { id: renewed.reservationId },
    });
    expect(renewedRow.state).toBe('HELD');
    expect(renewedRow.revision).toBe(2);
    expect(renewedRow.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: scheduledAt,
      id: postId,
    });
    const repaired = await writer.ensurePost(input);
    expect(repaired).toMatchObject({
      reservation: { id: first.reservationId, state: 'COMMITTED', postId },
      replayed: true,
    });
  });

  it('retains an aborted attempt and allocates a new owner revision on retry', async () => {
    const tenant = await seedTenant('hold_retry');
    await verifyAndPromote(tenant.organizationId);
    const input = {
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId: `stage5_retry_${randomUUID()}`,
      scheduledAt: new Date('2026-10-07T14:00:00.000Z'),
      creationMethod: 'API' as const,
      source: 'stage5_retry_test',
      operationKey: 'stable-retry-key',
    };
    const first = await writer.prepareCreate(input);
    await writer.abortUnmaterialized(
      first,
      'Injected post transaction failure.'
    );
    const retry = await writer.prepareCreate(input);
    expect(retry.reservationId).not.toBe(first.reservationId);
    const attempts = await prisma.calendarReservation.findMany({
      where: {
        organizationId: tenant.organizationId,
        ownerId: input.postId,
      },
      orderBy: { ownerRevision: 'asc' },
    });
    expect(attempts).toEqual([
      expect.objectContaining({
        ownerRevision: 1,
        state: 'RELEASED',
        outcomeCode: 'calendar_writer_aborted',
      }),
      expect.objectContaining({ ownerRevision: 2, state: 'HELD' }),
    ]);
  });

  it('atomically reschedules and cancels an unpinned post while retaining ledger history', async () => {
    const tenant = await seedTenant('lifecycle_writer');
    const group = `stage5_cancel_${randomUUID()}`;
    const post = await seedPost({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      publishDate: new Date('2026-10-05T14:00:00.000Z'),
      group,
    });
    await verifyAndPromote(tenant.organizationId);
    const replacement = new Date('2026-10-05T16:00:00.000Z');
    await writer.reschedule({
      organizationId: tenant.organizationId,
      integrationId: tenant.integration.id,
      postId: post.id,
      scheduledAt: replacement,
      creationMethod: 'WEB',
      source: 'stage5_reschedule_test',
      action: 'schedule',
    });
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: post.id } }))
        .publishDate
    ).toEqual(replacement);
    const revisions = await prisma.calendarReservation.findMany({
      where: { organizationId: tenant.organizationId, ownerId: post.id },
      orderBy: { ownerRevision: 'asc' },
    });
    expect(revisions.some((row) => row.state === 'RELEASED')).toBe(true);
    expect(revisions.some((row) => row.state === 'COMMITTED')).toBe(true);

    await writer.cancelGroup({
      organizationId: tenant.organizationId,
      group,
      actor: { actorType: 'user' },
    });
    const cancelledPost = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(cancelledPost.deletedAt).toBeInstanceOf(Date);
    const active = await prisma.calendarReservation.count({
      where: {
        organizationId: tenant.organizationId,
        postId: post.id,
        state: { in: ['HELD', 'COMMITTED'] },
        pinned: false,
      },
    });
    expect(active).toBe(0);
  });
});
