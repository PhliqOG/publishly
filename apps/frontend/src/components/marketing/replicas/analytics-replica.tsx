import './analytics-replica.css';

/* Hardcoded demo series — 14 daily reach samples (px heights, max 120). */
const BARS = [46, 62, 53, 73, 66, 40, 35, 70, 86, 79, 101, 95, 120, 109];
const MAX = Math.max(...BARS);

export const AnalyticsReplica = () => (
  <div className="mk-frame mkr-ana-root">
    <div className="mkr-ana-top">
      <span>Reach &middot; last 14 days</span>
      <span className="mkr-ana-top-note">platform-reported</span>
    </div>

    <div
      className="mkr-ana-chart"
      role="img"
      aria-label="Bar chart of daily reach, sample data"
    >
      {BARS.map((h, i) => (
        <div
          key={i}
          className={
            h === MAX ? 'mkr-ana-bar mkr-ana-bar-max' : 'mkr-ana-bar'
          }
          style={{ height: `${h}px` }}
        />
      ))}
    </div>

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
        <span className="mkr-ana-label">Saves</span>
        <span className="mkr-ana-na">&mdash; not reported by this platform</span>
      </div>
    </div>
  </div>
);
