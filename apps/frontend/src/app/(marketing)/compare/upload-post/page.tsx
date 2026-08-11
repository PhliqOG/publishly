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
  title: 'Upload-Post alternative — Publishly vs Upload-Post',
  description:
    'Looking for an Upload-Post alternative? Upload-Post’s published tiers run $0 to $438/mo for 2 to 225 profiles; Publishly’s paid plans have unlimited connected accounts. The full side-by-side, from official pricing pages — last checked 2026-08-10.',
  keywords: [
    'upload-post alternative',
    'upload-post pricing',
    'upload-post vs publishly',
  ],
  alternates: { canonical: '/compare/upload-post' },
};

// Competitor numbers: data/claim-provenance.json (upload-post-tiers,
// retrieved 2026-08-10). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-10';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Profile-count tiers — $0 / $24 / $50 / $147 / $438 per month',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    'Between $147–$438 (75/225-profile tiers)',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    '225 profiles on the largest published tier',
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
  ['API-first', 'Yes — public API on every plan', 'Yes — API-first product'],
];

const FAQ = [
  {
    q: 'What is the best Upload-Post alternative?',
    a: 'It depends on how you bill your own fleet. If profile-count tiers are getting expensive as accounts grow, Publishly’s flat plans sized by post volume — with unlimited connected accounts — are built for that case. If a lean, low-cost API with a free tier for a small profile count is all you need, Upload-Post is a reasonable, API-first choice.',
  },
  {
    q: 'How much does Upload-Post cost for 100 profiles?',
    a: 'Upload-Post’s published tiers run $0 (2 profiles), $24 (5), $50 (25), $147 (75) and $438 (225) per month (checked 2026-08-10). None of the tiers land exactly on 100 profiles — the 225-profile tier at $438/mo is the smallest one that covers it.',
  },
  {
    q: 'Does Upload-Post charge by profile count?',
    a: 'Yes — every published Upload-Post tier is sized by the number of profiles it covers, from 2 up to 225. Publishly doesn’t bill by account count at all: plans are sized by monthly post volume, and connected accounts are unlimited on every paid plan.',
  },
];

export default function CompareUploadPostPage() {
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
              Publishly vs Upload-Post
            </h1>
            <p className="mk-section-lede">
              Upload-Post is a simple, API-first posting product with a public
              status page — a genuinely honest, lean tool. The comparison
              comes down to how each bills a growing account count, and what
              each promises when a post fails.
            </p>
            <QuickAnswer>
              Upload-Post’s published plans are profile-count tiers — $0 to
              $438 per month for 2 to 225 profiles. Publishly’s plans are
              sized by post volume with unlimited connected accounts, so 100
              accounts fit the $99/mo Growth plan. Choose Upload-Post for a
              minimal API and a published status page; choose Publishly for
              flat pricing at any account count and a delivery receipt on
              every post.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="up-math">
          <div className="mk-container">
            <h2 id="up-math" className="mk-h2">
              The tier math, spelled out.
            </h2>
            <p className="mk-section-lede">
              These are Upload-Post’s own published numbers — no estimates.
            </p>
            <FactLine>
              Upload-Post’s published plans are $0 for 2 profiles, $24 for 5,
              $50 for 25, $147 for 75, and $438 for 225 profiles per month.
            </FactLine>
            <div className="mk-prose" style={{ marginTop: 26 }}>
              <p>
                Every tier is a fixed profile ceiling. Outgrow one and the
                next tier up is the only option, even if you only needed a
                handful more accounts — profile 76 forces the jump from
                $147/mo straight to $438/mo.
              </p>
              <p>
                Publishly meters the other axis — how much you post. The
                Growth plan is $99/mo for 15,000 posts across unlimited
                connected accounts, so account 101 changes the bill by exactly
                nothing.
              </p>
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="up-table">
          <div className="mk-container">
            <h2 id="up-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Publishly vs Upload-Post — pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'Upload-Post']}
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

        <section className="mk-section" aria-labelledby="up-choose">
          <div className="mk-container">
            <h2 id="up-choose" className="mk-h2">
              An honest split.
            </h2>
            <p className="mk-section-lede">
              Upload-Post is a genuinely simple, API-first product — closer to
              Publishly in spirit than a full scheduling suite. The split is
              about billing shape and delivery visibility.
            </p>
            <div className="mk-duo">
              <div className="mk-duo-cell">
                <h3>Choose Upload-Post if…</h3>
                <ul className="mk-points">
                  <li>
                    You want a lean, API-first posting product and a free tier
                    to start with 2 profiles.
                  </li>
                  <li>
                    Your account count fits comfortably inside one published
                    tier and won’t force an early jump to the next.
                  </li>
                  <li>
                    A public status page is enough uptime visibility for your
                    use case — Upload-Post publishes one.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Publishly may not be the best choice if…</h3>
                <ul className="mk-points">
                  <li>
                    You want the smallest possible API surface for a handful
                    of profiles and don’t need workspace-level isolation.
                  </li>
                  <li>
                    Predictable profile-tier billing suits your model better
                    than volume-based pricing.
                  </li>
                  <li>
                    A published status page is your primary signal for uptime,
                    rather than per-post delivery receipts.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              Both API-first — one axis apart.
            </h2>
            <p>
              Upload-Post is the closer comparison of the field on failure
              visibility: it’s API-first, not a dashboard-first suite. What
              isn’t published is whether it fires a failure webhook or a
              per-post delivery receipt — Publishly does both, on every plan.
            </p>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Outgrow a tier without jumping one.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans sized by post volume, unlimited connected accounts,
                and a delivery receipt on every post.
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
