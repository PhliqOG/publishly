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
  title: 'Ayrshare alternative — Publishly vs Ayrshare',
  description:
    'Looking for an Ayrshare alternative? At published rates, Ayrshare works out to $1,228.30/mo at 100 profiles; Publishly’s Growth plan is $99/mo with unlimited connected accounts. The full side-by-side, from official pricing pages — last checked 2026-08-10.',
  keywords: ['ayrshare alternative', 'ayrshare pricing', 'ayrshare vs publishly'],
};

// Competitor numbers: data/claim-provenance.json (ayrshare-100-profiles,
// retrieved 2026-08-10). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-10';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Per-profile — Business $599/mo incl. 30 profiles, then $8.99/profile/mo',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    '$1,228.30/mo (published rates, monthly billing)',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    'No cap published — each added profile is billed',
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
    q: 'What is the best Ayrshare alternative?',
    a: 'It depends on what you’re replacing. If the pain is per-profile pricing across many brands or clients, Publishly is built for that case: flat plans sized by post volume, unlimited connected accounts, a delivery receipt per destination, and a signed webhook on every failure. If you need the broadest network list or a long enterprise track record, Ayrshare itself remains a strong choice.',
  },
  {
    q: 'How much does Ayrshare cost for 100 profiles?',
    a: 'At Ayrshare’s published Business rates, 100 profiles work out to $1,228.30 per month: a $599 base that includes 30 profiles, plus 70 additional profiles at $8.99 each (monthly billing, checked 2026-08-10).',
  },
  {
    q: 'Does Ayrshare charge per profile?',
    a: 'Yes. Ayrshare’s published Business plan includes 30 profiles in its $599/mo base and bills $8.99 per additional profile per month. Publishly doesn’t bill per account — plans are sized by monthly post volume and connected accounts are unlimited on every paid plan.',
  },
];

export default function CompareAyrsharePage() {
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
              Publishly vs Ayrshare
            </h1>
            <p className="mk-section-lede">
              Ayrshare is a mature social posting API with an established track
              record. The comparison comes down to how each bills a growing
              multi-brand or multi-client roster — and what each tells you when
              a post fails.
            </p>
            <QuickAnswer>
              Ayrshare bills per profile: at published rates, 100 profiles work
              out to $1,228.30/mo. Publishly’s plans are sized by post volume
              with unlimited connected accounts — 100 accounts fit the $99/mo
              Growth plan. Choose Ayrshare for its broader network list and
              enterprise history; choose Publishly for flat pricing and
              per-post failure visibility.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="ay-math">
          <div className="mk-container">
            <h2 id="ay-math" className="mk-h2">
              The per-profile math, spelled out.
            </h2>
            <p className="mk-section-lede">
              These are Ayrshare’s own published numbers — no estimates, no
              hidden assumptions.
            </p>
            <FactLine>
              Ayrshare’s published Business pricing works out to $1,228.30 per
              month at 100 profiles: a $599 base including 30 profiles, plus 70
              additional profiles at $8.99 each (monthly billing).
            </FactLine>
            <div className="mk-prose" style={{ marginTop: 26 }}>
              <p>
                The base plan covers your first 30 profiles. Profile 31 onward
                is metered: every brand, client, or location you add puts
                another $8.99 on the monthly invoice.
              </p>
              <p>
                Publishly meters the other axis — how much you post. The Growth
                plan is $99/mo for 15,000 posts across unlimited connected
                accounts, so adding account #101 changes the bill by exactly
                nothing.
              </p>
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="ay-table">
          <div className="mk-container">
            <h2 id="ay-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Publishly vs Ayrshare — pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'Ayrshare']}
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

        <section className="mk-section" aria-labelledby="ay-choose">
          <div className="mk-container">
            <h2 id="ay-choose" className="mk-h2">
              An honest split.
            </h2>
            <p className="mk-section-lede">
              These are different products for different buyers — here’s the
              line as we see it.
            </p>
            <div className="mk-duo">
              <div className="mk-duo-cell">
                <h3>Choose Ayrshare if…</h3>
                <ul className="mk-points">
                  <li>
                    You want a mature enterprise API with an established track
                    record — Publishly is new and self-served.
                  </li>
                  <li>
                    You need networks beyond Publishly’s 10 — Ayrshare
                    publishes a broader network list.
                  </li>
                  <li>
                    Your rollout runs through procurement and expects a long
                    vendor history.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Publishly may not be the best choice if…</h3>
                <ul className="mk-points">
                  <li>
                    You need a long vendor history before a tool can enter your
                    stack.
                  </li>
                  <li>
                    Your procurement requirements call for enterprise
                    contracting rather than self-serve.
                  </li>
                  <li>
                    Your workflow depends on networks beyond the 10 Publishly
                    posts to.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              The bill that grows with every win.
            </h2>
            <p>
              Ayrshare is a mature, well-documented API — and per-profile
              pricing means your bill grows with every win. Publishly’s
              doesn’t.
            </p>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Add the 101st account for $0.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans sized by post volume, delivery receipts on every
                post, and a signed webhook the moment one fails.
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
