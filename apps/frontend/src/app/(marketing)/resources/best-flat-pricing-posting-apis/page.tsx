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
  title: 'Best flat-pricing & unlimited-account posting APIs (2026)',
  description:
    'Publishly, bundle.social & Hootsuite Professional compared on flat, unlimited-account pricing — entry price, free tier & account caps, from official pricing pages, with an honest caveat on tiny-scale cost. Last checked 2026-08-10.',
  keywords: [
    'flat pricing social media api',
    'unlimited accounts posting api',
    'flat rate social media scheduler',
  ],
};

// Competitor numbers: data/claim-provenance.json (bundle-social-entry,
// hootsuite-entry, buffer-30-channels, retrieved 2026-08-10). Publishly
// numbers: data/public-product-facts.json.
const CHECKED = '2026-08-10';

const ENTRIES = [
  {
    name: 'Publishly',
    p: 'Publishly’s paid plans are sized by monthly post volume, not account count — connected accounts are unlimited from the $29/mo Starter plan up. There’s no point where adding another brand or client changes the bill.',
  },
  {
    name: 'bundle.social',
    p: 'bundle.social’s paid tiers start at PRO for $100/mo with unlimited accounts; its free tier is capped at 3 accounts and 20 posts/mo. It’s a straightforward flat-rate option once you’re past the free tier’s limits.',
  },
  {
    name: 'Hootsuite',
    p: 'Hootsuite’s Professional plan is $199/mo with unlimited accounts, sitting above its entry tier, which is capped at 10 social accounts. It’s an established enterprise suite with a broader feature set than a posting API alone.',
  },
];

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Flat monthly tiers, unlimited accounts from PRO up',
    'Flat monthly tiers, unlimited accounts from Professional up',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts) — same price at 5 or 500 accounts',
    '$100/mo PRO (unlimited accounts) — same price regardless of account count',
    '$199/mo Professional (unlimited accounts) — same price regardless of account count',
  ],
  [
    'Free tier',
    '$0 Free — 5 accounts, 50 posts/mo',
    '$0 Free — 3 accounts, 20 posts/mo',
    'Not published as unlimited — entry paid tier is $99/mo for 10 accounts',
  ],
  [
    'Unlimited-account tier starts at',
    'Starter, $29/mo',
    'PRO, $100/mo',
    'Professional, $199/mo',
  ],
];

export default function BestFlatPricingApisPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Resources
            </span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '22ch' }}>
              Best flat-pricing &amp; unlimited-account posting APIs (2026).
            </h1>
            <p className="mk-section-lede">
              Most posting tools bill per profile or per channel — the bill
              grows with every brand you win. These three don’t, once you’re
              past the free tier. And flat isn’t automatically the cheapest
              choice, so the honest caveat is here too.
            </p>
            <QuickAnswer>
              Three posting tools offer unlimited connected accounts on a flat
              monthly plan: Publishly (from $29/mo Starter), bundle.social
              ($100/mo PRO), and Hootsuite (Professional, $199/mo). Flat
              pricing pays off once the roster grows — at very small scale,
              per-account pricing can still be cheaper: 3 channels on Buffer’s
              published $10/channel rate cost about $30/mo.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="fp-list">
          <div className="mk-container">
            <h2 id="fp-list" className="mk-h2">
              The three flat-rate options.
            </h2>
            <p className="mk-section-lede">
              All three publish an unlimited-accounts tier — the difference is
              where that tier starts and what the free tier covers first.
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

        <section className="mk-section mk-section-tint" aria-labelledby="fp-table">
          <div className="mk-container">
            <h2 id="fp-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Flat-pricing, unlimited-account posting tools — Publishly, bundle.social and Hootsuite compared"
              columns={['Feature', 'Publishly', 'bundle.social', 'Hootsuite']}
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

        <section className="mk-section" aria-labelledby="fp-caveat">
          <div className="mk-container">
            <h2 id="fp-caveat" className="mk-h2">
              Flat isn’t always cheapest.
            </h2>
            <p className="mk-section-lede">
              An honest roundup has to say this part too: flat pricing is a
              bet that your roster keeps growing. At tiny scale, a per-account
              plan can still win.
            </p>
            <FactLine>
              At Buffer’s published Team rate of $10 per channel per month, 3
              channels cost about $30/mo — cheaper than any flat plan on this
              page. The flat-rate advantage shows up once the account count
              passes what a per-account plan’s free or entry tier covers.
            </FactLine>
          </div>
        </section>

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">No account math, ever.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Plans sized by how much you post — the same price whether
                you’re running 5 accounts or 500.
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
