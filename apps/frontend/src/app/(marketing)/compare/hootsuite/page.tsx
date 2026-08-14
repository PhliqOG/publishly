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
    'A factual Hootsuite alternative comparison: Hootsuite is $99, $199, or $399 per user each month on annual billing; Publishly starts at $29 with unlimited accounts. Checked 2026-08-11.',
  keywords: [
    'hootsuite alternative for agencies',
    'hootsuite pricing',
    'hootsuite vs publishly',
  ],
  alternates: { canonical: '/compare/hootsuite' },
};

// Competitor numbers: data/claim-provenance.json (hootsuite-entry, retrieved
// 2026-08-11). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-11';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Per user — $99 Standard, $199 Professional, $399 Advanced on annual billing',
  ],
  [
    'Cost at 100 brand or client accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    '$199/mo Professional (unlimited accounts)',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    '10 accounts on the entry plan; unlimited from Professional ($199/mo)',
  ],
  [
    'Failure alerts',
    'In-app alert plus signed event for your own software',
    'Optional email when a scheduled post fails; no public failure webhook found',
  ],
  [
    'Delivery receipts',
    'Confirmed-live history plus the public post link',
    'Calendar status and ability to open a published post on the network',
  ],
  [
    'Automatic retries',
    'Temporary problems retry safely without posting twice',
    'No general automatic posting-retry promise found in public help material',
  ],
  [
    'Connection warnings',
    'Warnings before known expiry plus reconnect alerts',
    'Email when a social account disconnects',
  ],
  [
    'Main product focus',
    'Reliable posting and delivery proof',
    'Planning, inbox, listening, reporting, approvals, and posting',
  ],
];

const FAQ = [
  {
    q: 'How much does Hootsuite cost?',
    a: 'Hootsuite’s published plans are $99 Standard, $199 Professional, and $399 Advanced per user each month on annual billing. Standard includes 10 social accounts; Professional and above include unlimited accounts (checked 2026-08-11). Publishly is $0, $29, $99, or $299 a month and every paid plan includes unlimited accounts.',
  },
  {
    q: 'Does Hootsuite have an account limit?',
    a: 'Yes on the entry tier — it’s capped at 10 social accounts. Hootsuite’s published Professional plan ($199/mo) removes that cap. Publishly has no account cap on any paid plan, at any price point.',
  },
  {
    q: 'Is Publishly a good Hootsuite alternative for agencies?',
    a: 'For agencies that care most about proof that each post went live, clear failure reasons, safe retries, and flat pricing, yes. For agencies that need Hootsuite’s broad social listening, inbox, approvals, and reporting in one suite, Hootsuite remains the stronger fit.',
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
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '18ch' }}
            >
              Publishly vs Hootsuite
            </h1>
            <p className="mk-section-lede">
              Hootsuite puts planning, inbox, listening, approvals, and reports
              in one broad suite. Publishly is narrower: make sure posts go
              live, explain the ones that do not, and keep the price flat as
              your brand, client, and location count grows.
            </p>
            <QuickAnswer>
              Hootsuite’s published entry plan is $99/mo billed annually for 10
              accounts, with unlimited accounts starting at Professional,
              $199/mo. Publishly’s paid plans have unlimited connected accounts
              from the first tier — 100 brand or client accounts fit the $99/mo
              Growth plan. Choose Hootsuite for its broad team suite; choose
              Publishly when delivery proof and safe recovery matter most.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-11" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="hs-shape">
          <div className="mk-container">
            <h2 id="hs-shape" className="mk-h2">
              Two products built for different outcomes.
            </h2>
            <p className="mk-section-lede">
              Hootsuite’s own published numbers, no estimates.
            </p>
            <FactLine>
              Hootsuite’s published entry plan is $99/mo billed annually for 10
              social accounts; unlimited accounts start at the Professional
              plan, $199/mo. Advanced is $399/mo. Prices are per user.
            </FactLine>
            <div className="mk-prose" style={{ marginTop: 26 }}>
              <p>
                Hootsuite is built as a broad social suite. Listening, a shared
                inbox, approvals, and reporting sit beside publishing. That
                breadth is real, and it is what Hootsuite is for.
              </p>
              <p>
                Publishly focuses on a smaller promise: prove each post went
                live, explain every failure, retry safely, and warn about weak
                connections before the schedule breaks.
              </p>
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="hs-table"
        >
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
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                gap: 22,
                flexWrap: 'wrap',
              }}
            >
              <a
                href="https://www.hootsuite.com/plans"
                className="mk-arrow"
                target="_blank"
                rel="noreferrer"
              >
                Hootsuite pricing source
              </a>
              <a
                href="https://www.g2.com/products/hootsuite/reviews"
                className="mk-arrow"
                target="_blank"
                rel="noreferrer"
              >
                Current review themes on G2
              </a>
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
                    You need approvals, roles, and controls across a large
                    organization.
                  </li>
                  <li>
                    Social listening and a unified inbox matter as much as
                    publishing.
                  </li>
                  <li>
                    Your team wants one dashboard for reporting, engagement, and
                    scheduling together.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Choose Publishly if…</h3>
                <ul className="mk-points">
                  <li>
                    You want your own software to receive a clear result and
                    failure reason for every post.
                  </li>
                  <li>
                    Your account count is growing and a hard 10-account entry
                    cap does not fit your multi-brand or multi-client work.
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
              Price and posting issues are part of the buying decision.
            </h2>
            <p>
              Hootsuite&rsquo;s current public ladder runs from $99 to $399 per
              user each month on annual billing. G2&rsquo;s current review
              themes include “Expensive,” “High Pricing,” and “Posting Issues.”
              Those reviews do not erase Hootsuite&rsquo;s strengths; they are a
              reason to test delivery and alerts with your own accounts before
              buying.
            </p>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">
                Pay for reliable delivery, not a bigger suite.
              </h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans based on successful posts, unlimited connected
                accounts, and a clear next step the moment a post fails.
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
