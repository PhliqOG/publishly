export const MIN_PUBLIC_DELIVERIES = 20;

export type LivePostingWindow = {
  confirmed: number;
  failed: number;
  sampleSize: number;
  successRate: number | null;
};

export type LiveProofPayload = {
  generatedAt: string;
  latestObservedAt: string | null;
  overall: {
    state: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
    reason: string;
  };
  posting: {
    platforms: Array<{
      provider: string;
      windows: { last24Hours: LivePostingWindow };
    }>;
  };
};

export type LivePostingSummary = {
  confirmed: number;
  failed: number;
  sampleSize: number;
  successRate: number | null;
  hasEnoughEvidence: boolean;
};

export function summarizeLivePosting(
  payload: LiveProofPayload
): LivePostingSummary {
  const totals = payload.posting.platforms.reduce(
    (sum, platform) => {
      const window = platform.windows.last24Hours;
      sum.confirmed += Math.max(0, window.confirmed || 0);
      sum.failed += Math.max(0, window.failed || 0);
      return sum;
    },
    { confirmed: 0, failed: 0 }
  );
  const sampleSize = totals.confirmed + totals.failed;
  const hasEnoughEvidence = sampleSize >= MIN_PUBLIC_DELIVERIES;
  return {
    ...totals,
    sampleSize,
    hasEnoughEvidence,
    successRate: hasEnoughEvidence
      ? Math.round((totals.confirmed / sampleSize) * 10_000) / 100
      : null,
  };
}

export function formatLiveRate(value: number | null) {
  if (value === null) return 'Collecting real data';
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}
