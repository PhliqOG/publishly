import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Four plans, one variable: how many channels you run. Every paid plan starts with a 7-day trial & no card is required to create an account.',
};

// Everything below the cards is true of every tier — the cards themselves
// render from the entitlement config the server enforces.

const EVERY_PLAN = [
  {
    h: 'Official APIs',
    p: 'Every connection uses the platform’s official OAuth flow & permission scopes — on every plan, at every price.',
  },
  {
    h: 'Durable publishing',
    p: 'Each post runs as a durable, duplicate-resistant workflow with honest per-network status. Reliability is not an upsell.',
  },
  {
    h: 'The full calendar',
    p: 'Month, week & day views with drag-and-drop rescheduling & timezone-aware slots.',
  },
  {
    h: 'Per-network captions',
    p: 'Write once & tailor the caption for each destination, with real limits checked before scheduling.',
  },
  {
    h: 'The source offer',
    p: 'The engine is AGPL-3.0 & the corresponding source of the running service is available to every user.',
  },
];

const FAQ = [
  {
    q: 'How does the trial work?',
    a: 'Every paid plan starts with a 7-day trial. No card is required to create an account & you can cancel from the billing portal at any time.',
  },
  {
    q: 'What counts as a channel?',
    a: 'One connected social profile — an Instagram account, a Facebook page, a YouTube channel. Ten networks are first-class, with 20+ more targets inherited from the open-source engine.',
  },
  {
    q: 'Is there a free tier?',
    a: 'You can create an account & explore the workspace without paying. Connecting a live channel requires a plan entitlement.',
  },
  {
    q: 'Do prices include tax?',
    a: 'Prices are shown excluding VAT & sales tax where applicable.',
  },
  {
    q: 'What happens to my data if I leave?',
    a: 'You own it. Export your workspace at any time; disconnecting a channel destroys its tokens immediately.',
  },
];

export default function PricingPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ display: 'block' }}>
                Pricing
              </span>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '14ch' }}
              >
                Four plans. One variable.
              </h1>
              <p className="mk-section-lede">
                The number you&rsquo;re choosing is connected channels —
                everything else scales with it. Every paid plan starts with a
                7-day trial & no card is required to create an account.
              </p>
            </div>
          </div>
        </header>

        <section className="mk-section" aria-label="Plans">
          <div className="mk-container">
            <div className="mk-reveal" data-delay="80">
              <PricingCards />
            </div>
            <p className="mk-free-line">
              Prices are in USD & exclude VAT or sales tax where applicable.
              These cards render from the same entitlement config the server
              enforces, so this page can&rsquo;t drift from what billing
              grants.
            </p>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="pr-floor"
        >
          <div className="mk-container">
            <div className="mk-split">
              <div>
                <h2 id="pr-floor" className="mk-h2">
                  In every plan.
                </h2>
                <p className="mk-section-lede">
                  The floor doesn&rsquo;t move between tiers.
                </p>
              </div>
              <div className="mk-rows">
                {EVERY_PLAN.map((item) => (
                  <div className="mk-row" key={item.h}>
                    <h3>{item.h}</h3>
                    <p>{item.p}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="pr-faq">
          <div className="mk-container">
            <h2 id="pr-faq" className="mk-h2">
              Fair questions.
            </h2>
            <div className="mk-faq" style={{ marginLeft: 0 }}>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Pick a channel count. Fill the week.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Seven days to watch the board clear itself — cancel from the
                billing portal if it doesn&rsquo;t.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/features" className="mk-btn mk-btn-ghost">
                  Compare features
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
