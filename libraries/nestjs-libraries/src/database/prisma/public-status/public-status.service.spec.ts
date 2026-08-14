import { PublicStatusService } from './public-status.service';

const now = new Date('2026-08-10T12:10:30.000Z');
const latest = (component: string) => ({
  component,
  bucket: new Date('2026-08-10T12:10:00.000Z'),
  status: 'OPERATIONAL',
  latencyMs: 5,
  code: `${component}_reachable`,
  reason: `${component} is reachable.`,
  observedAt: new Date('2026-08-10T12:10:05.000Z'),
});

describe('PublicStatusService', () => {
  let repository: {
    recordSamples: jest.Mock;
    deleteSamplesBefore: jest.Mock;
    uptimeAggregates: jest.Mock;
    platformOutcomeAggregates: jest.Mock;
  };
  let service: PublicStatusService;

  beforeEach(() => {
    const components = ['api', 'database', 'redis', 'publishing_engine'];
    repository = {
      recordSamples: jest.fn().mockResolvedValue([]),
      deleteSamplesBefore: jest.fn().mockResolvedValue({ count: 0 }),
      uptimeAggregates: jest.fn().mockResolvedValue({
        counts: components.map((component) => ({
          component,
          status: 'OPERATIONAL',
          _count: { _all: 11 },
        })),
        bounds: components.map((component) => ({
          component,
          _min: { bucket: new Date('2026-08-10T12:00:00.000Z') },
          _max: { bucket: new Date('2026-08-10T12:10:00.000Z') },
        })),
        latest: components.map(latest),
      }),
      platformOutcomeAggregates: jest.fn().mockResolvedValue([]),
    };
    service = new PublicStatusService(repository as any);
  });

  it('returns only aggregate live/uptime/posting evidence', async () => {
    repository.platformOutcomeAggregates
      .mockResolvedValueOnce([
        {
          provider: 'instagram',
          state: 'PUBLISHED',
          deliveryStage: 'confirmed_live',
          _count: { _all: 20 },
          _max: { completedAt: now },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await service.getPublicStatus(now);

    expect(result.overall.state).toBe('OPERATIONAL');
    expect(result.uptime.components).toHaveLength(4);
    expect(result.posting.platforms[0]).toMatchObject({
      provider: 'instagram',
      state: 'OPERATIONAL',
      windows: { last24Hours: { successRate: 100, sampleSize: 20 } },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /organizationId|integrationId|postId|token/i
    );
  });

  it('writes an idempotent minute-bucket publishing heartbeat', async () => {
    await service.recordPublishingEngineHeartbeat(now);
    expect(repository.recordSamples).toHaveBeenCalledWith([
      expect.objectContaining({
        component: 'publishing_engine',
        bucket: new Date('2026-08-10T12:10:00.000Z'),
        status: 'OPERATIONAL',
        code: 'publishing_engine_heartbeat',
        reason: expect.any(String),
      }),
    ]);
  });

  it('never hides a heartbeat ledger failure', async () => {
    repository.recordSamples.mockRejectedValue(new Error('ledger unavailable'));
    await expect(service.recordPublishingEngineHeartbeat(now)).rejects.toThrow(
      'ledger unavailable'
    );
  });

  it('returns a classified 503 when public evidence cannot be read', async () => {
    repository.uptimeAggregates.mockRejectedValue(new Error('database down'));
    await expect(service.getPublicStatus(now)).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'status_data_unavailable',
        reason: expect.any(String),
      },
    });
  });

  it('deletes only samples outside the retention window', async () => {
    await service.cleanup(now);
    expect(repository.deleteSamplesBefore).toHaveBeenCalledWith(
      new Date('2026-06-26T12:10:30.000Z')
    );
  });
});
