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
  FaqBlock,
  LastChecked,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'Metricool alternative with a posting API — Publishly vs Metricool',
  description:
    'A Metricool alternative API comparison from official pricing pages: Metricool’s published tiers run Free / $20–36 / $53–159 with a 50-brand maximum; Publishly’s paid plans have unlimited connected accounts and a posting API on every tier. Last checked 2026-08-10.',
  keywords: ['metricool alternative api', 'metricool 50 brand limit', 'metricool vs publishly'],
};

// Competitor numbers: data/claim-provenance.json (metricool-tiers,
// retrieved 2026-08-10). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-10';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Tiered — Free / Starter $20–36 / Advanced $53–159',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    'Not offered — published plans cap at 50 brands',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    '50 brands max — no unlimited tier',
  ],
  [
    'Failure webhooks',
    'Yes — signed post.failure webhook with reason, class & retry status',
    'Not published',
  ],
  [
    'Delivery receipts',
    'Yes — per-destination state history + stored live post URL',
    'Not published',
  ],
  [
    'Automatic retries',
    'Yes — backoff retries that never double-post',
    'Not published',
  ],
  [
    'Token-expiry alerts',
    'Yes — alert + email the moment a token refresh fails',
    'Not published',
  ],
  [
    'API-first',
    'Yes — public API on every plan',
    'Analytics & planning suite first — no posting-API-first surface',
  ],
];

const FAQ = [
  {
    q: 'How many brands can Metricool manage?',
    a: 'Metricool’s published plans top out at 50 brands, with no unlimited-accounts tier (checked 2026-08-10). Publishly’s paid plans have no account cap — plans are sized by monthly post volume instead.',
  },
  {
    q: 'How much does Metricool cost?',
    a: 'Metricool’s published tiers run Free, Starter at $20–36/mo, and Advanced at $53–159/mo (checked 2026-08-10). Publishly’s plans are $0, $29, $99, and $299 per month, sized by post volume with unlimited connected accounts on every paid plan.',
  },
  {
    q: 'When should I choose Metricool over Publishly?',
    a: 'Choose Metricool if you want a single suite for deep competitor analytics and content planning and your roster stays under 50 brands — it’s excellent at that job. Choose Publishly when you need a posting API, unlimited connected accounts, and per-post failure visibility across a growing multi-brand or multi-client fleet.',
  },
];

export default function CompareMetricoolPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Compare
            </span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '18ch' }}>
              Publishly vs Metricool
            </h1>
            <p className="mk-section-lede">
              Metricool is an excellent all-in-one analytics and planning
              suite — this isn’t a takedown. The comparison is about a ceiling:
              what happens when the roster passes 50 brands, and what happens
              when a post fails.
            </p>
            <QuickAnswer>
              Metricool’s published tiers run Free, Starter $20–36, and
              Advanced $53–159 per month, with a 50-brand maximum and no
              unlimited tier. Publishly’s paid plans have unlimited connected
              accounts and a posting API on every tier — 100 accounts fit the
              $99/mo Growth plan. Choose Metricool for analytics depth under 50
              brands; choose Publishly for API-first delivery at any account
              count.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="mt-ceiling">
          <div className="mk-container">
            <h2 id="mt-ceiling" className="mk-h2">
              The 50-brand ceiling.
            </h2>
            <p className="mk-section-lede">
              Metricool’s pricing is honest and reasonable — it just stops
              where fleets keep going.
            </p>
            <FactLine>
              Metricool’s published plans run Free, Starter $20–36, and
              Advanced $53–159 per month, with a maximum of 50 brands — there
              is no unlimited-accounts tier.
            </FactLine>
            <div className="mk-prose" style={{ marginTop: 26 }}>
              <p>
                For a team managing a handful of brands, that ceiling never
                shows up. For an agency or multi-location business adding
                clients every month, it’s a wall with a date on it.
              </p>
              <p>
                Metricool is also a suite first: planning, deep competitor
                analytics, reporting. Publishly is a posting API and scheduler
                first — delivery receipts, failure webhooks, and retries are
                the product, on every plan.
              </p>
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="mt-table">
          <div className="mk-container">
            <h2 id="mt-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Publishly vs Metricool — pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'Metricool']}
              rows={ROWS}
            />
            <LastChecked date={CHECKED} />
            <div style={{ marginTop: 14 }}>
              <Link href="/methodology/api-comparisons" className="mk-arrow">
                How we compare
              </Link>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="mt-choose">
          <div className="mk-container">
            <h2 id="mt-choose" className="mk-h2">
              An honest split.
            </h2>
            <p className="mk-section-lede">
              Two different centers of gravity: analytics depth vs delivery
              certainty.
            </p>
            <div className="mk-duo">
              <div className="mk-duo-cell">
                <h3>Choose Metricool if…</h3>
                <ul className="mk-points">
                  <li>
                    You want deep competitor analytics and planning in one
                    suite.
                  </li>
                  <li>You manage under 50 brands and expect to stay there.</li>
                  <li>
                    An all-in-one dashboard matters more than an API surface.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Choose Publishly if…</h3>
                <ul className="mk-points">
                  <li>
                    Your brand, client, or location count is growing past any
                    fixed cap — paid plans have no account limit.
                  </li>
                  <li>
                    You want a posting API first: scoped keys, post status
                    endpoints, and webhooks on every plan.
                  </li>
                  <li>
                    You need per-post failure visibility — a receipt, a reason,
                    and an automatic retry.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              Fifty brands is a ceiling.
            </h2>
            <p>
              If the roster stays under 50 and analytics depth is the priority,
              Metricool is an excellent home. If the roster keeps growing, a
              hard cap eventually becomes the plan — Publishly’s unlimited
              accounts mean it never is.
            </p>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">No brand cap. No account math.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Plans sized by how much you post — with a delivery receipt, a
                failure reason, and a retry behind every one.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/compare" className="mk-btn mk-btn-ghost">
                  All comparisons
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
