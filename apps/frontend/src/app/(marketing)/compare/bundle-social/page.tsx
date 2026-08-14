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
  title: 'bundle.social alternative — Publishly vs bundle.social',
  description:
    'A factual social media API unlimited-accounts comparison: bundle.social jumps from free to $100; Publishly starts at $29 and charges only for confirmed-live posts. Checked 2026-08-11.',
  keywords: [
    'bundle.social alternative',
    'social media api unlimited accounts',
    'bundle social pricing',
  ],
  alternates: { canonical: '/compare/bundle-social' },
};

const CHECKED = '2026-08-11';

const ROWS: string[][] = [
  [
    'First paid plan',
    '$29 Starter · about 2,000 successful posts',
    '$100 Pro · 10,000 posts',
  ],
  ['Free plan', '50 successful posts · 5 accounts', '20 posts · 3 accounts'],
  [
    'Around 10,000 posts',
    '$99 Growth · up to 15,000',
    '$100 Pro · up to 10,000',
  ],
  ['100,000 posts', '$299 Scale', '$400 Business'],
  [
    'Connected accounts',
    'Unlimited on every paid plan',
    'Unlimited on every paid plan',
  ],
  [
    'What uses the allowance',
    'Only posts confirmed live; failed and unconfirmed work uses no quota',
    'Public pricing lists monthly posts; treatment of failed attempts is not stated',
  ],
  [
    'Failure alerts',
    'Clear reason, retry decision, signed event, and stored receipt',
    'Webhook page promises failed-post alerts and signature checking',
  ],
  [
    'Automatic retries',
    'Temporary problems retry safely without resending successful accounts',
    'No general safe-retry promise found on the public pages reviewed',
  ],
];

const FAQ = [
  {
    q: 'Does bundle.social include unlimited accounts?',
    a: 'Yes on paid plans. bundle.social Pro is $100 a month for 10,000 posts and unlimited accounts. Publishly also includes unlimited accounts on every paid plan, beginning at $29 a month.',
  },
  {
    q: 'What is the $100 entry cliff?',
    a: 'bundle.social has a useful free plan, then its first published paid tier is Pro at $100 a month. Publishly adds a $29 Starter tier for teams that need more than a free trial but are not yet publishing 10,000 times a month.',
  },
  {
    q: 'Does bundle.social report failed posts?',
    a: 'Yes. Its public webhook page says failed-post alerts can be sent to your own tools. Publishly’s difference is the full record around that alert: a named reason, whether it will retry, every attempt, and the final confirmed-live result in one receipt.',
  },
  {
    q: 'Which is cheaper at 100,000 posts?',
    a: 'At the published monthly prices checked on 2026-08-11, Publishly Scale is $299 for about 100,000 successful posts and bundle.social Business is $400 for 100,000 posts.',
  },
];

export default function CompareBundleSocialPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow">Compare</span>
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '18ch' }}
            >
              Publishly vs bundle.social
            </h1>
            <p className="mk-section-lede">
              Both products offer a social posting API and unlimited accounts on
              paid plans. The clearest differences are the jump from free to
              paid, the price at 100,000 posts, and what happens after a
              delivery problem.
            </p>
            <QuickAnswer>
              bundle.social goes from a 20-post free plan to a $100 Pro plan.
              Publishly goes from 50 posts free to $29 Starter, then $99 Growth
              and $299 Scale. Both allow unlimited accounts on paid plans;
              Publishly only counts posts it confirms as live.
            </QuickAnswer>
            <Byline published="2026-08-11" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="bs-cliff">
          <div className="mk-container">
            <h2 id="bs-cliff" className="mk-h2">
              The jump from free to paid.
            </h2>
            <p className="mk-section-lede">
              bundle.social&rsquo;s free tier is real. The next published step
              is $100 a month. Publishly puts a $29 plan between testing and
              10,000-post volume.
            </p>
            <FactLine>
              bundle.social Pro is $100 a month for 10,000 posts. Publishly
              Starter is $29 for about 2,000 successful posts, and Growth is $99
              for about 15,000.
            </FactLine>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="bs-table"
        >
          <div className="mk-container">
            <h2 id="bs-table" className="mk-h2">
              Side by side.
            </h2>
            <CompareTable
              caption="Publishly vs bundle.social pricing and reliability comparison"
              columns={['Feature', 'Publishly', 'bundle.social']}
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
                href="https://bundle.social/pricing"
                className="mk-arrow"
                target="_blank"
                rel="noreferrer"
              >
                bundle.social pricing source
              </a>
              <a
                href="https://bundle.social/social-media-webhooks-api"
                className="mk-arrow"
                target="_blank"
                rel="noreferrer"
              >
                bundle.social webhook source
              </a>
              <Link href="/methodology/api-comparisons" className="mk-arrow">
                How we compare
              </Link>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="bs-choose">
          <div className="mk-container">
            <h2 id="bs-choose" className="mk-h2">
              Which one fits?
            </h2>
            <div className="mk-duo">
              <div className="mk-duo-cell">
                <h3>Choose bundle.social if…</h3>
                <ul className="mk-points">
                  <li>
                    The $100 Pro package matches your volume from day one.
                  </li>
                  <li>
                    You want its mix of comments, imports, calendar, analytics,
                    and posting.
                  </li>
                  <li>
                    Its separate pay-per-use X pricing fits your posting mix.
                  </li>
                </ul>
              </div>
              <div className="mk-duo-cell">
                <h3>Choose Publishly if…</h3>
                <ul className="mk-points">
                  <li>You need a $29 step between free and high volume.</li>
                  <li>
                    You only want confirmed-live posts to use your monthly
                    allowance.
                  </li>
                  <li>
                    You want each failure tied to a reason, safe retry decision,
                    and final receipt.
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
              <h2 className="mk-h2">Start at $29, not $100.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Both products can tell you when a post fails. Publishly also
                keeps the reason, retry decision, attempts, and final result in
                one receipt.
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
