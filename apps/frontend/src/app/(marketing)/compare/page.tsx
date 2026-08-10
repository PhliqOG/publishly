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
    'A social media posting API comparison built only from official pricing pages: Publishly vs Ayrshare, Buffer, Metricool & Upload-Post — cost at 100 accounts, account caps, failure webhooks, delivery receipts & retries. Last checked 2026-08-10.',
  keywords: [
    'social media posting api comparison',
    'social media api pricing',
    'posting api for agencies',
  ],
};

// Every competitor number on this page traces to data/claim-provenance.json
// (official pricing pages, retrieved 2026-08-10). Publishly numbers trace to
// data/public-product-facts.json. Do not edit a cell without updating provenance.
const CHECKED = '2026-08-10';

const COMPARISONS = [
  {
    href: '/compare/ayrshare',
    name: 'Publishly vs Ayrshare',
    sub: 'Per-profile API pricing vs flat plans — $1,228.30/mo vs $99/mo at 100 profiles, at published rates.',
  },
  {
    href: '/compare/buffer',
    name: 'Publishly vs Buffer',
    sub: 'A polished consumer scheduler at $10/channel/mo vs an API-first layer with unlimited accounts.',
  },
  {
    href: '/compare/metricool',
    name: 'Publishly vs Metricool',
    sub: 'An excellent analytics & planning suite with a 50-brand ceiling vs unlimited connected accounts.',
  },
  {
    href: '/compare/upload-post',
    name: 'Publishly vs Upload-Post',
    sub: 'Profile-count tiers (2 to 225 profiles) vs plans sized by post volume with unlimited accounts.',
  },
  {
    href: '/compare/hootsuite',
    name: 'Publishly vs Hootsuite',
    sub: 'An enterprise social suite vs an API-first reliability layer for multi-brand delivery.',
  },
  {
    href: '/methodology/api-comparisons',
    name: 'How we compare',
    sub: 'Every number from official pricing pages, dated, re-verified after 30 days — and where a competitor wins, we say so.',
  },
];

const MASTER_ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Per-profile — $599/mo incl. 30 profiles, then $8.99/profile',
    'Per-channel — $10/channel/mo (Team)',
    'Tiered — Free / $20–36 / $53–159',
    'Profile-count tiers — $0 to $438/mo',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    '$1,228.30/mo (published rates, monthly billing)',
    '$1,000/mo at $10/channel (≈$300/mo at 30 channels)',
    'Not offered — plans cap at 50 brands',
    'Between $147–$438 (75/225-profile tiers)',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    'No cap published — each added profile is billed',
    'No cap published — each added channel is billed',
    '50 brands max',
    '225 profiles on the largest published tier',
  ],
  [
    'Failure webhooks',
    'Yes — signed post.failure webhook',
    'Not published',
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
    'Not published',
  ],
  [
    'Automatic retries',
    'Yes — backoff retries that never double-post',
    'Not published',
    'Not published',
    'Not published',
    'Not published',
  ],
  [
    'Token-expiry alerts',
    'Yes — alert + email when a refresh fails',
    'Not published',
    'Not published',
    'Not published',
    'Not published',
  ],
  [
    'API-first',
    'Yes — public API on every plan',
    'Yes — API-first product',
    'Scheduler-first',
    'Analytics & planning suite first',
    'Yes — API-first product',
  ],
];

export default function ComparePage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Compare
            </span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '22ch' }}>
              How Publishly compares.
            </h1>
            <p className="mk-section-lede">
              A social media posting API comparison with a simple rule: every
              competitor number comes from the vendor’s official pricing page,
              carries a retrieval date, and links to how we compare. Where a
              tool is the better choice for a use case, the page says so.
            </p>
            <QuickAnswer>
              Publishly is a social publishing API and scheduler with flat
              plans sized by post volume — connected accounts are unlimited on
              every paid plan, so 100 accounts cost $99/mo on Growth. At their
              published rates, per-account competitors bill $1,228.30/mo
              (Ayrshare) and $1,000/mo (Buffer) at that scale, and Metricool’s
              plans stop at 50 brands.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="cmp-pages">
          <div className="mk-container">
            <h2 id="cmp-pages" className="mk-h2">
              Pick your comparison.
            </h2>
            <p className="mk-section-lede">
              Each page uses the same row set, the same sourcing rules, and an
              honest “choose them if” section. No trash talk — just the
              published numbers, side by side.
            </p>
            <div className="mk-cards">
              {COMPARISONS.map((c, i) => (
                <Link key={c.href} href={c.href} className="mk-card">
                  <span className="mk-card-num">0{i + 1}</span>
                  <h3>{c.name}</h3>
                  <p>{c.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="cmp-table">
          <div className="mk-container">
            <h2 id="cmp-table" className="mk-h2">
              The whole field, one table.
            </h2>
            <p className="mk-section-lede">
              The rows below are the ones multi-brand and multi-client teams
              ask about first: what 100 accounts cost, where the caps are, and
              what happens when a post fails.
            </p>
            <FactLine>
              At published rates on 2026-08-10, 100 connected accounts cost
              $1,228.30/mo on Ayrshare and $1,000/mo on Buffer, and Metricool’s
              plans stop at 50 brands — Publishly’s Growth plan is $99/mo with
              unlimited connected accounts.
            </FactLine>
            <CompareTable
              caption="Publishly vs Ayrshare, Buffer, Metricool and Upload-Post — pricing and reliability comparison"
              columns={[
                'Feature',
                'Publishly',
                'Ayrshare',
                'Buffer',
                'Metricool',
                'Upload-Post',
              ]}
              rows={MASTER_ROWS}
            />
            <LastChecked date={CHECKED} />
            <div style={{ marginTop: 14 }}>
              <Link href="/methodology/api-comparisons" className="mk-arrow">
                How we compare
              </Link>
            </div>
          </div>
        </section>

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Run the numbers on your own fleet.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Plans are sized by how much you post, not how many brands,
                clients, or locations you run. From 5 accounts to 500 — same
                API, same flat price.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/pricing" className="mk-btn mk-btn-ghost">
                  See pricing
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
