import Link from 'next/link';
import { CSSProperties } from 'react';
import { ScrollScene } from './motion';
import { MARKETING } from './marketing.config';

// The scroll cinema: headline exits, the week board zooms from a tilted
// miniature to full-bleed, and posts fly into their slots as you scroll.
// Purely CSS-driven off --p (see ScrollScene); this file is the data.

type Chip = {
  day: number;
  net: string;
  time: string;
  title: string;
  set?: boolean; // already on the board at the top of the page
  s: number; // scroll position where this chip starts flying in
  from?: 'left' | 'right' | 'below';
};

const CHIPS: Chip[] = [
  { day: 0, net: 'instagram', time: '9:00', title: 'New product photos', set: true, s: 0.3 },
  { day: 0, net: 'tiktok', time: '5:30', title: 'Behind the scenes', s: 0.44, from: 'left' },
  { day: 1, net: 'linkedin', time: '8:30', title: 'Company update', set: true, s: 0.34 },
  { day: 1, net: 'youtube', time: '12:00', title: 'Product demo', s: 0.5, from: 'below' },
  { day: 2, net: 'facebook', time: '10:00', title: 'Customer story', set: true, s: 0.38 },
  { day: 2, net: 'pinterest', time: '1:00', title: 'Spring lookbook', s: 0.72, from: 'below' },
  { day: 3, net: 'x', time: '9:30', title: 'Quick tips', s: 0.53, from: 'right' },
  { day: 3, net: 'threads', time: '4:00', title: 'Q&A answers', set: true, s: 0.42 },
  { day: 4, net: 'instagram', time: '11:00', title: 'Weekly recap', set: true, s: 0.46 },
  { day: 4, net: 'youtube', time: '3:00', title: 'Launch video', s: 0.58, from: 'below' },
];

const VECTORS: Record<NonNullable<Chip['from']>, CSSProperties> = {
  left: { '--dx': '-38vw', '--dy': '6vh', '--r': '-12deg' } as CSSProperties,
  right: { '--dx': '34vw', '--dy': '4vh', '--r': '10deg' } as CSSProperties,
  below: { '--dx': '-3vw', '--dy': '44vh', '--r': '-6deg' } as CSSProperties,
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const ChipEl = ({ chip }: { chip: Chip }) => (
  <div
    className={`mk-chip ${chip.set ? 'mk-chip-set mk-chip-live' : ''}`}
    style={
      {
        '--net': `var(--net-${chip.net})`,
        '--s': chip.s,
        ...(chip.from ? VECTORS[chip.from] : {}),
      } as CSSProperties
    }
  >
    <div className="mk-chip-meta">
      <span className="mk-chip-dot" />
      {chip.net} · {chip.time}
    </div>
    <div className="mk-chip-title">{chip.title}</div>
    <div className="mk-chip-state">
      <span className="mk-queued">Scheduled</span>
      <span className="mk-published">✓ Posted</span>
    </div>
  </div>
);

export const CalendarBoard = ({ mini = false }: { mini?: boolean }) => (
  <div className={`mk-board ${mini ? 'mk-board-mini' : ''}`}>
    <div className="mk-board-top">
      <span>
        <strong>This week</strong> · {MARKETING.brand}
      </span>
      <span>{CHIPS.length} posts this week</span>
    </div>
    <div className="mk-board-days">
      {DAYS.map((d) => (
        <div key={d}>{d}</div>
      ))}
    </div>
    <div className="mk-board-grid">
      {DAYS.map((d, i) => (
        <div className="mk-board-col" key={d}>
          {CHIPS.filter((c) => c.day === i).map((c) => (
            <ChipEl chip={c} key={c.title} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const HeroCinema = () => (
  <ScrollScene>
    <div className="mk-scene-frame">
      <div className="mk-cin-head" data-hide-after="0.22">
        <span className="mk-eyebrow">Social scheduling, run like rail</span>
        <h1 className="mk-h1">
          Every post leaves
          <br />
          <span className="mk-h1-time">on time.</span>
        </h1>
        <p className="mk-cin-sub">{MARKETING.sub}</p>
        <div className="mk-cin-ctas">
          <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
            {MARKETING.cta.primary}
          </Link>
          <Link href="/features" className="mk-btn mk-btn-ghost">
            {MARKETING.cta.secondary}
          </Link>
        </div>
      </div>

      <div className="mk-cin-stage">
        <CalendarBoard />
      </div>

      <div className="mk-cin-caption" data-live-after="0.82">
        <span className="mk-cin-caption-line">
          A week, planned in one sitting.
        </span>
        <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
          {MARKETING.cta.primary}
        </Link>
      </div>

      <div className="mk-cin-cue">Scroll</div>
    </div>
  </ScrollScene>
);
