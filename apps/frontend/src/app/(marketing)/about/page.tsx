import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'About Publishly — reliable social posting at scale',
  description:
    'Why Publishly exists: every social post should end with proof or a clear next step, with flat pricing for multi-brand and multi-client teams.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <section className="mk-section">
          <div className="mk-container">
            <header className="mk-reveal" style={{ marginBottom: 48 }}>
              <span
                className="mk-eyebrow"
                style={{ display: 'block', marginBottom: 20 }}
              >
                About
              </span>
              <h1 className="mk-h2">Every post should end with an answer.</h1>
              <p className="mk-section-lede">
                {MARKETING.brand} helps multi-brand, multi-client, and
                multi-location teams know what went live, what failed, why it
                failed, and what happens next.
              </p>
            </header>

            <div className="mk-prose">
              <p>
                The product is deliberately narrow. Connect the accounts you are
                authorized to manage, write once &amp; tailor each caption per
                network, then schedule on a month, week, or day calendar. A
                server keeps working after the browser closes. When one network
                fails, the others stay published and only the failed delivery is
                considered for a safe retry.
              </p>
              <p>
                Analytics are snapshots of what each platform reports about your
                own accounts — nothing modeled, nothing invented.
              </p>
            </div>

            <h2
              style={{
                fontSize: '22px',
                letterSpacing: '-0.02em',
                margin: '56px 0 18px',
              }}
            >
              Commitments
            </h2>
            <div className="mk-rows" style={{ maxWidth: 760 }}>
              <div className="mk-row">
                <h3>Built in the open</h3>
                <p>
                  {MARKETING.brand} is based on Postiz &amp; distributed under
                  AGPL-3.0. Every user of this service can request the complete
                  corresponding source of the running version — the offer is
                  public on the <Link href="/source">source page</Link>.{' '}
                  {MARKETING.brand} is an independent brand &amp; does not imply
                  endorsement by Postiz or any connected social network.
                </p>
              </div>
              <div className="mk-row">
                <h3>How claims are made</h3>
                <p>
                  No fabricated customer totals, reviews, partnerships, or
                  unavailable metrics. A provider feature appears in the product
                  only when an implemented official API adapter supports it.
                </p>
              </div>
              <div className="mk-row">
                <h3>What it won&rsquo;t do</h3>
                <p>
                  No engagement bots, no artificial-growth schemes, no posting
                  without a schedule you created. Connections use each
                  platform&rsquo;s official APIs &amp; permission scopes —
                  nothing else.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
