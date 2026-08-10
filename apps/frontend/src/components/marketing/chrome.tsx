import Link from 'next/link';
import { CSSProperties } from 'react';
import { MARKETING } from './marketing.config';
import { MegaNav } from './mega-nav';
import { PublishlyWordmark } from './logo';

// All pages share the mega-menu nav so the chrome never swaps mid-site.
export const MarketingNav = () => <MegaNav />;

const NETWORKS: Array<[string, string]> = [
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

// Kept for compatibility — the v3 home no longer renders this. Now a static,
// non-animated strip of the ten networks (platform dots are data/trademark).
export const NetworkMarquee = () => (
  <div
    aria-label="Ten networks, official APIs only"
    style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
  >
    {NETWORKS.map(([name, color]) => (
      <span
        key={name}
        className="mk-minichip"
        style={{ '--net': color } as CSSProperties}
      >
        <i />
        {name}
      </span>
    ))}
  </div>
);

// Footer links are 14px text; a touch of block padding keeps every hit
// target at or above 24px without touching the shared CSS.
const FOOT_LINK: CSSProperties = { paddingBlock: '2px' };

export const MarketingFooter = () => (
  <footer className="mk-footer">
    <div className="mk-container">
      <div className="mk-footer-grid">
        <div>
          <div className="mk-nav-logo" style={{ marginBottom: 12 }}>
            <PublishlyWordmark compact />
          </div>
          <p
            style={{
              margin: 0,
              maxWidth: '40ch',
              fontSize: '13.5px',
              lineHeight: 1.65,
            }}
          >
            {MARKETING.openSource.line}
          </p>
          <div style={{ marginTop: 10 }}>
            <Link
              href="/source"
              style={{
                display: 'inline-block',
                paddingBlock: '2px',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
            >
              {MARKETING.openSource.linkLabel}
            </Link>
          </div>
        </div>
        <div className="mk-footer-col">
          <div className="mk-footer-coltitle">Product</div>
          <Link href="/features" style={FOOT_LINK}>Features</Link>
          <Link href="/publishing" style={FOOT_LINK}>Publishing</Link>
          <Link href="/calendar" style={FOOT_LINK}>Calendar</Link>
          <Link href="/analytics" style={FOOT_LINK}>Analytics</Link>
          <Link href="/engagement" style={FOOT_LINK}>Engagement</Link>
          <Link href="/agencies" style={FOOT_LINK}>Agencies</Link>
        </div>
        <div className="mk-footer-col">
          <div className="mk-footer-coltitle">Resources</div>
          <Link href="/api-docs" style={FOOT_LINK}>API docs</Link>
          <Link href="/pricing" style={FOOT_LINK}>Pricing</Link>
          <Link href="/security" style={FOOT_LINK}>Security</Link>
          <Link href="/source" style={FOOT_LINK}>Source</Link>
        </div>
        <div className="mk-footer-col">
          <div className="mk-footer-coltitle">Company</div>
          <Link href="/about" style={FOOT_LINK}>About</Link>
          <Link href="/contact" style={FOOT_LINK}>Contact</Link>
          <Link href="/terms" style={FOOT_LINK}>Terms</Link>
          <Link href="/privacy" style={FOOT_LINK}>Privacy</Link>
          <Link href="/acceptable-use" style={FOOT_LINK}>Acceptable use</Link>
          <Link href={MARKETING.authLogin} style={FOOT_LINK}>Sign in</Link>
        </div>
      </div>
      <div className="mk-footer-note">{MARKETING.footerNote}</div>
    </div>
  </footer>
);
