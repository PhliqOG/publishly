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
  title: 'Buffer alternative with an API — Publishly vs Buffer',
  description:
    'A Buffer alternative API comparison from official pricing pages: Buffer’s Team plan bills $10/channel/mo (≈$300/mo at 30 channels, $1,000/mo at 100); Publishly’s Growth plan is $99/mo with unlimited connected accounts. Last checked 2026-08-10.',
  keywords: ['buffer alternative api', 'buffer pricing per channel', 'buffer vs publishly'],
};

// Competitor numbers: data/claim-provenance.json (buffer-30-channels,
// retrieved 2026-08-10). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-10';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Per-channel — $10/channel/mo on Team',
  ],
  [
    'Cost at 100 accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    '$1,000/mo at 100 channels (≈$300/mo at 30 channels)',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    'No cap published — each added channel is billed',
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
    'Scheduler-first — built around its consumer app',
  ],
];

const FAQ = [
  {
    q: 'How much does Buffer cost for 100 channels?',
    a: 'At Buffer’s published Team rate of $10 per channel per month, 100 channels cost $1,000/mo and 30 channels cost about $300/mo (checked 2026-08-10). Publishly’s Growth plan is $99/mo with unlimited connected accounts and 15,000 posts.',
  },
  {
    q: 'Does Buffer charge per channel?',
    a: 'Yes — Buffer’s published Team pricing is $10 per channel per month, so the bill scales with every connected channel. Publishly sizes plans by monthly post volume instead; connected accounts are unlimited on every paid plan.',
  },
  {
    q: 'Is Publishly a Buffer alternative for agencies?',
    a: 'For agencies and multi-brand teams that want an API, per-post delivery receipts, and a webhook on every failure, yes — that’s the case Publishly is built for. If you run a small number of channels and want a polished consumer app with a free tier, Buffer is a fine choice.',
  },
];

export default function CompareBufferPage() {
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
              Publishly vs Buffer
            </h1>
            <p className="mk-section-lede">
              Buffer earned its brand recognition: a polished consumer UX and a
              free tier that helped a generation of teams start scheduling. The
              comparison is about what happens past channel 30 — and past the
              moment a post fails.
            </p>
            <QuickAnswer>
              Buffer’s published Team plan bills $10 per channel per month —
              about $300/mo at 30 channels and $1,000/mo at 100. Publishly’s
              plans are sized by post volume with unlimited connected accounts,
              so 100 accounts fit the $99/mo Growth plan, and every failed post
              carries a reason plus a signed webhook.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="bf-math">
          <div className="mk-container">
            <h2 id="bf-math" className="mk-h2">
              The per-channel tax.
            </h2>
            <p className="mk-section-lede">
              Buffer’s published rate is simple — which makes the fleet math
              simple too.
            </p>
            <FactLine>
              At Buffer’s published Team rate of $10 per channel per month, 30
              channels cost about $300/mo and 100 channels cost $1,000/mo.
            </FactLine>
            <div className="mk-prose" style={{ marginTop: 26 }}>
              <p>
                Per-channel pricing is fine at consumer scale. At agency scale
                it becomes a tax on every brand, client, and location you win —
                the bill compounds with the roster.
              </p>
              <p>
                Publishly meters posts, not accounts: $99/mo Growth covers
                15,000 posts across unlimited connected accounts. The 100th
                channel costs the same as the 6th — nothing.
              </p>
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="bf-table">
          <div className="mk-container">
            <h2 id="bf-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Publishly vs Buffer — pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'Buffer']}
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

        <section className="mk-section" aria-labelledby="bf-choose">
          <div className="mk-container">
            <h2 id="bf-choose" className="mk-h2">
              An honest split.
            </h2>
            <p className="mk-section-lede">
              Buffer is genuinely good at what it was built for — the split is
              about what you’re running.
            </p>
            <div className="mk-duo">
              <div className="mk-duo-cell">
                <h3>Choose Buffer if…</h3>
                <ul className="mk-points">
                  <li>
                    You want a polished consumer UX for a small number of
                    channels.
                  </li>
                  <li>You want a free tier to start scheduling today.</li>
                  <li>
                    Brand recognition matters — Buffer is a name your whole
                    team already knows.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Choose Publishly if…</h3>
                <ul className="mk-points">
                  <li>
                    You run many brands, clients, or locations and per-channel
                    billing punishes the roster.
                  </li>
                  <li>
                    You need an API surface — scheduling as infrastructure, not
                    just an app.
                  </li>
                  <li>
                    You need to know when a post fails: a receipt per
                    destination, a reason, and an automatic retry.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              Silence isn’t a status.
            </h2>
            <p>
              At 100 channels the published math is $1,000 a month — and Buffer
              doesn’t fire a webhook when a post fails. Publishly does: signed,
              with the reason and the retry already attached.
            </p>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Keep the roster. Drop the channel tax.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans sized by post volume, a delivery receipt on every
                post, and a webhook the moment one fails.
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
