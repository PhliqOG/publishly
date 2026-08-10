import './composer-replica.css';

const CHANNELS: { name: string; net: string; active?: boolean }[] = [
  { name: 'Instagram', net: 'var(--net-instagram)', active: true },
  { name: 'X', net: 'var(--net-x)' },
  { name: 'LinkedIn', net: 'var(--net-linkedin)' },
  { name: 'TikTok', net: 'var(--net-tiktok)' },
];

export const ComposerReplica = () => (
  <div className="mk-frame mkr-comp-root">
    <div className="mkr-comp-top">
      <span className="mkr-comp-top-title">New post · 4 channels</span>
      <span className="mkr-comp-top-state">Draft saved</span>
    </div>

    <div className="mkr-comp-body">
      <p className="mkr-comp-draft">
        Our spring collection lands this Thursday. Three new colorways, same
        everyday carry — early access opens for the newsletter first.
        <span className="mkr-comp-caret" aria-hidden="true" />
      </p>

      <div className="mkr-comp-tabs">
        {CHANNELS.map((c) => (
          <span
            key={c.name}
            className={`mkr-comp-tab${c.active ? ' mkr-comp-tab-active' : ''}`}
          >
            <span className="mkr-comp-dot" style={{ background: c.net }} />
            {c.name}
          </span>
        ))}
      </div>

      <div className="mkr-comp-variant">
        <p className="mkr-comp-variant-text">
          Spring drop incoming — three new colorways hit the shelf Thursday.
          Newsletter readers get first pick.
        </p>
        <div className="mkr-comp-variant-row">
          <span className="mkr-comp-tags">
            <span className="mkr-comp-tag">#springdrop</span>
            <span className="mkr-comp-tag">#newcolorways</span>
          </span>
          <span className="mkr-comp-count">271 / 2200</span>
        </div>
      </div>
    </div>

    <div className="mkr-comp-footer">
      <span className="mkr-comp-slot">Thu · 18:00 · duplicate-safe</span>
      <div className="mkr-comp-schedule">Schedule</div>
    </div>
  </div>
);
