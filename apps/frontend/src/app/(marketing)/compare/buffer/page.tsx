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
    'A factual Buffer alternative API comparison: Buffer Team is $12/channel on monthly billing, or $360 for 30 channels; Publishly Growth is $99 with unlimited accounts. Checked 2026-08-11.',
  keywords: [
    'buffer alternative api',
    'buffer pricing per channel',
    'buffer vs publishly',
  ],
  alternates: { canonical: '/compare/buffer' },
};

// Competitor numbers: data/claim-provenance.json (buffer-30-channels,
// retrieved 2026-08-11). Publishly numbers: data/public-product-facts.json.
const CHECKED = '2026-08-11';

const ROWS: string[][] = [
  [
    'Pricing model',
    'Flat plans sized by post volume',
    'Per-channel — Team is $12/channel monthly or $10/channel annually',
  ],
  [
    'Cost at 100 brand or client accounts',
    '$99/mo Growth (unlimited accounts, 15k posts)',
    '$1,200/mo at 100 channels ($360/mo at 30) on monthly billing',
  ],
  [
    'Account cap',
    'Unlimited on every paid plan',
    'No cap published — each added channel is billed',
  ],
  [
    'Failure alerts',
    'In-app alert plus signed event for your own software',
    'Optional failure email; no public posting-failure webhook found',
  ],
  [
    'Delivery receipts',
    'Confirmed-live history plus the public post link',
    'Sent history; Buffer says “Sent” does not always mean the post is live',
  ],
  [
    'Automatic retries',
    'Temporary problems retry safely without posting twice',
    'Buffer says failed posts are not retried automatically after reconnection',
  ],
  [
    'Connection warnings',
    'Warnings before known expiry plus reconnect alerts',
    'Channel-connection email updates and disconnect alerts',
  ],
  [
    'API access',
    'Included on every plan',
    'Included on every plan with request limits by tier',
  ],
];

const FAQ = [
  {
    q: 'How much does Buffer cost for 100 channels?',
    a: 'At Buffer’s published monthly Team rate of $12 per channel, 100 channels cost $1,200 and 30 channels cost $360. Annual billing lowers that to $10 per channel. Publishly Growth is $99 a month with unlimited connected accounts and 15,000 successful posts (checked 2026-08-11).',
  },
  {
    q: 'Does Buffer charge per channel?',
    a: 'Yes. Buffer’s published Team pricing is $12 per channel on monthly billing or $10 when billed annually, so the total changes with every connected channel. Publishly prices by monthly successful-post volume instead; connected accounts are unlimited on every paid plan.',
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
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '18ch' }}
            >
              Publishly vs Buffer
            </h1>
            <p className="mk-section-lede">
              Buffer earned its brand recognition: a polished consumer UX and a
              free tier that helped a generation of teams start scheduling. The
              comparison is about what happens past channel 30 — and past the
              moment a post fails.
            </p>
            <QuickAnswer>
              Buffer’s published Team plan bills $12 per channel on monthly
              billing — $360 at 30 channels and $1,200 at 100. Publishly’s plans
              are sized by post volume with unlimited connected accounts, so 100
              brand or client accounts fit the $99/mo Growth plan, and every
              failed post carries a reason plus a signed webhook.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-11" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="bf-math">
          <div className="mk-container">
            <h2 id="bf-math" className="mk-h2">
              The per-channel tax.
            </h2>
            <p className="mk-section-lede">
              Buffer’s published rate is simple, which makes the account math
              simple too.
            </p>
            <FactLine>
              At Buffer’s published monthly Team rate of $12 per channel, 30
              channels cost $360 and 100 channels cost $1,200. Annual billing
              lowers the rate to $10 per channel.
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

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="bf-table"
        >
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
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                gap: 22,
                flexWrap: 'wrap',
              }}
            >
              <a
                href="https://buffer.com/pricing"
                className="mk-arrow"
                target="_blank"
                rel="noreferrer"
              >
                Buffer pricing source
              </a>
              <a
                href="https://support.buffer.com/article/573-refreshing-a-channel-in-buffer"
                className="mk-arrow"
                target="_blank"
                rel="noreferrer"
              >
                Buffer retry source
              </a>
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
                    Brand recognition matters — Buffer is a name your whole team
                    already knows.
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
                    You want your posting cost to follow successful volume, not
                    the number of channels you connect.
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
              The key difference happens after “send.”
            </h2>
            <p>
              Buffer can email you when a post fails. Publishly also tells your
              software, decides whether a retry is safe, and does not call a
              post successful until it has confirmed the public result.
            </p>
          </div>
        </section>

        <FaqBlock entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Keep the roster. Drop the channel tax.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Flat plans based on successful posts, a confirmed result for
                every account, and a clear next step when something fails.
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
