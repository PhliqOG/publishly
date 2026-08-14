import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import {
  Byline,
  CompareTable,
  FactLine,
  LastChecked,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'Social media posting API comparison',
  description:
    'A factual social media posting API comparison: Publishly vs Ayrshare, Buffer, Hootsuite, bundle.social, Metricool, and Upload-Post. Checked 2026-08-11.',
  keywords: [
    'social media posting api comparison',
    'social media api pricing',
    'posting api for agencies',
  ],
  alternates: { canonical: '/compare' },
};

const CHECKED = '2026-08-11';

const COMPARISONS = [
  {
    href: '/compare/ayrshare',
    name: 'Publishly vs Ayrshare',
    sub: '$1,228.30 at 100 profiles on published monthly rates vs $99 with unlimited accounts.',
  },
  {
    href: '/compare/buffer',
    name: 'Publishly vs Buffer',
    sub: '$12 per Team channel on monthly billing vs flat plans based on successful posts.',
  },
  {
    href: '/compare/hootsuite',
    name: 'Publishly vs Hootsuite',
    sub: 'A broad $99–$399 per-user suite vs a focused posting-reliability layer.',
  },
  {
    href: '/compare/bundle-social',
    name: 'Publishly vs bundle.social',
    sub: 'A jump from free to $100 vs a $29 starting plan and confirmed-live billing.',
  },
  {
    href: '/compare/metricool',
    name: 'Publishly vs Metricool',
    sub: 'An analytics and planning suite with a 50-brand ceiling vs unlimited paid accounts.',
  },
  {
    href: '/compare/upload-post',
    name: 'Publishly vs Upload-Post',
    sub: 'Profile-count tiers up to 225 vs plans that do not change with account count.',
  },
  {
    href: '/methodology/api-comparisons',
    name: 'How we compare',
    sub: 'Every price dated and sourced. Every reliability claim checked against help or developer docs.',
  },
];

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat by successful-post volume',
    'Per profile',
    'Per channel',
    'Per user and plan level',
    'Flat by monthly post volume',
  ],
  [
    'Useful scale example',
    '$99 Growth · unlimited accounts · about 15k successful posts',
    '$1,228.30 · 100 profiles · monthly billing',
    '$360 · 30 Team channels · monthly billing',
    '$199 Professional · unlimited accounts · per user, annual billing',
    '$100 Pro · unlimited accounts · 10k posts',
  ],
  [
    'How you hear about failure',
    'In-app alert plus signed event with the reason and retry decision',
    'Scheduled-post result webhook; immediate result in the API response',
    'Optional failure email; no public posting-failure webhook found',
    'Optional failure email; no public posting-failure webhook found',
    'Failed-post webhook alerts',
  ],
  [
    'What “successful” means',
    'Publishly confirmed the public post and stored its link',
    'Per-platform result with IDs and links; TikTok has a later confirmation event',
    'Buffer says Sent does not always mean the post is live',
    'Published status in the calendar and a link to the network',
    'Public page promises post-status events; full confirmation rule not stated',
  ],
  [
    'What happens next',
    'Temporary problems retry safely; uncertain results stop for review',
    'Error guide tells customers to retry failed platforms',
    'Failed posts are not automatically retried after reconnection',
    'No general automatic posting-retry promise found',
    'No general safe-retry promise found',
  ],
  [
    'Connection warning',
    'Warnings before known expiry plus disconnect alerts',
    'Link and unlink events; no pre-expiry schedule found',
    'Disconnect and connection-update emails',
    'Disconnect email',
    'No pre-expiry warning schedule found',
  ],
];

export default function ComparePage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow">Compare</span>
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '22ch' }}
            >
              Compare the outcome, not the feature list.
            </h1>
            <p className="mk-section-lede">
              What will the same account count cost? How will you learn a post
              failed? Will the tool retry it safely? Those are the questions
              this comparison answers from current public sources.
            </p>
            <QuickAnswer>
              Publishly is built around one result: dependable posting across
              many brands, clients, locations, and markets. Paid plans include
              unlimited accounts, failed posts use no allowance, and every
              finished delivery leaves proof or a clear next step.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-11" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="cmp-pages">
          <div className="mk-container">
            <h2 id="cmp-pages" className="mk-h2">
              Pick the tool you are replacing.
            </h2>
            <p className="mk-section-lede">
              Each page says where the other product is stronger as well as
              where Publishly is different.
            </p>
            <div className="mk-cards">
              {COMPARISONS.map((comparison, index) => (
                <Link
                  href={comparison.href}
                  className="mk-card"
                  key={comparison.href}
                >
                  <span className="mk-card-num">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{comparison.name}</h3>
                  <p>{comparison.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="cmp-table"
        >
          <div className="mk-container">
            <h2 id="cmp-table" className="mk-h2">
              The buying questions, side by side.
            </h2>
            <p className="mk-section-lede">
              “Not found” means we could not find a public promise in the pages
              reviewed. It does not mean the feature can never exist.
            </p>
            <FactLine>
              At monthly rates checked on 2026-08-11, 100 Ayrshare profiles cost
              $1,228.30 and 30 Buffer Team channels cost $360. Publishly Growth
              is $99 with unlimited accounts.
            </FactLine>
            <CompareTable
              caption="Publishly, Ayrshare, Buffer, Hootsuite, and bundle.social pricing and reliability comparison"
              columns={[
                'Question',
                'Publishly',
                'Ayrshare',
                'Buffer',
                'Hootsuite',
                'bundle.social',
              ]}
              rows={ROWS}
            />
            <LastChecked date={CHECKED} />
            <p style={{ marginTop: 14 }}>
              <Link href="/methodology/api-comparisons" className="mk-arrow">
                Open every source and our comparison rules
              </Link>
            </p>
          </div>
        </section>

        <section style={{ padding: '72px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">
                Run the numbers on your own account mix.
              </h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                From 5 accounts to 500 across brands, clients, and locations:
                same posting rules, same flat Publishly price.
              </p>
              <div className="mk-hero-ctas">
                <Link href="/pricing" className="mk-btn mk-btn-primary">
                  Open the calculator
                </Link>
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-ghost"
                >
                  Start free
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
