'use client';

import { useCallback, useEffect, useState } from 'react';
import { publicApiUrl } from '@gitroom/frontend/components/marketing/public-api-url';
import {
  formatStatusPercent,
  PublicStatusState,
  statusLabel,
  statusPlatformName,
  STATUS_FETCH_FAILURE_MESSAGE,
} from './status-format';

type MetricWindow = {
  confirmed: number;
  failed: number;
  sampleSize: number;
  successRate: number | null;
  latestAt: string | null;
};

type StatusPayload = {
  generatedAt: string;
  latestObservedAt: string | null;
  overall: {
    state: Exclude<PublicStatusState, 'INSUFFICIENT_DATA'>;
    code: string;
    reason: string;
  };
  uptime: {
    windowDays: number;
    components: Array<{
      component: string;
      currentState: Exclude<PublicStatusState, 'INSUFFICIENT_DATA'>;
      code: string;
      reason: string;
      checkedAt: string | null;
      latencyMs: number | null;
      uptimePercent: number | null;
      expectedSamples: number;
      missingSamples: number;
    }>;
  };
  posting: {
    methodology: string;
    platforms: Array<{
      provider: string;
      state: PublicStatusState;
      code: string;
      reason: string;
      evidenceWindow: string | null;
      windows: {
        last24Hours: MetricWindow;
        last7Days: MetricWindow;
        last30Days: MetricWindow;
      };
    }>;
  };
};

const stateColor: Record<PublicStatusState, string> = {
  OPERATIONAL: '#15803d',
  DEGRADED: '#b45309',
  OUTAGE: '#b91c1c',
  INSUFFICIENT_DATA: '#64748b',
};

const componentName = (component: string) =>
  ({
    api: 'Public API',
    database: 'Primary database',
    redis: 'Queue coordination',
    publishing_engine: 'Publishing engine',
  }[component] || component);

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'No observation yet';

export function StatusLivePanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(publicApiUrl('/public/status'), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Status API returned ${response.status}.`);
      }
      const next = (await response.json()) as StatusPayload;
      setData(next);
      setError('');
    } catch {
      setError(STATUS_FETCH_FAILURE_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="mk-card" role="status" style={{ marginTop: 32 }}>
        Checking live service and posting data…
      </div>
    );
  }

  return (
    <div aria-live="polite" style={{ marginTop: 34 }}>
      {error ? (
        <div
          role="alert"
          style={{
            border: '1px solid #b91c1c55',
            background: '#b91c1c0d',
            color: '#991b1b',
            borderRadius: 10,
            padding: 16,
            marginBottom: 22,
          }}
        >
          <strong>Status unavailable.</strong> {error}
        </div>
      ) : null}

      {data ? (
        <>
          <div
            style={{
              borderTop: `4px solid ${stateColor[data.overall.state]}`,
              borderBottom: '1px solid var(--mk-line)',
              padding: '22px 0',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div className="mk-eyebrow">Current state</div>
              <h2 style={{ margin: '7px 0 0', fontSize: 28 }}>
                {statusLabel(data.overall.state)}
              </h2>
              <p style={{ margin: '7px 0 0', color: 'var(--mk-text-2)' }}>
                {data.overall.reason}
              </p>
            </div>
            <div className="mk-mono" style={{ color: 'var(--mk-text-3)' }}>
              Latest check
              <br />
              {formatTime(data.latestObservedAt)}
            </div>
          </div>

          <section style={{ marginTop: 48 }} aria-labelledby="status-uptime">
            <span className="mk-eyebrow">Service checks</span>
            <h2 id="status-uptime" className="mk-h2" style={{ marginTop: 12 }}>
              Rolling {data.uptime.windowDays}-day uptime
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 14,
                marginTop: 24,
              }}
            >
              {data.uptime.components.map((component) => (
                <article
                  key={component.component}
                  style={{
                    border: '1px solid var(--mk-line)',
                    borderRadius: 10,
                    padding: 17,
                  }}
                >
                  <div
                    className="mk-mono"
                    style={{ color: stateColor[component.currentState] }}
                  >
                    ● {statusLabel(component.currentState)}
                  </div>
                  <h3 style={{ margin: '10px 0 0', fontSize: 17 }}>
                    {componentName(component.component)}
                  </h3>
                  <div style={{ marginTop: 15, fontSize: 27, fontWeight: 650 }}>
                    {formatStatusPercent(component.uptimePercent)}
                  </div>
                  <p
                    style={{
                      margin: '6px 0 0',
                      color: 'var(--mk-text-3)',
                      fontSize: 12,
                    }}
                  >
                      {component.expectedSamples.toLocaleString()} expected
                      checks · {component.missingSamples.toLocaleString()} missed
                  </p>
                  <p
                    style={{
                      margin: '12px 0 0',
                      color: 'var(--mk-text-2)',
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {component.reason}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section style={{ marginTop: 58 }} aria-labelledby="status-posting">
            <span className="mk-eyebrow">Finished post results</span>
            <h2 id="status-posting" className="mk-h2" style={{ marginTop: 12 }}>
              Posting success by platform
            </h2>
            <p className="mk-section-lede">
              Success means Publishly confirmed the post exists on-platform.
              Posts still waiting, uploading, retrying, cancelled, or sent but
              not yet confirmed do not enter this rate.
            </p>
            {data.posting.platforms.length ? (
              <div style={{ overflowX: 'auto', marginTop: 25 }}>
                <table
                  style={{
                    width: '100%',
                    minWidth: 720,
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--mk-line)' }}>
                      {[
                        'Platform',
                        'State',
                        '24 hours',
                        '7 days',
                        '30 days',
                      ].map((label) => (
                        <th
                          key={label}
                          className="mk-mono"
                          style={{ padding: '11px 10px', fontWeight: 500 }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.posting.platforms.map((platform) => (
                      <tr
                        key={platform.provider}
                        style={{ borderBottom: '1px solid var(--mk-line)' }}
                      >
                        <td style={{ padding: '15px 10px', fontWeight: 650 }}>
                          {statusPlatformName(platform.provider)}
                        </td>
                        <td
                          style={{
                            padding: '15px 10px',
                            color: stateColor[platform.state],
                          }}
                        >
                          {statusLabel(platform.state)}
                        </td>
                        {[
                          platform.windows.last24Hours,
                          platform.windows.last7Days,
                          platform.windows.last30Days,
                        ].map((window, index) => (
                          <td key={index} style={{ padding: '15px 10px' }}>
                            <div style={{ fontWeight: 650 }}>
                              {formatStatusPercent(window.successRate)}
                            </div>
                            <div
                              style={{
                                color: 'var(--mk-text-3)',
                                fontSize: 11,
                                marginTop: 3,
                              }}
                            >
                              {window.sampleSize.toLocaleString()} finished
                              posts
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--mk-line)',
                  borderRadius: 10,
                  padding: 18,
                  marginTop: 24,
                  color: 'var(--mk-text-2)',
                }}
              >
                No finished posting results have been recorded yet. Publishly
                will not present an empty set as 100% success.
              </div>
            )}
            <p
              className="mk-mono"
              style={{ marginTop: 18, color: 'var(--mk-text-3)' }}
            >
              Calculation: confirmed live ÷ (confirmed live + final failures).
              Posts still in progress are excluded.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
