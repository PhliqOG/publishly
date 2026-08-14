import { HttpException } from '@nestjs/common';
import { PostCalendarWriterService } from './post-calendar-writer.service';

const base = {
  organizationId: 'org-1',
  integrationId: 'integration-1',
  postId: 'post-1',
  scheduledAt: new Date('2026-11-01T06:30:00.000Z'),
  localIntent: {
    localScheduledAt: '2026-11-01T01:30:00',
    timezone: 'America/New_York',
    utcOffsetMinutes: -300,
    dstFold: 1,
  },
  creationMethod: 'API' as const,
  source: 'unit_test',
};
const preparedBase = {
  organizationId: base.organizationId,
  integrationId: base.integrationId,
  postId: base.postId,
  scheduledAt: base.scheduledAt,
  ...base.localIntent,
  source: base.source,
  writer: 'posts_service:api',
  idempotencyKey: 'calendar-key',
  actor: { actorType: 'apikey' as const },
};

function setup(mode: 'SHADOW' | 'AUTHORITATIVE' = 'SHADOW') {
  const reservations = {
    resolveWriterMode: jest.fn().mockResolvedValue(mode),
    acquire: jest.fn(),
    transition: jest.fn(),
  };
  const repository = {
    getLatestPostReservation: jest.fn().mockResolvedValue(null),
    getCurrentPostReservation: jest.fn().mockResolvedValue(null),
    attachHeldPost: jest.fn(),
    mirrorPost: jest.fn(),
    get: jest.fn(),
    getWriterCutover: jest
      .fn()
      .mockResolvedValue({ authorityActivatedAt: new Date() }),
    reschedulePost: jest.fn(),
    cancelPostGroup: jest.fn(),
  };
  return {
    reservations,
    repository,
    service: new PostCalendarWriterService(
      reservations as any,
      repository as any
    ),
  };
}

describe('PostCalendarWriterService', () => {
  it('preserves DST fold intent and defaults legacy callers explicitly to UTC', () => {
    const { service } = setup();
    expect(service.normalizeIntent(base.scheduledAt, base.localIntent)).toEqual(
      base.localIntent
    );
    expect(service.normalizeIntent(base.scheduledAt)).toEqual({
      localScheduledAt: '2026-11-01T06:30:00',
      timezone: 'UTC',
      utcOffsetMinutes: 0,
      dstFold: null,
    });
  });

  it('rejects invalid local intent with a durable class, code, and reason', () => {
    const { service } = setup();
    try {
      service.normalizeIntent(base.scheduledAt, {
        ...base.localIntent,
        timezone: 'Not/A_Timezone',
      });
      throw new Error('expected normalizeIntent to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toMatchObject({
        failureClass: 'data_problem',
        code: 'calendar_timezone_invalid',
        reason: expect.any(String),
      });
    }
  });

  it('uses shadow dual-write without pretending it held the slot', async () => {
    const { service, reservations } = setup('SHADOW');
    const prepared = await service.prepareCreate(base);
    expect(prepared.mode).toBe('SHADOW');
    expect(prepared.reservationId).toBeUndefined();
    expect(reservations.acquire).not.toHaveBeenCalled();
  });

  it('holds an authoritative slot without a post FK before materialization', async () => {
    const { service, reservations } = setup('AUTHORITATIVE');
    reservations.acquire.mockResolvedValue({
      conflicted: false,
      reservation: { id: 'reservation-1', state: 'HELD' },
    });
    const prepared = await service.prepareCreate(base);
    expect(prepared).toMatchObject({
      mode: 'AUTHORITATIVE',
      reservationId: 'reservation-1',
    });
    expect(reservations.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: 'POST',
        ownerId: base.postId,
        postId: undefined,
        state: 'HELD',
        revision: 1,
        leaseExpiresAt: expect.any(Date),
      })
    );
  });

  it('never materializes after an authoritative conflict and exposes its receipt', async () => {
    const { service, reservations } = setup('AUTHORITATIVE');
    reservations.acquire.mockResolvedValue({
      conflicted: true,
      reservation: {
        id: 'conflict-1',
        state: 'CONFLICTED',
        outcomeReason: 'The exact slot is occupied.',
      },
    });
    await expect(service.prepareCreate(base)).rejects.toMatchObject({
      response: {
        failureClass: 'data_problem',
        code: 'calendar_slot_conflict',
        reason: 'The exact slot is occupied.',
        reservationId: 'conflict-1',
      },
    });
  });

  it('attaches an authoritative hold before returning finalization', async () => {
    const { service, repository } = setup('AUTHORITATIVE');
    repository.attachHeldPost.mockResolvedValue({
      id: 'reservation-1',
      state: 'COMMITTED',
    });
    await expect(
      service.finalizeCreate({
        ...preparedBase,
        mode: 'AUTHORITATIVE',
        reservationId: 'reservation-1',
      })
    ).resolves.toMatchObject({ state: 'COMMITTED' });
    expect(repository.attachHeldPost).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: base.organizationId,
        postId: base.postId,
        reservationId: 'reservation-1',
      })
    );
  });

  it('releases a held attempt with classified durable context on materialization failure', async () => {
    const { service, reservations, repository } = setup('AUTHORITATIVE');
    repository.get.mockResolvedValue({ state: 'HELD', revision: 4 });
    reservations.transition.mockResolvedValue({ state: 'RELEASED' });
    await service.abortUnmaterialized(
      {
        ...preparedBase,
        mode: 'AUTHORITATIVE',
        reservationId: 'reservation-1',
      },
      'The post transaction failed.'
    );
    expect(reservations.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        to: 'RELEASED',
        outcomeClass: 'failed',
        code: 'calendar_writer_aborted',
        reason: 'The post transaction failed.',
      })
    );
  });

  it('classifies a ledger finalization outage and never returns success', async () => {
    const { service, repository } = setup('SHADOW');
    repository.mirrorPost.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.finalizeCreate({
        ...preparedBase,
        mode: 'SHADOW',
      })
    ).rejects.toMatchObject({
      response: {
        failureClass: 'recoverable',
        code: 'calendar_writer_unavailable',
        reason: expect.any(String),
      },
    });
  });

  it('surfaces durable reschedule conflicts without returning a changed Post', async () => {
    const { service, repository } = setup('AUTHORITATIVE');
    repository.reschedulePost.mockResolvedValue({
      reservation: {
        id: 'conflict-1',
        state: 'CONFLICTED',
        outcomeReason: 'Account slot is occupied.',
      },
      post: { id: base.postId },
    });
    await expect(
      service.reschedule({ ...base, action: 'schedule' })
    ).rejects.toMatchObject({
      response: {
        code: 'calendar_slot_conflict',
        reason: 'Account slot is occupied.',
        reservationId: 'conflict-1',
      },
    });
  });

  it('preserves stored local intent on a same-time edit from a legacy caller', async () => {
    const { service, repository } = setup('SHADOW');
    repository.getCurrentPostReservation.mockResolvedValue({
      state: 'COMMITTED',
      integrationId: base.integrationId,
      scheduledAt: base.scheduledAt,
      localScheduledAt: '2026-11-01T01:30:00',
      timezone: 'America/New_York',
      utcOffsetMinutes: -300,
      dstFold: 1,
    });
    repository.mirrorPost.mockResolvedValue({
      reservation: { state: 'COMMITTED' },
    });
    await service.ensurePost({
      ...base,
      localIntent: undefined,
    });
    expect(repository.mirrorPost).toHaveBeenCalledWith(
      expect.objectContaining({
        localScheduledAt: '2026-11-01T01:30:00',
        timezone: 'America/New_York',
        utcOffsetMinutes: -300,
        dstFold: 1,
      })
    );
  });

  it('repairs a crash after Post insert by attaching the existing hold before dispatch', async () => {
    const { service, repository } = setup('AUTHORITATIVE');
    repository.getCurrentPostReservation.mockResolvedValue({
      id: 'held-1',
      state: 'HELD',
      postId: null,
      integrationId: base.integrationId,
      scheduledAt: base.scheduledAt,
      localScheduledAt: base.localIntent.localScheduledAt,
      timezone: base.localIntent.timezone,
      utcOffsetMinutes: base.localIntent.utcOffsetMinutes,
      dstFold: base.localIntent.dstFold,
    });
    repository.attachHeldPost.mockResolvedValue({
      id: 'held-1',
      state: 'COMMITTED',
      postId: base.postId,
    });
    await expect(service.ensurePost(base)).resolves.toMatchObject({
      reservation: { state: 'COMMITTED', postId: base.postId },
      replayed: true,
    });
    expect(repository.reschedulePost).not.toHaveBeenCalled();
  });
});
