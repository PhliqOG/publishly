'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { publicApiUrl } from './public-api-url';
import {
  formatLiveRate,
  LiveProofPayload,
  MIN_PUBLIC_DELIVERIES,
  summarizeLivePosting,
} from './live-proof';

const STATE_LABEL = {
  OPERATIONAL: 'All systems working',
  DEGRADED: 'Some systems are slower',
  OUTAGE: 'Service interruption',
} as const;

export function LiveProofBar() {
  const [data, setData] = useState<LiveProofPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(publicApiUrl('/public/status'), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      if (!response.ok) throw new Error(`Status returned ${response.status}`);
      setData((await response.json()) as LiveProofPayload);
      setUnavailable(false);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setUnavailable(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const interval = window.setInterval((): void => {
      void load();
    }, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [load]);

  const summary = data ? summarizeLivePosting(data) : null;
  const evidenceCopy = summary?.hasEnoughEvidence
    ? `${summary.confirmed.toLocaleString()} of ${summary.sampleSize.toLocaleString()} finished posts confirmed live in the last 24 hours`
    : summary?.sampleSize
    ? `${summary.sampleSize} finished posts recorded; rate appears after ${MIN_PUBLIC_DELIVERIES}`
    : 'No finished posts recorded in the last 24 hours yet';

  return (
    <aside className="mk-live-proof" aria-label="Live Publishly reliability">
      <div className="mk-live-proof-cell">
        <span className="mk-live-proof-label">Live posting success</span>
        <strong>
          {loading && !data
            ? 'Checking live data…'
            : unavailable && !data
            ? 'Live data unavailable'
            : formatLiveRate(summary?.successRate ?? null)}
        </strong>
        <small>
          {unavailable && !data ? 'No estimate shown' : evidenceCopy}
        </small>
      </div>
      <div className="mk-live-proof-cell mk-live-proof-system">
        <span className="mk-live-proof-label">Current service</span>
        <strong>
          <i
            className="mk-live-proof-dot"
            data-state={data?.overall.state || 'UNKNOWN'}
            aria-hidden="true"
          />
          {data
            ? STATE_LABEL[data.overall.state]
            : unavailable
            ? 'Status unknown'
            : 'Checking…'}
        </strong>
        <small>Measured from real service checks and finished posts</small>
      </div>
      <Link href="/status" className="mk-live-proof-link">
        Open public status <span aria-hidden="true">↗</span>
      </Link>
    </aside>
  );
}
