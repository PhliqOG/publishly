import {
  buildComponentUptime,
  buildPlatformSuccessMetrics,
  overallServiceState,
  statusMinuteBucket,
} from './public.status';

const now = new Date('2026-08-10T12:10:30.000Z');

describe('public status policy', () => {
  it('normalizes observations into UTC minute buckets', () => {
    expect(statusMinuteBucket(now).toISOString()).toBe(
      '2026-08-10T12:10:00.000Z'
    );
  });

  it('counts missing observed buckets as downtime but excludes pre-history', () => {
    const result = buildComponentUptime({
      component: 'api',
      counts: [
        { component: 'api', status: 'OPERATIONAL', _count: { _all: 8 } },
        { component: 'api', status: 'DEGRADED', _count: { _all: 1 } },
      ],
      bound: {
        component: 'api',
        _min: { bucket: new Date('2026-08-10T12:00:00.000Z') },
        _max: { bucket: new Date('2026-08-10T12:10:00.000Z') },
      },
      latest: {
        component: 'api',
        bucket: new Date('2026-08-10T12:10:00.000Z'),
        status: 'OPERATIONAL',
        latencyMs: 12,
        code: 'api_reachable',
        reason: 'API probe completed.',
        observedAt: new Date('2026-08-10T12:10:05.000Z'),
      },
      windowStartedAt: new Date('2026-07-11T12:10:30.000Z'),
      now,
    });
    expect(result).toMatchObject({
      expectedSamples: 11,
      availableSamples: 9,
      degradedSamples: 1,
      missingSamples: 2,
      uptimePercent: 81.8182,
      currentState: 'OPERATIONAL',
    });
    expect(result.observedSince).toEqual(new Date('2026-08-10T12:00:00.000Z'));
  });

  it('treats stale evidence and absent evidence as explicit outages', () => {
    const stale = buildComponentUptime({
      component: 'redis',
      counts: [
        { component: 'redis', status: 'OPERATIONAL', _count: { _all: 1 } },
      ],
      bound: {
        component: 'redis',
        _min: { bucket: new Date('2026-08-10T12:07:00.000Z') },
        _max: { bucket: new Date('2026-08-10T12:07:00.000Z') },
      },
      latest: {
        component: 'redis',
        bucket: new Date('2026-08-10T12:07:00.000Z'),
        status: 'OPERATIONAL',
        latencyMs: 3,
        code: 'redis_reachable',
        reason: 'Redis replied.',
        observedAt: new Date('2026-08-10T12:07:00.000Z'),
      },
      windowStartedAt: new Date('2026-07-11T00:00:00.000Z'),
      now,
    });
    expect(stale).toMatchObject({
      currentState: 'OUTAGE',
      code: 'status_probe_stale',
    });

    expect(
      buildComponentUptime({
        component: 'publishing_engine',
        counts: [],
        windowStartedAt: new Date('2026-07-11T00:00:00.000Z'),
        now,
      })
    ).toMatchObject({
      currentState: 'OUTAGE',
      code: 'status_probe_missing',
      uptimePercent: null,
    });
  });

  it('uses the worst live component for overall state', () => {
    expect(
      overallServiceState([
        { currentState: 'OPERATIONAL' },
        { currentState: 'DEGRADED' },
      ])
    ).toBe('DEGRADED');
    expect(
      overallServiceState([
        { currentState: 'DEGRADED' },
        { currentState: 'OUTAGE' },
      ])
    ).toBe('OUTAGE');
  });

  it('counts only confirmed-live and final-failed posting evidence', () => {
    const aggregate = (state: string, stage: string, count: number) => ({
      provider: 'instagram',
      state,
      deliveryStage: stage,
      _count: { _all: count },
      _max: { completedAt: now },
    });
    const [result] = buildPlatformSuccessMetrics({
      last24Hours: [
        aggregate('PUBLISHED', 'confirmed_live', 99),
        aggregate('FAILED', 'failed', 1),
        aggregate('RETRYING', 'failed', 50),
        aggregate('PUBLISHED', 'sent', 50),
      ],
      last7Days: [],
      last30Days: [],
    });
    expect(result).toMatchObject({
      state: 'OPERATIONAL',
      evidenceWindow: '24h',
      windows: {
        last24Hours: {
          confirmed: 99,
          failed: 1,
          sampleSize: 100,
          successRate: 99,
        },
      },
    });
  });

  it.each([
    [98, 2, 'DEGRADED'],
    [94, 6, 'OUTAGE'],
  ] as const)('classifies %s/%s evidence as %s', (confirmed, failed, state) => {
    const row = (jobState: string, stage: string, count: number) => ({
      provider: 'tiktok',
      state: jobState,
      deliveryStage: stage,
      _count: { _all: count },
      _max: { completedAt: now },
    });
    const [result] = buildPlatformSuccessMetrics({
      last24Hours: [
        row('PUBLISHED', 'confirmed_live', confirmed),
        row('FAILED', 'failed', failed),
      ],
      last7Days: [],
      last30Days: [],
    });
    expect(result.state).toBe(state);
  });

  it('reports no or low evidence honestly instead of returning 100%', () => {
    expect(
      buildPlatformSuccessMetrics({
        last24Hours: [],
        last7Days: [],
        last30Days: [],
      })
    ).toEqual([]);
    const [low] = buildPlatformSuccessMetrics({
      last24Hours: [],
      last7Days: [],
      last30Days: [
        {
          provider: 'x',
          state: 'PUBLISHED',
          deliveryStage: 'confirmed_live',
          _count: { _all: 3 },
          _max: { completedAt: now },
        },
      ],
    });
    expect(low).toMatchObject({
      state: 'INSUFFICIENT_DATA',
      evidenceWindow: null,
      windows: { last30Days: { successRate: 100, sampleSize: 3 } },
    });
  });
});
