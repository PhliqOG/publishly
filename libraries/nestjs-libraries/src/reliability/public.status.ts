import { ServiceHealthState } from '@prisma/client';

export const STATUS_COMPONENTS = [
  'api',
  'database',
  'redis',
  'publishing_engine',
] as const;
export type StatusComponent = (typeof STATUS_COMPONENTS)[number];

export const STATUS_SAMPLE_INTERVAL_MS = 60_000;
export const STATUS_STALE_AFTER_MS = 150_000;
export const STATUS_UPTIME_WINDOW_DAYS = 30;
export const STATUS_RETENTION_DAYS = 45;

export type StoredStatusSample = {
  component: string;
  bucket: Date;
  status: ServiceHealthState;
  latencyMs: number | null;
  code: string;
  reason: string;
  observedAt: Date;
};

export type StatusCount = {
  component: string;
  status: ServiceHealthState;
  _count: { _all: number };
};

export type StatusBound = {
  component: string;
  _min: { bucket: Date | null };
  _max: { bucket: Date | null };
};

export type PlatformOutcomeAggregate = {
  provider: string;
  state: string;
  deliveryStage: string | null;
  _count: { _all: number };
  _max: { completedAt: Date | null };
};

export function statusMinuteBucket(value = new Date()) {
  return new Date(
    Math.floor(value.getTime() / STATUS_SAMPLE_INTERVAL_MS) *
      STATUS_SAMPLE_INTERVAL_MS
  );
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1_000_000) / 10_000;
}

function cleanText(value: unknown, fallback: string, max = 2_000) {
  return typeof value === 'string' && value.trim()
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : fallback;
}

export function buildComponentUptime(input: {
  component: StatusComponent;
  counts: StatusCount[];
  bound?: StatusBound;
  latest?: StoredStatusSample;
  windowStartedAt: Date;
  now: Date;
}) {
  const first = input.bound?._min.bucket || null;
  const last = input.bound?._max.bucket || null;
  if (!first || !last || !input.latest) {
    return {
      component: input.component,
      currentState: 'OUTAGE' as const,
      code: 'status_probe_missing',
      reason: 'Publishly has no recent health evidence for this component.',
      checkedAt: null,
      latencyMs: null,
      observedSince: null,
      uptimePercent: null,
      expectedSamples: 0,
      availableSamples: 0,
      degradedSamples: 0,
      outageSamples: 0,
      missingSamples: 0,
    };
  }

  const observedSince = new Date(
    Math.max(first.getTime(), input.windowStartedAt.getTime())
  );
  const end = statusMinuteBucket(input.now);
  const expectedSamples = Math.max(
    1,
    Math.floor(
      (end.getTime() - statusMinuteBucket(observedSince).getTime()) /
        STATUS_SAMPLE_INTERVAL_MS
    ) + 1
  );
  const count = (state: ServiceHealthState) =>
    input.counts
      .filter(
        (entry) => entry.component === input.component && entry.status === state
      )
      .reduce((total, entry) => total + entry._count._all, 0);
  const operationalSamples = count('OPERATIONAL');
  const degradedSamples = count('DEGRADED');
  const outageSamples = count('OUTAGE');
  const storedSamples = operationalSamples + degradedSamples + outageSamples;
  const missingSamples = Math.max(expectedSamples - storedSamples, 0);
  const availableSamples = operationalSamples + degradedSamples;
  const stale =
    input.now.getTime() - input.latest.observedAt.getTime() >
    STATUS_STALE_AFTER_MS;

  return {
    component: input.component,
    currentState: stale ? ('OUTAGE' as const) : input.latest.status,
    code: stale ? 'status_probe_stale' : input.latest.code,
    reason: stale
      ? 'The latest health observation is stale; this component is treated as unavailable.'
      : cleanText(
          input.latest.reason,
          'Publishly recorded a component state without a usable reason.'
        ),
    checkedAt: input.latest.observedAt,
    latencyMs: input.latest.latencyMs,
    observedSince,
    uptimePercent: percentage(availableSamples, expectedSamples),
    expectedSamples,
    availableSamples,
    degradedSamples,
    outageSamples,
    missingSamples,
  };
}

const stateRank: Record<ServiceHealthState, number> = {
  OPERATIONAL: 0,
  DEGRADED: 1,
  OUTAGE: 2,
};

export function overallServiceState(
  components: Array<{ currentState: ServiceHealthState }>
) {
  return components.reduce<ServiceHealthState>(
    (worst, component) =>
      stateRank[component.currentState] > stateRank[worst]
        ? component.currentState
        : worst,
    'OPERATIONAL'
  );
}

function summarizePlatform(
  provider: string,
  aggregates: PlatformOutcomeAggregate[]
) {
  let confirmed = 0;
  let failed = 0;
  let latestAt: Date | null = null;
  for (const entry of aggregates) {
    if (entry.provider !== provider) continue;
    if (
      entry.state === 'PUBLISHED' &&
      entry.deliveryStage === 'confirmed_live'
    ) {
      confirmed += entry._count._all;
    } else if (entry.state === 'FAILED' && entry.deliveryStage === 'failed') {
      failed += entry._count._all;
    } else {
      continue;
    }
    const completedAt = entry._max.completedAt;
    if (completedAt && (!latestAt || completedAt > latestAt)) {
      latestAt = completedAt;
    }
  }
  const sampleSize = confirmed + failed;
  return {
    confirmed,
    failed,
    sampleSize,
    successRate: percentage(confirmed, sampleSize),
    latestAt,
  };
}

export function buildPlatformSuccessMetrics(input: {
  last24Hours: PlatformOutcomeAggregate[];
  last7Days: PlatformOutcomeAggregate[];
  last30Days: PlatformOutcomeAggregate[];
  minimumStatusSample?: number;
}) {
  const providers = [
    ...new Set(
      [input.last24Hours, input.last7Days, input.last30Days]
        .flat()
        .map((entry) => entry.provider)
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
  const minimumStatusSample = Math.max(1, input.minimumStatusSample || 20);

  return providers.map((provider) => {
    const windows = {
      last24Hours: summarizePlatform(provider, input.last24Hours),
      last7Days: summarizePlatform(provider, input.last7Days),
      last30Days: summarizePlatform(provider, input.last30Days),
    };
    const evidence = (
      [
        ['24h', windows.last24Hours],
        ['7d', windows.last7Days],
        ['30d', windows.last30Days],
      ] as const
    ).find(([, value]) => value.sampleSize >= minimumStatusSample);
    if (!evidence) {
      return {
        provider,
        state: 'INSUFFICIENT_DATA' as const,
        code: 'posting_evidence_insufficient',
        reason: `Fewer than ${minimumStatusSample} terminal deliveries are available in every rolling window.`,
        evidenceWindow: null,
        windows,
      };
    }
    const [evidenceWindow, value] = evidence;
    const rate = value.successRate!;
    const state =
      rate >= 99
        ? ('OPERATIONAL' as const)
        : rate >= 95
        ? ('DEGRADED' as const)
        : ('OUTAGE' as const);
    return {
      provider,
      state,
      code:
        state === 'OPERATIONAL'
          ? 'posting_success_operational'
          : state === 'DEGRADED'
          ? 'posting_success_degraded'
          : 'posting_success_outage',
      reason: `${value.confirmed} of ${value.sampleSize} terminal deliveries were confirmed live in the ${evidenceWindow} window.`,
      evidenceWindow,
      windows,
    };
  });
}
