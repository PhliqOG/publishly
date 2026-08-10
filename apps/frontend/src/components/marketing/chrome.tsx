import Link from 'next/link';
import { CSSProperties } from 'react';
import { MARKETING } from './marketing.config';
import { PublishlyMark } from './logo';

export const MarketingNav = () => (
  <nav className="mk-nav">
    <div className="mk-container mk-nav-inner">
      <Link href="/" className="mk-nav-logo">
        <PublishlyMark />
        {MARKETING.brand}
      </Link>
      <div className="mk-nav-links">
        <Link href="/features">Features</Link>
        <Link href="/publishing">Publishing</Link>
        <Link href="/calendar">Calendar</Link>
        <Link href="/analytics">Analytics</Link>
        <Link href="/pricing">Pricing</Link>
      </div>
      <div className="mk-nav-spacer" />
      <Link href={MARKETING.authLogin} className="mk-signin">
        Sign in
      </Link>
      <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
        {MARKETING.cta.primary}
      </Link>
    </div>
  </nav>
);

const MARQUEE: Array<[string, string]> = [
  ['Instagram', 'var(--net-instagram)'],
  ['Facebook', 'var(--net-facebook)'],
  ['TikTok', 'var(--net-tiktok)'],
  ['YouTube', 'var(--net-youtube)'],
  ['X', 'var(--net-x)'],
  ['Threads', 'var(--net-threads)'],
  ['LinkedIn', 'var(--net-linkedin)'],
  ['Pinterest', 'var(--net-pinterest)'],
  ['Bluesky', 'var(--net-bluesky)'],
  ['Mastodon', 'var(--net-mastodon)'],
];

// Ten networks, official APIs only — stated as a ticker. The track is
// rendered twice for a seamless -50% loop; the duplicate is aria-hidden.
export const NetworkMarquee = () => (
  <div className="mk-marquee" aria-label="Ten networks, official APIs only">
    <div className="mk-marquee-track">
      {[0, 1].map((dup) => (
        <span key={dup} aria-hidden={dup === 1} style={{ display: 'contents' }}>
          {MARQUEE.map(([name, color]) => (
            <span
              key={name}
              className="mk-marquee-item"
              style={{ '--net': color } as CSSProperties}
            >
              {name}
            </span>
          ))}
        </span>
      ))}
    </div>
  </div>
);

export const MarketingFooter = () => (
  <footer className="mk-footer mk-on-ink">
    <div className="mk-container">
      <div className="mk-footer-grid">
        <div>
          <div className="mk-nav-logo" style={{ marginBottom: 10 }}>
            <PublishlyMark />
            {MARKETING.brand}
          </div>
          <div style={{ maxWidth: '44ch' }}>{MARKETING.openSource.line}</div>
          <div style={{ marginTop: 8 }}>
            <Link href="/source" style={{ textDecoration: 'underline' }}>
              {MARKETING.openSource.linkLabel}
            </Link>
          </div>
        </div>
        <div className="mk-footer-links">
          <Link href="/features">Features</Link>
          <Link href="/publishing">Publishing</Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/analytics">Analytics</Link>
          <Link href="/engagement">Engagement</Link>
          <Link href="/api-docs">API</Link>
          <Link href="/agencies">Agencies</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/security">Security</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/acceptable-use">Acceptable use</Link>
          <Link href={MARKETING.authLogin}>Sign in</Link>
        </div>
      </div>
      <div className="mk-footer-note">{MARKETING.footerNote}</div>
    </div>
  </footer>
);
