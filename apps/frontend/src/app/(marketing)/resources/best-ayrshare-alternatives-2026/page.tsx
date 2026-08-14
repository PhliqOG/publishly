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
  title: 'Best Ayrshare alternatives (2026)',
  description:
    'Four Ayrshare alternatives compared from official pricing pages — Publishly, Upload-Post, Buffer & Metricool — against Ayrshare’s published $1,228.30/mo at 100 profiles. Last checked 2026-08-11.',
  keywords: [
    'ayrshare alternatives',
    'ayrshare alternative 2026',
    'best ayrshare alternative',
  ],
  alternates: { canonical: '/resources/best-ayrshare-alternatives-2026' },
};

// Competitor numbers: data/claim-provenance.json (ayrshare-100-profiles,
// buffer-30-channels, metricool-tiers, upload-post-tiers, retrieved
// 2026-08-11). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-11';

const ENTRIES = [
  {
    name: 'Publishly',
    p: 'Publishly replaces Ayrshare’s per-profile billing with flat plans sized by post volume — connected accounts are unlimited on every paid plan, so the 101st profile costs nothing extra. It also publishes a signed failure webhook and a per-destination delivery receipt, which Ayrshare’s public pricing page doesn’t detail. Best fit when the roster is growing and per-profile math is the pain point.',
  },
  {
    name: 'Upload-Post',
    p: 'Upload-Post keeps a similar profile-tier structure to Ayrshare but at a fraction of the price — its largest published tier tops out at $438/mo for 225 profiles, versus Ayrshare’s $8.99-per-profile metering past 30. Best fit for teams that want tiered, predictable pricing without an enterprise sales process.',
  },
  {
    name: 'Buffer',
    p: 'Buffer trades Ayrshare’s API-first design for a polished consumer scheduler with a real free tier — but its $12/channel monthly Team pricing still grows with every channel. Best fit for smaller teams that want a well-known, easy-to-use tool.',
  },
  {
    name: 'Metricool',
    p: 'Metricool isn’t priced per profile at all — its published tiers run Free up to $53–159/mo — but it caps at 50 brands with no unlimited option, so it stops being a fit once the roster outgrows that ceiling. Best fit for teams under 50 brands that want analytics and scheduling in one suite.',
  },
];

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Profile-count tiers — $0 to $438/mo',
    'Per-channel — $10/channel/mo (Team)',
    'Tiered — Free / $20–36 / $53–159',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    'Between $147–$438 (75/225-profile tiers)',
    '$1,200/mo at 100 channels ($360/mo at 30), monthly billing',
    'Not offered — plans cap at 50 brands',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    '225 profiles on the largest published tier',
    'No cap published — each added channel is billed',
    '50 brands max',
  ],
  [
    'Failure webhooks',
    'Yes — signed post.failure webhook',
    'Not published',
    'Not published',
    'Not published',
  ],
  [
    'Delivery receipts',
    'Yes — per-destination state history + live post URL',
    'Not published',
    'Not published',
    'Not published',
  ],
];

export default function BestAyrshareAlternativesPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Resources
            </span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '20ch' }}>
              Best Ayrshare alternatives (2026).
            </h1>
            <p className="mk-section-lede">
              Ayrshare is a mature, well-regarded posting API — the reason
              teams go looking for an alternative is almost always its
              per-profile bill. Here are four, each with an honest note on who
              it actually fits.
            </p>
            <QuickAnswer>
              At Ayrshare’s published Business rates, 100 profiles cost
              $1,228.30/mo. The strongest alternatives are Publishly (flat
              plans, unlimited accounts, $99/mo Growth), Upload-Post
              (profile-count tiers up to $438/mo), Buffer (per-channel at
              $12/channel monthly, $1,200/mo at 100), and Metricool (analytics-first,
              capped at 50 brands). Which one fits depends on whether you need
              an API, a consumer scheduler, or an analytics suite.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-11" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="aya-list">
          <div className="mk-container">
            <h2 id="aya-list" className="mk-h2">
              The four alternatives.
            </h2>
            <p className="mk-section-lede">
              For the full breakdown of Ayrshare’s own pricing math, see{' '}
              <Link href="/compare/ayrshare">Publishly vs Ayrshare</Link>.
            </p>
            <div className="mk-benefits">
              {ENTRIES.map((entry, i) => (
                <div className="mk-benefit" key={entry.name}>
                  <span className="mk-benefit-num">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{entry.name}</h3>
                    <p>{entry.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="aya-table">
          <div className="mk-container">
            <h2 id="aya-table" className="mk-h2">
              Side by side.
            </h2>
            <FactLine>
              At published rates on 2026-08-11, Ayrshare’s per-profile pricing
              works out to $1,228.30/mo at 100 profiles — every alternative
              here either drops the per-profile bill entirely (Publishly,
              unlimited accounts at $99/mo Growth) or reduces it substantially
              at that scale.
            </FactLine>
            <CompareTable
              caption="Ayrshare alternatives — Publishly, Upload-Post, Buffer and Metricool pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'Upload-Post', 'Buffer', 'Metricool']}
              rows={ROWS}
            />
            <LastChecked date={CHECKED} />
            <div style={{ marginTop: 14, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <Link href="/compare/ayrshare" className="mk-arrow">
                Publishly vs Ayrshare
              </Link>
              <Link href="/methodology/api-comparisons" className="mk-arrow">
                How we compare
              </Link>
            </div>
          </div>
        </section>

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Add the 101st profile for $0.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans sized by post volume, a delivery receipt on every
                post, and a signed webhook the moment one fails.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/resources" className="mk-btn mk-btn-ghost">
                  More resources
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
