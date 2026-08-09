import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <>
      <MarketingNav />
      <section className="mk-section">
        <div className="mk-container">
          <h1 className="mk-h2">Pricing</h1>
          <p className="mk-section-lede">
            Every paid plan starts with a 7-day trial and can be cancelled from
            the billing portal at any time. The number you are choosing is
            connected channels — everything else scales sensibly with it.
          </p>
          <PricingCards />
          <p className="mk-free-line">
            The free plan lets you explore the composer and calendar without a
            card. Prices exclude VAT/sales tax where applicable.
          </p>
        </div>
      </section>
      <MarketingFooter />
    </>
  );
}
