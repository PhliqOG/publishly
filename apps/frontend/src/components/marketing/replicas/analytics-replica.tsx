import './analytics-replica.css';
import {
  ANALYTICS_PREVIOUS_PERIOD_REACH,
  ANALYTICS_PREVIEW_SERIES,
  formatCompactMetric,
  getAnalyticsBarPercent,
  getAnalyticsPreviewSummary,
} from './analytics-preview-data';

export const AnalyticsReplica = () => {
  const summary = getAnalyticsPreviewSummary(
    ANALYTICS_PREVIEW_SERIES,
    ANALYTICS_PREVIOUS_PERIOD_REACH
  );
  const change = summary.changePercent ?? 0;
  const chartDescription = ANALYTICS_PREVIEW_SERIES.map(
    (point) =>
      `${point.day} ${point.date}: ${point.value.toLocaleString('en-US')}`
  ).join('; ');

  return (
    <div className="mk-frame mkr-ana-root">
      <div className="mkr-ana-top">
        <div>
          <span className="mkr-ana-top-label">Instagram Business</span>
          <span className="mkr-ana-top-account">
            Northstar Coffee &middot; sample account
          </span>
        </div>
        <span className="mkr-ana-demo">Demo data</span>
      </div>

      <div className="mkr-ana-summary">
        <div>
          <span className="mkr-ana-metric">7-day reach</span>
          <div className="mkr-ana-total-line">
            <strong>{summary.total.toLocaleString('en-US')}</strong>
            <span className="mkr-ana-total-delta">
              +{change.toFixed(1)}% vs prior 7 days
            </span>
          </div>
        </div>
        <div className="mkr-ana-source">
          <span>Source</span>
          <strong>Meta Graph API</strong>
          <small>Provider snapshot</small>
        </div>
      </div>

      <figure
        className="mkr-ana-figure"
        aria-labelledby="mkr-ana-chart-title"
        aria-describedby="mkr-ana-chart-description"
      >
        <figcaption id="mkr-ana-chart-title" className="mkr-ana-chart-title">
          Daily account reach
        </figcaption>
        <p id="mkr-ana-chart-description" className="mkr-ana-sr">
          Illustrative demo series sourced in the product from Meta Graph API.
          {` ${chartDescription}.`}
        </p>
        <div className="mkr-ana-plot">
          <div className="mkr-ana-axis" aria-hidden="true">
            <span>{formatCompactMetric(summary.scaleMax)}</span>
            <span>{formatCompactMetric(summary.scaleMax / 2)}</span>
            <span>0</span>
          </div>
          <div className="mkr-ana-stage">
            <div className="mkr-ana-grid" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="mkr-ana-columns">
              {ANALYTICS_PREVIEW_SERIES.map((point) => (
                <div className="mkr-ana-column" key={point.date}>
                  <span className="mkr-ana-bar-value">
                    {formatCompactMetric(point.value)}
                  </span>
                  <div className="mkr-ana-track">
                    <span
                      className={
                        point.value === summary.max
                          ? 'mkr-ana-bar mkr-ana-bar-max'
                          : 'mkr-ana-bar'
                      }
                      style={{
                        height: `${getAnalyticsBarPercent(
                          point.value,
                          summary.scaleMax
                        )}%`,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="mkr-ana-day">{point.day}</span>
                  <span className="mkr-ana-date">{point.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </figure>

      <div className="mkr-ana-stats">
        <div className="mkr-ana-row">
          <span className="mkr-ana-label">Followers</span>
          <span className="mkr-ana-val">12,480</span>
          <span className="mkr-ana-delta">+3.2%</span>
        </div>
        <div className="mkr-ana-row">
          <span className="mkr-ana-label">Impressions</span>
          <span className="mkr-ana-val">86,210</span>
          <span className="mkr-ana-delta">+11.4%</span>
        </div>
        <div className="mkr-ana-row">
          <span className="mkr-ana-label">Video completion</span>
          <span className="mkr-ana-na">
            <strong>Unavailable</strong>
            <small>Not returned for this post mix</small>
          </span>
        </div>
      </div>
      <p className="mkr-ana-footnote">
        Connect an account to replace this demo with its live provider data.
      </p>
    </div>
  );
};
