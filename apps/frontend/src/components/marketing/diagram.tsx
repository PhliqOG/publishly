// ConnectionDiagram — a technical product visual, not decoration: authorized
// platform connections flow into one Publishly pipeline and out as published
// posts. Pure SVG; MotionRuntime draws the paths & activates nodes on scroll
// (once). Fully legible with animation disabled.

const SOURCES = [
  { y: 60, label: 'Instagram' },
  { y: 120, label: 'TikTok' },
  { y: 180, label: 'YouTube' },
  { y: 240, label: 'LinkedIn' },
  { y: 300, label: '+ 26 more' },
];

export const ConnectionDiagram = () => (
  <svg
    className="mk-diagram"
    viewBox="0 0 640 360"
    role="img"
    aria-label="Connected social accounts publish through one Publishly pipeline"
  >
    {/* connector paths: sources → hub */}
    {SOURCES.map((s) => (
      <path
        key={s.label}
        className="mk-d-path"
        d={`M 150 ${s.y} C 260 ${s.y}, 300 180, 388 180`}
      />
    ))}
    {/* hub → published */}
    <path className="mk-d-path" d="M 452 180 L 560 180" />

    {/* source nodes */}
    {SOURCES.map((s) => (
      <g key={s.label}>
        <rect
          className="mk-d-node"
          x="34"
          y={s.y - 16}
          width="116"
          height="32"
          rx="9"
        />
        <text className="mk-d-label" x="52" y={s.y + 4}>
          {s.label}
        </text>
      </g>
    ))}

    {/* the hub */}
    <g>
      <rect className="mk-d-hub" x="388" y="152" width="64" height="56" rx="14" />
      <circle className="mk-d-pulse" cx="420" cy="172" r="5" fill="#fff" />
      <text
        className="mk-d-label"
        x="420"
        y="196"
        textAnchor="middle"
        style={{ fill: 'rgba(255,255,255,0.9)' }}
      >
        publishly
      </text>
      <text className="mk-d-label" x="420" y="228" textAnchor="middle">
        one pipeline
      </text>
    </g>

    {/* result */}
    <g>
      <rect className="mk-d-node" x="560" y="164" width="70" height="32" rx="9" />
      <text className="mk-d-label" x="574" y="184">
        ✓ live
      </text>
    </g>
  </svg>
);
