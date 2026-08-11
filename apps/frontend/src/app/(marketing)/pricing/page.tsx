import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { GrowthTax } from '@gitroom/frontend/components/marketing/growth-tax';
import {
  Byline,
  FactLine,
  FaqBlock,
  LastChecked,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Publishly pricing — flat plans, unlimited social accounts',
  description:
    'A social media API with unlimited accounts on every paid plan: free, then $29 / $99 / $299 flat, sized by post volume. Ayrshare alternative pricing without the per-profile tax.',
  alternates: { canonical: '/pricing' },
};

// Publishly numbers come from pricing.ts via PricingCards; competitor numbers
// on this page come only from data/claim-provenance.json (verified 2026-08-10).

const MODELS = [
  {
    h: 'Per-profile',
    p: 'Every account you connect has a price on it. Ayrshare’s Business plan is $599/mo including 30 profiles, then $8.99/mo for each one after — the published math works out to $1,228.30/mo at 100 profiles. The model scales cleanly for the vendor, and against you.',
  },
  {
    h: 'Per-channel',
    p: 'Buffer’s Team plan is $10 per channel per month. Fair at 5 channels; at 100 it’s $1,000/mo for scheduling. Your software bill tracks your account count instead of your workload.',
  },
  {
    h: 'Flat, sized by posts',
    p: 'Publishly prices the work — how much you publish — and makes accounts free to add. $29, $99, or $299 flat, unlimited connected accounts on all three. Winning another brand or client changes your revenue, not your bill.',
  },
];

const FAQ = [
  {
    q: 'How much does it cost to post to 100 accounts?',
    a: 'On Publishly, the same as posting to 5: $29–$299/mo depending on how much you post, because every paid plan includes unlimited connected accounts. For comparison, Ayrshare’s published Business pricing works out to $1,228.30/mo at 100 profiles, and Buffer’s Team rate of $10/channel comes to $1,000/mo.',
  },
  {
    q: 'Is there a free social media posting API?',
    a: 'Yes. Publishly’s Free plan is $0 and includes API access — 50 posts a month across 5 connected accounts. Paid plans start at $29/mo with unlimited connected accounts.',
  },
  {
    q: 'Do failed posts count against my plan?',
    a: 'Honest answer: today your quota counts posts when they’re scheduled, so a failed post isn’t automatically credited back. A metering upgrade is in development. In the meantime, failures don’t die silently — each one carries a reason, and transient failures retry automatically without ever double-posting.',
  },
  {
    q: 'What happens if I exceed my monthly posts?',
    a: 'You move up a tier — there are no per-post overage fees. Starter’s 2,000 posts step up to Growth’s 15,000, and Growth steps up to Scale’s 100,000. Your account count never factors into it: connected accounts are unlimited on every paid plan.',
  },
  {
    q: 'Is there a yearly discount?',
    a: 'Yes. Yearly billing is 10× the monthly price — two months free. Starter is $290/yr, Growth is $990/yr, Scale is $2,990/yr.',
  },
];

const honestyStyle = {
  margin: '14px 0 0',
  fontSize: 15.5,
  lineHeight: 1.7,
  color: 'var(--mk-text-2)',
} as const;

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
                style={{ marginTop: 18, maxWidth: '18ch' }}
              >
                Stop paying a tax on your own growth.
              </h1>
              <p className="mk-section-lede">
                Plans are sized by how much you post. Connected accounts are
                unlimited on every paid plan &mdash; your 10th brand and your
                100th cost the same to run.
              </p>
              <QuickAnswer>
                Publishly pricing starts free and tops out at $299/mo. Every
                paid plan includes unlimited connected social accounts &mdash;
                plans are sized by how much you post, not how many accounts you
                run.
              </QuickAnswer>
            </div>
          </div>
        </header>

        <section
          className="mk-section"
          aria-label="Plans"
          style={{ paddingBottom: 48 }}
        >
          <div className="mk-container">
            <div className="mk-reveal" data-delay="80">
              <PricingCards />
            </div>
            <p className="mk-free-line">
              Prices in USD, excluding VAT or sales tax where applicable.
              Yearly billing is 10&times; monthly &mdash; two months free.
              These cards render from the same entitlement config the server
              enforces, so this page can&rsquo;t drift from what billing
              grants.
            </p>
          </div>
        </section>

        <section aria-label="Pricing facts" style={{ padding: '0 0 72px' }}>
          <div className="mk-container">
            <FactLine>
              Publishly&rsquo;s Starter plan is $29/mo for 2,000 posts and
              unlimited connected accounts.
            </FactLine>
            <FactLine>
              Publishly&rsquo;s Growth plan is $99/mo for 15,000 posts and
              unlimited connected accounts.
            </FactLine>
            <FactLine>
              Publishly&rsquo;s Scale plan is $299/mo for 100,000 posts and
              unlimited connected accounts.
            </FactLine>
            <FactLine>
              Publishly&rsquo;s Free plan is $0 for 50 posts a month across 5
              connected accounts, with API access included.
            </FactLine>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="pr-tax"
        >
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              The math
            </span>
            <h2 id="pr-tax" className="mk-h2" style={{ marginTop: 14 }}>
              The growth-tax calculator
            </h2>
            <p className="mk-section-lede">
              Slide to your account count. Competitor totals come from their
              published pricing pages &mdash; Publishly stays flat because
              plans are sized by post volume.
            </p>
            <div style={{ marginTop: 36 }}>
              <GrowthTax />
            </div>
            <LastChecked date="2026-08-10" />
          </div>
        </section>

        <section className="mk-section" aria-labelledby="pr-models">
          <div className="mk-container">
            <div className="mk-split">
              <div>
                <span className="mk-eyebrow" style={{ display: 'block' }}>
                  An honest note
                </span>
                <h2 id="pr-models" className="mk-h2" style={{ marginTop: 14 }}>
                  Three ways to price the same job.
                </h2>
                <p className="mk-section-lede">
                  None of these models is a scam &mdash; they just reward
                  different customers. Here&rsquo;s who each one actually fits.
                </p>
              </div>
              <div className="mk-rows">
                {MODELS.map((m) => (
                  <div className="mk-row" key={m.h}>
                    <h3>{m.h}</h3>
                    <p>{m.p}</p>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ maxWidth: '68ch', marginTop: 40 }}>
              <p style={honestyStyle}>
                <strong>Choose Ayrshare if</strong> you&rsquo;re buying
                enterprise API breadth &mdash; it&rsquo;s a deep, API-first
                platform &mdash; and per-profile pricing fits the number of
                profiles you actually run.
              </p>
              <p style={honestyStyle}>
                <strong>Choose Metricool if</strong> you want an all-in-one
                analytics suite and you&rsquo;ll stay under its 50-brand cap.
              </p>
              <p style={honestyStyle}>
                <strong>Choose Publishly if</strong> you&rsquo;re running a
                growing fleet of brands or clients and want your bill to stop
                tracking your account count.
              </p>
            </div>
          </div>
        </section>

        <FaqBlock title="Fair questions" entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Add the accounts. Keep the price.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Start free &mdash; 50 posts a month, 5 accounts, API included.
                Upgrade when the volume does.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  Start free
                </Link>
                <Link href="/features" className="mk-btn mk-btn-ghost">
                  Compare features
                </Link>
              </div>
            </div>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
