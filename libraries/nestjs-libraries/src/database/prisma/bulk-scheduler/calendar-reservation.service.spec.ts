import { CalendarReservationService } from './calendar-reservation.service';

const baseInput = () => ({
  organizationId: 'org-1',
  integrationId: 'integration-1',
  ownerType: 'POST' as const,
  ownerId: 'post-1',
  postId: 'post-1',
  source: 'composer',
  writer: 'posts_service',
  scheduledAt: new Date('2026-11-01T06:30:00.000Z'),
  localScheduledAt: '2026-11-01T01:30:00',
  timezone: 'America/New_York',
  utcOffsetMinutes: -300,
  dstFold: 1,
  pinned: false,
  revision: 1,
  state: 'COMMITTED' as const,
  idempotencyKey: 'reserve-post-1-v1',
  actor: { actorType: 'system' as const },
});

const batchInput = (ordinal = 0) => ({
  ...baseInput(),
  ownerType: 'BULK_CAMPAIGN_SLOT' as const,
  ownerId: `job-${ordinal}`,
  postId: undefined,
  campaignId: 'campaign-1',
  scheduledAt: new Date(
    `2026-11-02T${String(ordinal).padStart(2, '0')}:00:00.000Z`
  ),
  localScheduledAt: `2026-11-02T${String(ordinal).padStart(2, '0')}:00:00`,
  timezone: 'UTC',
  utcOffsetMinutes: 0,
  dstFold: null,
  idempotencyKey: `bulk-slot-job-${ordinal}-r1`,
});

describe('CalendarReservationService', () => {
  let repository: any;
  let service: CalendarReservationService;
  const previous = {
    enforcement: process.env.CALENDAR_RESERVATION_ENFORCEMENT,
    shadow: process.env.CALENDAR_RESERVATION_SHADOW_ENABLED,
    kill: process.env.CALENDAR_RESERVATION_KILL_ALL,
    enforcedTenants: process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS,
  };

  beforeEach(() => {
    process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'true';
    process.env.CALENDAR_RESERVATION_SHADOW_ENABLED = 'true';
    process.env.CALENDAR_RESERVATION_KILL_ALL = 'false';
    delete process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS;
    repository = {
      acquire: jest.fn(),
      acquireBatch: jest.fn(),
      get: jest.fn(),
      transition: jest.fn(),
      list: jest.fn(),
      getBackfill: jest.fn(),
      initializeBackfill: jest.fn(),
      backfillNextBatch: jest.fn(),
      verifyBackfill: jest.fn(),
      getWriterCutover: jest.fn(),
      promoteAuthorityBatch: jest.fn(),
    };
    service = new CalendarReservationService(repository);
  });

  afterAll(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('CALENDAR_RESERVATION_ENFORCEMENT', previous.enforcement);
    restore('CALENDAR_RESERVATION_SHADOW_ENABLED', previous.shadow);
    restore('CALENDAR_RESERVATION_KILL_ALL', previous.kill);
    restore('CALENDAR_RESERVATION_ENFORCED_TENANTS', previous.enforcedTenants);
  });

  it('keeps non-selected tenants in shadow during a bounded rollout', async () => {
    process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS = 'org-2,org-3';
    await expect(service.resolveWriterMode('org-1')).resolves.toBe('SHADOW');
    expect(repository.getWriterCutover).not.toHaveBeenCalled();
  });

  it('fails a selected tenant closed until verification and promotion finish', async () => {
    process.env.CALENDAR_RESERVATION_ENFORCED_TENANTS = 'org-1';
    repository.getWriterCutover.mockResolvedValue({
      state: 'VERIFIED',
      authorityActivatedAt: null,
    });
    await expect(service.resolveWriterMode('org-1')).rejects.toMatchObject({
      status: 503,
      response: { code: 'calendar_authority_not_ready' },
    });
  });

  it('selects authority only for a verified and promoted tenant', async () => {
    repository.getWriterCutover.mockResolvedValue({
      state: 'VERIFIED',
      authorityActivatedAt: new Date(),
    });
    await expect(service.resolveWriterMode('org-1')).resolves.toBe(
      'AUTHORITATIVE'
    );
  });

  it('fails closed when authoritative enforcement is not enabled', async () => {
    process.env.CALENDAR_RESERVATION_ENFORCEMENT = 'false';
    await expect(service.acquire(baseInput())).rejects.toMatchObject({
      status: 503,
      response: { code: 'calendar_reservation_enforcement_disabled' },
    });
    expect(repository.acquire).not.toHaveBeenCalled();
  });

  it('fails closed under the permanent global rollback switch', async () => {
    process.env.CALENDAR_RESERVATION_KILL_ALL = 'true';
    await expect(service.acquire(baseInput())).rejects.toMatchObject({
      status: 503,
      response: { code: 'calendar_reservation_disabled' },
    });
  });

  it('classifies invalid DST/local intent before touching storage', async () => {
    await expect(
      service.acquire({ ...baseInput(), timezone: 'Not/AZone' })
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'calendar_timezone_invalid' },
    });
    expect(repository.acquire).not.toHaveBeenCalled();
  });

  it('rejects missing or stale leases for holds', async () => {
    await expect(
      service.acquire({
        ...baseInput(),
        state: 'HELD',
        leaseExpiresAt: undefined,
      })
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'calendar_reservation_lease_invalid' },
    });
  });

  it('surfaces durable slot conflicts without pretending the write succeeded', async () => {
    repository.acquire.mockResolvedValue({
      replayed: false,
      requestHash: 'a'.repeat(64),
      reservation: {
        id: 'reservation-2',
        requestHash: 'a'.repeat(64),
        state: 'CONFLICTED',
        outcomeClass: 'conflicted',
        outcomeCode: 'calendar_slot_conflict',
        outcomeReason: 'The slot is already owned.',
      },
    });
    await expect(service.acquire(baseInput())).resolves.toMatchObject({
      conflicted: true,
      reservation: {
        state: 'CONFLICTED',
        outcomeClass: 'conflicted',
        outcomeCode: 'calendar_slot_conflict',
      },
    });
  });

  it('rejects idempotency key reuse with changed intent', async () => {
    repository.acquire.mockResolvedValue({
      replayed: true,
      requestHash: 'a'.repeat(64),
      reservation: {
        id: 'reservation-1',
        requestHash: 'b'.repeat(64),
        state: 'COMMITTED',
      },
    });
    await expect(service.acquire(baseInput())).rejects.toMatchObject({
      status: 409,
      response: { code: 'calendar_idempotency_key_reused' },
    });
  });

  it('classifies a ledger outage and never reports a reservation', async () => {
    repository.acquire.mockRejectedValue(new Error('postgres unavailable'));
    await expect(service.acquire(baseInput())).rejects.toMatchObject({
      status: 503,
      response: {
        failureClass: 'recoverable',
        code: 'calendar_reservation_ledger_unavailable',
      },
    });
  });

  it('accepts only bounded, single-tenant committed campaign batches', async () => {
    await expect(service.acquireBatch([])).rejects.toMatchObject({
      status: 400,
      response: { code: 'calendar_reservation_batch_size_invalid' },
    });
    await expect(
      service.acquireBatch([
        batchInput(0),
        { ...batchInput(1), organizationId: 'org-2' },
      ])
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'calendar_reservation_batch_request_invalid' },
    });
    expect(repository.acquireBatch).not.toHaveBeenCalled();
  });

  it('returns batch conflicts and rejects changed idempotent replays', async () => {
    repository.acquireBatch.mockResolvedValueOnce([
      {
        replayed: false,
        requestHash: 'a'.repeat(64),
        reservation: {
          id: 'reservation-1',
          requestHash: 'a'.repeat(64),
          state: 'CONFLICTED',
        },
      },
    ]);
    await expect(service.acquireBatch([batchInput()])).resolves.toMatchObject([
      { conflicted: true },
    ]);
    repository.acquireBatch.mockResolvedValueOnce([
      {
        replayed: true,
        requestHash: 'a'.repeat(64),
        reservation: {
          id: 'reservation-1',
          requestHash: 'b'.repeat(64),
          state: 'COMMITTED',
        },
      },
    ]);
    await expect(service.acquireBatch([batchInput()])).rejects.toMatchObject({
      status: 409,
      response: { code: 'calendar_idempotency_key_reused' },
    });
  });

  it('preserves pinned committed slots during ordinary transitions', async () => {
    repository.get.mockResolvedValue({
      id: 'reservation-1',
      state: 'COMMITTED',
      pinned: true,
    });
    await expect(
      service.transition({
        organizationId: 'org-1',
        reservationId: 'reservation-1',
        expectedRevision: 1,
        to: 'RELEASED',
        code: 'future_plan_regenerated',
        reason: 'Regenerate future unpinned work.',
        actor: { actorType: 'system' },
      })
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'calendar_pinned_reservation_immutable' },
    });
    expect(repository.transition).not.toHaveBeenCalled();
  });

  it('rejects concurrent transition revision loss with a retryable reason', async () => {
    repository.get.mockResolvedValue({
      id: 'reservation-1',
      state: 'HELD',
      pinned: false,
    });
    repository.transition.mockResolvedValue(null);
    await expect(
      service.transition({
        organizationId: 'org-1',
        reservationId: 'reservation-1',
        expectedRevision: 1,
        to: 'COMMITTED',
        code: 'calendar_reservation_committed',
        reason: 'Commit.',
        actor: { actorType: 'system' },
      })
    ).rejects.toMatchObject({
      status: 409,
      response: {
        failureClass: 'recoverable',
        code: 'calendar_reservation_revision_conflict',
      },
    });
  });

  it('does not run backfill when shadow processing is disabled', async () => {
    process.env.CALENDAR_RESERVATION_SHADOW_ENABLED = 'false';
    await expect(service.runBackfillBatch('org-1', 100)).rejects.toMatchObject({
      status: 503,
      response: { code: 'calendar_reservation_shadow_disabled' },
    });
    expect(repository.initializeBackfill).not.toHaveBeenCalled();
  });
});
