import { PublicStatusRepository } from './public-status.repository';

function setup() {
  const serviceHealthSample = {
    upsert: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const publishingJob = { groupBy: jest.fn().mockResolvedValue([]) };
  const db = {
    model: {
      serviceHealthSample,
      publishingJob,
    },
  };
  const transaction = {
    model: {
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
    },
  };
  return {
    repository: new PublicStatusRepository(db as any, transaction as any),
    db,
    serviceHealthSample,
    publishingJob,
  };
}

describe('PublicStatusRepository', () => {
  it('upserts a retry into the same component/minute bucket', async () => {
    const { repository, serviceHealthSample } = setup();
    const bucket = new Date('2026-08-10T12:00:00.000Z');
    await repository.recordSamples([
      {
        component: 'api',
        bucket,
        status: 'OPERATIONAL',
        latencyMs: 4,
        code: 'api_probe_completed',
        reason: 'API probe completed.',
        observedAt: new Date('2026-08-10T12:00:05.000Z'),
      },
    ]);

    expect(serviceHealthSample.upsert).toHaveBeenCalledWith({
      where: { component_bucket: { component: 'api', bucket } },
      create: expect.objectContaining({ component: 'api', bucket }),
      update: expect.objectContaining({
        status: 'OPERATIONAL',
        code: 'api_probe_completed',
      }),
    });
  });

  it('uses bounded grouped uptime queries and one latest row per component', async () => {
    const { repository, serviceHealthSample } = setup();
    const since = new Date('2026-07-11T12:00:00.000Z');
    await repository.uptimeAggregates(since);

    expect(serviceHealthSample.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['component', 'status'],
        where: expect.objectContaining({ bucket: { gte: since } }),
        _count: { _all: true },
      })
    );
    expect(serviceHealthSample.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        by: ['component'],
        _min: { bucket: true },
        _max: { bucket: true },
      })
    );
    expect(serviceHealthSample.findFirst).toHaveBeenCalledTimes(4);
  });

  it('aggregates only confirmed-live and final-failed platform outcomes', async () => {
    const { repository, publishingJob } = setup();
    const since = new Date('2026-08-09T12:00:00.000Z');
    await repository.platformOutcomeAggregates(since);

    expect(publishingJob.groupBy).toHaveBeenCalledWith({
      by: ['provider', 'state', 'deliveryStage'],
      where: {
        completedAt: { gte: since },
        OR: [
          { state: 'PUBLISHED', deliveryStage: 'confirmed_live' },
          { state: 'FAILED', deliveryStage: 'failed' },
        ],
      },
      _count: { _all: true },
      _max: { completedAt: true },
      orderBy: [{ provider: 'asc' }, { state: 'asc' }],
    });
  });
});
