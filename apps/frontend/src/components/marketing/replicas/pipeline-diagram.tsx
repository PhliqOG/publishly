import './pipeline-diagram.css';

/**
 * PipelineDiagram — a Swiss technical schematic of the publishing
 * pipeline. Composer → Queue → Publish along a main rail, forking
 * into three network endpoints. One branch carries a retry loop and
 * still converges on ✓ — nothing is lost. A single accent packet
 * travels the rail (CSS-only; parked at the end under reduced motion).
 */
export const PipelineDiagram = () => (
  <div className="mk-frame mkr-pipe-root">
    <div className="mkr-pipe-head">
      <span>Fig. 03 — publish pipeline</span>
    </div>

    <div className="mkr-pipe-diagram">
      {/* main rail: Composer → Queue → Publish */}
      <div className="mkr-pipe-rail">
        <span className="mkr-pipe-dot" aria-hidden="true" />
        <span className="mkr-pipe-node">
          <span className="mkr-pipe-node-label">Composer</span>
        </span>
        <span className="mkr-pipe-seg" aria-hidden="true" />
        <span className="mkr-pipe-node">
          <span className="mkr-pipe-node-label">Queue</span>
        </span>
        <span className="mkr-pipe-seg" aria-hidden="true" />
        <span className="mkr-pipe-node">
          <span className="mkr-pipe-node-label">Publish</span>
        </span>
        <span className="mkr-pipe-seg mkr-pipe-seg-tail" aria-hidden="true" />
      </div>

      {/* fork: three endpoint branches off the distribution bus */}
      <div className="mkr-pipe-branches">
        {/* branch 1 — instagram */}
        <span className="mkr-pipe-bcell" />
        <span className="mkr-pipe-net mkr-pipe-net-instagram" />
        <span className="mkr-pipe-blabel">instagram</span>
        <span className="mkr-pipe-bcheck">
          ✓ <span className="mkr-pipe-bcheck-word">published</span>
        </span>

        {/* branch 2 — linkedin, carries the retry loop */}
        <span className="mkr-pipe-bcell">
          <span className="mkr-pipe-arc" aria-hidden="true" />
          <span className="mkr-pipe-arc-label">retry ×1</span>
        </span>
        <span className="mkr-pipe-net mkr-pipe-net-linkedin" />
        <span className="mkr-pipe-blabel">linkedin</span>
        <span className="mkr-pipe-bcheck">
          ✓ <span className="mkr-pipe-bcheck-word">published</span>
        </span>

        {/* branch 3 — youtube */}
        <span className="mkr-pipe-bcell" />
        <span className="mkr-pipe-net mkr-pipe-net-youtube" />
        <span className="mkr-pipe-blabel">youtube</span>
        <span className="mkr-pipe-bcheck">
          ✓ <span className="mkr-pipe-bcheck-word">published</span>
        </span>
      </div>
    </div>

    <div className="mkr-pipe-caption">
      <span>durable workflow</span>
      <span className="mkr-pipe-caption-sep" aria-hidden="true">
        ·
      </span>
      <span>deterministic id</span>
      <span className="mkr-pipe-caption-sep" aria-hidden="true">
        ·
      </span>
      <span>at-most-once per network</span>
    </div>
  </div>
);
