import Link from 'next/link';
import { CSSProperties } from 'react';
import { MARKETING } from './marketing.config';
import { MegaNav } from './mega-nav';
import { PublishlyWordmark } from './logo';
import './chrome.css';

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

// Four groups, real routes only. Analytics points at the marketing page
// (/product/analytics) — /analytics is the signed-in app.
const FOOTER_GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    'Product',
    [
      ['Composer', '/features'],
      ['Calendar', '/calendar'],
      ['Publishing', '/publishing'],
      ['Analytics', '/product/analytics'],
      ['Engagement', '/engagement'],
    ],
  ],
  [
    'Compare',
    [
      ['Publishly vs Ayrshare', '/compare/ayrshare'],
      ['Publishly vs Buffer', '/compare/buffer'],
      ['Publishly vs Metricool', '/compare/metricool'],
      ['Publishly vs Upload-Post', '/compare/upload-post'],
      ['Publishly vs Hootsuite', '/compare/hootsuite'],
      ['How we compare', '/methodology/api-comparisons'],
    ],
  ],
  [
    'Solutions',
    [
      ['Agencies', '/for-agencies'],
      ['Multi-brand', '/for-multi-brand'],
      ['Creator networks', '/for-creator-networks'],
      ['Developers', '/for-developers'],
    ],
  ],
  [
    'Resources',
    [
      ['Resources', '/resources'],
      ['Best posting APIs', '/resources/best-social-posting-apis-2026'],
      ['Ayrshare alternatives', '/resources/best-ayrshare-alternatives-2026'],
      ['Flat-pricing APIs', '/resources/best-flat-pricing-posting-apis'],
      ['Changelog', '/changelog'],
      ['Error codes', '/docs/errors'],
    ],
  ],
  // Company & legal must stay reachable from every page: platform app reviews
  // (Meta especially) require a discoverable privacy policy and data-deletion
  // route, and the security page answers procurement questions. The grid fits
  // five groups beside the brand column, so legal lives inside Company.
  [
    'Company',
    [
      ['About', '/about'],
      ['Security', '/security'],
      ['Platforms', '/platforms'],
      ['Contact', '/contact'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Acceptable use', '/acceptable-use'],
      ['Data deletion', '/data-deletion'],
    ],
  ],
];

// Closing chrome: pale-wash surface flowing out of the CTA panel, five-track
// grid (brand column + four groups), a thin meta rule, then the one brand
// moment — the wordmark oversized and cropped by the bottom of the page.
// Footer-specific styles live in the co-located chrome.css (mk-ft- prefix).
export const MarketingFooter = () => (
  <footer className="mk-footer mk-ft">
    <div className="mk-container">
      <div className="mk-footer-grid">
        <div>
          <div className="mk-nav-logo">
            <PublishlyWordmark compact />
          </div>
          <p className="mk-ft-agpl">{MARKETING.openSource.line}</p>
          <Link href="/source" className="mk-ft-source">
            {MARKETING.openSource.linkLabel}
          </Link>
        </div>
        {FOOTER_GROUPS.map(([title, links]) => (
          <nav key={title} className="mk-footer-col" aria-label={title}>
            <div className="mk-footer-coltitle">{title}</div>
            {links.map(([label, href]) => (
              <Link key={label} href={href} style={FOOT_LINK}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className="mk-ft-meta">
        <p>{MARKETING.footerNote}</p>
        <span>
          © {new Date().getFullYear()} {MARKETING.brand}
        </span>
      </div>
    </div>
    <div className="mk-ft-mark" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/publishly-wordmark.png"
        alt=""
        width={1220}
        height={380}
        loading="lazy"
        decoding="async"
      />
    </div>
  </footer>
);
