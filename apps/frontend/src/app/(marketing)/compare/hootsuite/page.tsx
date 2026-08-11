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
  title: 'Hootsuite alternative for agencies — Publishly vs Hootsuite',
  description:
    'A Hootsuite alternative for agencies, compared from the official plans page: Hootsuite’s entry plan is $99/mo billed annually for 10 accounts, with unlimited accounts from Professional at $199/mo. Publishly’s paid plans have unlimited accounts on every tier. Last checked 2026-08-10.',
  keywords: [
    'hootsuite alternative for agencies',
    'hootsuite pricing',
    'hootsuite vs publishly',
  ],
  alternates: { canonical: '/compare/hootsuite' },
};

// Competitor numbers: data/claim-provenance.json (hootsuite-entry, retrieved
// 2026-08-10). Publishly numbers: data/public-product-facts.json. Note in the
// provenance file: pricing only — no "price hikes / complaints" framing.
const CHECKED = '2026-08-10';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Tiered — $99/mo (10 accounts, billed annually) up to Professional $199/mo',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    '$199/mo Professional (unlimited accounts)',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    '10 accounts on the entry plan; unlimited from Professional ($199/mo)',
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
    'Enterprise social suite first — listening, inbox & reporting breadth',
  ],
];

const FAQ = [
  {
    q: 'How much does Hootsuite cost?',
    a: 'Hootsuite’s published entry plan is $99/mo billed annually for 10 social accounts; unlimited accounts start at the Professional plan, $199/mo (checked 2026-08-10). Publishly’s plans are $0, $29, $99, and $299 per month, sized by post volume with unlimited connected accounts on every paid plan.',
  },
  {
    q: 'Does Hootsuite have an account limit?',
    a: 'Yes on the entry tier — it’s capped at 10 social accounts. Hootsuite’s published Professional plan ($199/mo) removes that cap. Publishly has no account cap on any paid plan, at any price point.',
  },
  {
    q: 'Is Publishly a good Hootsuite alternative for agencies?',
    a: 'For agencies that want an API-first layer with per-post delivery receipts, failure webhooks, and flat pricing that doesn’t track account count, yes. For agencies that need Hootsuite’s enterprise governance, social listening, or unified inbox breadth, Hootsuite remains the stronger fit — this page isn’t a case against it.',
  },
];

export default function CompareHootsuitePage() {
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
              Publishly vs Hootsuite
            </h1>
            <p className="mk-section-lede">
              Hootsuite is an enterprise social suite with governance,
              listening, and inbox tools most agencies never fully use.
              Publishly is an API-first reliability layer — the comparison is
              about which shape fits how you actually operate.
            </p>
            <QuickAnswer>
              Hootsuite’s published entry plan is $99/mo billed annually for
              10 accounts, with unlimited accounts starting at Professional,
              $199/mo. Publishly’s paid plans have unlimited connected
              accounts from the first tier — 100 accounts fit the $99/mo
              Growth plan. Choose Hootsuite for enterprise governance and
              listening breadth; choose Publishly for an API-first reliability
              layer with a receipt on every post.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="hs-shape">
          <div className="mk-container">
            <h2 id="hs-shape" className="mk-h2">
              Two different centers of gravity.
            </h2>
            <p className="mk-section-lede">
              Hootsuite’s own published numbers, no estimates.
            </p>
            <FactLine>
              Hootsuite’s published entry plan is $99/mo billed annually for
              10 social accounts; unlimited accounts start at the Professional
              plan, $199/mo.
            </FactLine>
            <div className="mk-prose" style={{ marginTop: 26 }}>
              <p>
                Hootsuite is built as an enterprise social suite: listening,
                a unified inbox, approval workflows, and reporting sit
                alongside publishing. That breadth is real, and it’s what
                Hootsuite is for.
              </p>
              <p>
                Publishly is a posting API and scheduler first — delivery
                receipts, failure webhooks, and retries are the product, on
                every plan, without the suite around them.
              </p>
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="hs-table">
          <div className="mk-container">
            <h2 id="hs-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Publishly vs Hootsuite — pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'Hootsuite']}
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

        <section className="mk-section" aria-labelledby="hs-choose">
          <div className="mk-container">
            <h2 id="hs-choose" className="mk-h2">
              An honest split.
            </h2>
            <p className="mk-section-lede">
              This isn’t a takedown — Hootsuite is genuinely built for a
              different job.
            </p>
            <div className="mk-duo">
              <div className="mk-duo-cell">
                <h3>Choose Hootsuite if…</h3>
                <ul className="mk-points">
                  <li>
                    You need enterprise governance — approval workflows, roles,
                    and compliance controls across a large org.
                  </li>
                  <li>
                    Social listening and a unified inbox matter as much as
                    publishing.
                  </li>
                  <li>
                    Your team wants one dashboard for reporting, engagement,
                    and scheduling together.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Choose Publishly if…</h3>
                <ul className="mk-points">
                  <li>
                    You want a posting API first: scoped keys, a status
                    endpoint, and webhooks on every plan.
                  </li>
                  <li>
                    Your account count is growing and a hard 10-account entry
                    cap doesn’t fit your fleet.
                  </li>
                  <li>
                    You need per-post failure visibility — a receipt, a
                    reason, and an automatic retry.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">An API-first layer, not a suite.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans sized by post volume, unlimited connected accounts,
                and a signed webhook the moment a post fails.
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
