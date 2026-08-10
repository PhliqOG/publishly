// ConnectionDiagram v3 — the vertical journey. Top → bottom: your calendar,
// multi-brand routing, the networks, the delivery receipt, engagement
// analytics, and the caption-AI learning loop that returns up the side.
//
// Reuses the .mk-d-* animation contract owned by motion.tsx: .mk-d-path
// stroke-draws, .mk-d-node pops, .mk-d-name / .mk-d-sub fade in, .mk-d-pulse
// rides the paths via MotionPath. Pulse N is bound to path N in DOM order, so
// the spine paths are emitted first & the six pulses travel the whole journey
// — including the learning return. Fully legible with animation disabled.

const CX = 280; // the spine

// platform row — trademark colors, same card style as v2
const PLATFORMS = [
  { x: 48, label: 'Instagram', dot: '#E1306C' },
  { x: 142, label: 'TikTok', dot: '#0E0E0C' },
  { x: 236, label: 'YouTube', dot: '#FF0033' },
  { x: 330, label: 'LinkedIn', dot: '#0A66C2' },
  { x: 424, label: '+24 more', dot: '#55B0FF' },
];
const CARD_W = 88;
const ROW_Y = 402;
const ROW_H = 60;
const mid = (x: number) => x + CARD_W / 2;

// the brands moving through the router
const BRAND_DOTS = [
  { cx: 210, fill: '#ffffff' },
  { cx: 238, fill: '#ffd34d' },
  { cx: 266, fill: '#bfe4ff' },
  { cx: 294, fill: '#ffffff' },
  { cx: 322, fill: '#a9dbff' },
  { cx: 350, fill: '#ffe9a8' },
];

const fanOut = (cx: number) =>
  `M ${CX} 282 C ${CX} 340, ${cx} 348, ${cx} ${ROW_Y}`;
const fanIn = (cx: number) =>
  `M ${cx} ${ROW_Y + ROW_H} C ${cx} 498, ${CX} 498, ${CX} 530`;

// the learning return: node 6 → up the left channel → back into the calendar
const LOOP =
  'M 104 898 C 48 898, 20 866, 20 812 L 20 160 C 20 108, 44 69, 90 69';

// Spine first (pulses ride these), then the outer lanes.
const SPINE = [
  { d: 'M 280 112 L 280 178', at: [280, 112] }, // calendar → routing
  { d: fanOut(CX), at: [280, 282] }, // routing → networks
  { d: fanIn(CX), at: [280, 462] }, // networks → receipt
  { d: 'M 280 622 L 280 692', at: [280, 622] }, // receipt → analytics
  { d: 'M 280 780 L 280 852', at: [280, 780] }, // analytics → caption AI
];

const OUTER = PLATFORMS.filter((p) => mid(p.x) !== CX);

export const ConnectionDiagram = () => (
  <svg
    className="mk-diagram mk-journey"
    viewBox="0 0 560 980"
    role="img"
    aria-label="The Publishly journey, top to bottom: one calendar for every brand, multi-brand routing to each brand's own accounts, delivery to Instagram, TikTok, YouTube, LinkedIn and 24 more networks, a delivery receipt with state and live URL, engagement analytics, and a caption AI learning loop — in development — that feeds what performed back into the calendar."
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

    {/* ---- connectors: bold, smooth, rounded ---- */}
    {SPINE.map((s) => (
      <path key={s.d} className="mk-d-path" d={s.d} />
    ))}
    {/* the learning loop — same draw-in, sun-colored so it reads as its own idea */}
    <path
      className="mk-d-path"
      d={LOOP}
      style={{ stroke: 'var(--mk-sun)' }}
    />
    {OUTER.map((p) => (
      <path key={`out-${p.label}`} className="mk-d-path" d={fanOut(mid(p.x))} />
    ))}
    {OUTER.map((p) => (
      <path key={`in-${p.label}`} className="mk-d-path" d={fanIn(mid(p.x))} />
    ))}

    {/* ---- traveling pulses: one per spine path, plus one on the loop ---- */}
    {SPINE.map((s) => (
      <circle
        key={`p-${s.d}`}
        className="mk-d-pulse"
        r="4.5"
        cx={s.at[0]}
        cy={s.at[1]}
      />
    ))}
    <circle
      className="mk-d-pulse"
      r="4.5"
      cx="104"
      cy="898"
      style={{ fill: 'var(--mk-sun)' }}
    />

    {/* ---- 1 · your calendar ---- */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="90" y="26" width="380" height="86" rx="22" className="mk-d-card" />
      <text
        className="mk-d-name"
        x={CX}
        y="60"
        textAnchor="middle"
        style={{ fontSize: 15 }}
      >
        Your calendar
      </text>
      <text className="mk-d-sub" x={CX} y="84" textAnchor="middle">
        every brand, one plan
      </text>
    </g>

    {/* ---- 2 · multi-brand routing ---- */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="166" y="178" width="228" height="104" rx="26" fill="url(#mkdHub)" />
      <text
        className="mk-d-name"
        x={CX}
        y="220"
        textAnchor="middle"
        style={{ fill: '#ffffff', fontSize: 15, fontWeight: 700 }}
      >
        Multi-brand routing
      </text>
      {BRAND_DOTS.map((b) => (
        <circle key={b.cx} cx={b.cx} cy="248" r="5.5" fill={b.fill} opacity="0.95" />
      ))}
    </g>

    {/* ---- 3 · the networks ---- */}
    {PLATFORMS.map((p) => (
      <g key={p.label} className="mk-d-node" filter="url(#mkdSoft)">
        <rect
          x={p.x}
          y={ROW_Y}
          width={CARD_W}
          height={ROW_H}
          rx="16"
          className="mk-d-card"
        />
        <circle cx={mid(p.x)} cy={ROW_Y + 21} r="5" fill={p.dot} />
        <text
          className="mk-d-name"
          x={mid(p.x)}
          y={ROW_Y + 44}
          textAnchor="middle"
          style={{ fontSize: 12 }}
        >
          {p.label}
        </text>
      </g>
    ))}

    {/* ---- 4 · the delivery receipt ---- */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="112" y="530" width="336" height="92" rx="22" className="mk-d-card" />
      <text
        className="mk-d-name"
        x={CX}
        y="570"
        textAnchor="middle"
        style={{ fontSize: 15 }}
      >
        Delivery receipts ✓
      </text>
      <text className="mk-d-sub" x={CX} y="594" textAnchor="middle">
        state, live URL, webhook
      </text>
    </g>

    {/* ---- 5 · engagement analytics ---- */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="132" y="692" width="296" height="88" rx="22" className="mk-d-card" />
      <text
        className="mk-d-name"
        x={CX}
        y="728"
        textAnchor="middle"
        style={{ fontSize: 15 }}
      >
        Engagement analytics
      </text>
      <text className="mk-d-sub" x={CX} y="752" textAnchor="middle">
        views, saves, shares
      </text>
    </g>

    {/* ---- 6 · the loop closer (in development) ---- */}
    <g className="mk-d-node" filter="url(#mkdSoft)">
      <rect x="104" y="852" width="352" height="92" rx="22" className="mk-d-card" />
      <text
        className="mk-d-name"
        x={CX}
        y="890"
        textAnchor="middle"
        style={{ fontSize: 14.5 }}
      >
        Caption AI learns what worked
      </text>
      <text className="mk-d-sub" x={CX} y="914" textAnchor="middle">
        in development
      </text>
    </g>

    {/* ---- the learning loop, named ---- */}
    <text
      className="mk-d-sub"
      x="44"
      y="640"
      textAnchor="middle"
      transform="rotate(-90 44 640)"
    >
      what performed feeds the next captions
    </text>
  </svg>
);
