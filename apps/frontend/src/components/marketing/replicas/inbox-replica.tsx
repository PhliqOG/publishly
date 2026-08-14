import './inbox-replica.css';

/**
 * InboxReplica — a static, hand-built slice of the unified inbox.
 * Server component: pure JSX, no state. All demo content is
 * obviously-generic sample data.
 */
export const InboxReplica = () => (
  <div className="mk-frame mkr-inb">
    <div className="mkr-inb-top">
      <span className="mkr-inb-top-title">
        <strong>Inbox</strong> · supported channels
      </span>
      <span className="mkr-inb-top-open">3 open</span>
    </div>

    <div className="mkr-inb-rows">
      <div className="mkr-inb-row">
        <span
          className="mkr-inb-avatar mkr-inb-avatar-instagram"
          aria-hidden="true"
        >
          M
        </span>
        <span className="mkr-inb-meta">
          <span className="mkr-inb-handle">@maya_k</span> · instagram · 2h
        </span>
        <p className="mkr-inb-text">Do these ship to the EU?</p>
      </div>

      <div className="mkr-inb-row mkr-inb-row-expanded">
        <span
          className="mkr-inb-avatar mkr-inb-avatar-facebook"
          aria-hidden="true"
        >
          S
        </span>
        <span className="mkr-inb-meta">
          <span className="mkr-inb-handle">@sam.builds</span> · facebook · 3h
        </span>
        <p className="mkr-inb-text">Love this colorway 🔥</p>
        <div className="mkr-inb-reply">
          <span className="mkr-inb-reply-ph">Reply as @yourbrand…</span>
          <div className="mkr-inb-reply-send">Reply</div>
        </div>
      </div>

      <div className="mkr-inb-row">
        <span
          className="mkr-inb-avatar mkr-inb-avatar-instagram"
          aria-hidden="true"
        >
          L
        </span>
        <span className="mkr-inb-meta">
          <span className="mkr-inb-handle">@lena_v</span> · instagram · 5h
        </span>
        <p className="mkr-inb-text">Is there a tutorial for this?</p>
      </div>
    </div>

    <div className="mkr-inb-foot">
      <span className="mkr-inb-foot-dot" aria-hidden="true" />
      <span>
        tiktok · comment management is unavailable through Publishly&apos;s
        official API integration
      </span>
    </div>
  </div>
);
