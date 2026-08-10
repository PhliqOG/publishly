import Link from 'next/link';
import { CSSProperties } from 'react';
import { CalendarBoard } from './hero-cinema';
import { MARKETING } from './marketing.config';

// Night Rail hero: layered headline left, the command deck right — the live
// week board with a delivery-log card overlapping it. Entrance is a one-time
// staggered rise (mk-enter-*), pure CSS, disabled under reduced motion.

const TICKER: Array<{ net: string; text: string; ok: boolean }> = [
  { net: 'instagram', text: 'reel published · 09:00', ok: true },
  { net: 'linkedin', text: 'post published · 08:30', ok: true },
  { net: 'youtube', text: 'upload queued · 12:00', ok: false },
  { net: 'x', text: 'thread queued · 18:00', ok: false },
];

export const HeroDeck = () => (
  <header className="mk-hero">
    <div className="mk-container mk-hero-inner">
      <div>
        <span className="mk-eyebrow mk-enter mk-enter-1">
          Social scheduling, run like infrastructure
        </span>
        <h1 className="mk-h1 mk-enter mk-enter-2">
          Every post leaves
          <br />
          <span className="mk-h1-time">on time.</span>
        </h1>
        <p className="mk-hero-sub mk-enter mk-enter-3">{MARKETING.sub}</p>
        <div className="mk-hero-ctas mk-enter mk-enter-4">
          <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
            {MARKETING.cta.primary}
          </Link>
          <Link href="/publishing" className="mk-btn mk-btn-ghost">
            {MARKETING.cta.secondary}
          </Link>
        </div>
        <div className="mk-hero-facts mk-enter mk-enter-5">
          <span className="mk-hero-fact">10 networks</span>
          <span className="mk-hero-fact">Official APIs only</span>
          <span className="mk-hero-fact">Open source engine</span>
        </div>
      </div>

      <div className="mk-deck">
        <div className="mk-deck-board mk-enter mk-enter-3">
          <CalendarBoard />
        </div>
        <div className="mk-deck-ticker mk-enter mk-enter-5">
          <div className="mk-ticker">
            <div className="mk-ticker-title">Delivery log</div>
            {TICKER.map((row) => (
              <div className="mk-ticker-row" key={row.text}>
                <span
                  className="mk-ticker-dot"
                  style={{ '--net': `var(--net-${row.net})` } as CSSProperties}
                />
                <span className={row.ok ? 'mk-ticker-ok' : undefined}>
                  {row.ok ? '✓' : '·'}
                </span>
                <span>{row.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </header>
);
