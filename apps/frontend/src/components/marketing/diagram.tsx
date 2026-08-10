// ConnectionDiagram v2 — bold, smooth, on-brand: card nodes with network
// dots, thick rounded connectors, a gradient Publishly hub, and pulses that
// travel the paths (MotionRuntime drives draw-in + traveling pulses).
// Fully legible with animation disabled.

const SOURCES = [
  { y: 62, label: 'Instagram', dot: '#E1306C' },
  { y: 136, label: 'TikTok', dot: '#0E0E0C' },
  { y: 210, label: 'YouTube', dot: '#FF0033' },
  { y: 284, label: 'LinkedIn', dot: '#0A66C2' },
  { y: 358, label: '+ 26 more', dot: '#55B0FF' },
];

export const ConnectionDiagram = () => (
  <svg
    className="mk-diagram"
    viewBox="0 0 660 420"
    role="img"
    aria-label="Connected social accounts publish through one Publishly pipeline"
  >
    <defs>
      <linearGradient id="mkdHub" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3298e8" />
        <stop offset="100%" stopColor="#1878c4" />
      </linearGradient>
      <filter id="mkdSoft" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow
          dx="0"
          dy="2"
          stdDeviation="5"
          floodColor="#071521"
          floodOpacity="0.1"
        />
      </filter>
    </defs>

    {/* connectors: smooth, thick, rounded */}
    {SOURCES.map((s) => (
      <path
        key={s.label}
        className="mk-d-path"
        d={`M 172 ${s.y} C 290 ${s.y}, 310 210, 402 210`}
      />
    ))}
    <path className="mk-d-path" d="M 486 210 L 566 210" />

    {/* traveling pulses (one per connector; MotionRuntime moves them) */}
    {SOURCES.map((s, i) => (
      <circle
        key={`p-${s.label}`}
        className="mk-d-pulse"
        data-path-index={i}
        r="4.5"
        cx="172"
        cy={s.y}
      />
    ))}

    {/* source cards */}
    {SOURCES.map((s) => (
      <g key={s.label} className="mk-d-node" filter="url(#mkdSoft)">
        <rect x="28" y={s.y - 24} width="144" height="48" rx="14" className="mk-d-card" />
        <circle cx="52" cy={s.y} r="5.5" fill={s.dot} />
        <text className="mk-d-name" x="68" y={s.y + 5}>
          {s.label}
        </text>
      </g>
    ))}

    {/* the hub */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="402" y="172" width="84" height="76" rx="20" fill="url(#mkdHub)" />
      <circle cx="444" cy="198" r="6" fill="#fff" />
      <text
        className="mk-d-name"
        x="444"
        y="228"
        textAnchor="middle"
        style={{ fill: '#ffffff', fontSize: 13, fontWeight: 700 }}
      >
        Publishly
      </text>
      <text className="mk-d-sub" x="444" y="268" textAnchor="middle">
        One pipeline
      </text>
    </g>

    {/* result */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="566" y="186" width="74" height="48" rx="14" className="mk-d-card" />
      <text className="mk-d-name" x="603" y="215" textAnchor="middle">
        ✓ Live
      </text>
    </g>
  </svg>
);
