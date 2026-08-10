import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <>
      <MarketingNav />

      <section style={{ padding: '96px 0 88px' }}>
        <div className="mk-container">
          <div className="mk-reveal">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Pricing
            </span>
            <h1
              className="mk-h1"
              style={{
                fontSize: 'clamp(2.7rem, 5.6vw, 4.4rem)',
                marginTop: 20,
                maxWidth: '18ch',
              }}
            >
              Four plans, one variable.
            </h1>
            <p className="mk-section-lede">
              Every paid plan starts with a 7-day trial and can be cancelled
              from the billing portal at any time. The number you are choosing
              is connected channels — everything else scales sensibly with it.
            </p>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">01</span>
            <span className="mk-num-label">Timetable</span>
          </div>
          <div className="mk-reveal" data-delay="120">
            <PricingCards />
          </div>
          <p className="mk-free-line">
            You can create an account and explore the workspace before choosing
            a paid plan. Connecting a live channel requires an entitlement.
            Prices exclude VAT/sales tax where applicable.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">02</span>
            <span className="mk-num-label">Start</span>
          </div>
          <div className="mk-band mk-reveal">
            <div>
              <h2 style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)' }}>
                Start with the workspace.
              </h2>
              <p>Choose a plan when a channel is ready to go live.</p>
            </div>
            <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
              {MARKETING.cta.primary}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
