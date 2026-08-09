import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Security' };

export default function SecurityPage() {
  return (
    <>
      <MarketingNav />
      <section className="mk-section">
        <div className="mk-container">
          <h1 className="mk-h2">Security</h1>
          <p className="mk-section-lede">
            A scheduler holds the keys to your audience. Here is how those keys
            are handled — stated plainly, because this page is a commitment,
            not a brochure.
          </p>
          <div className="mk-cards" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            {MARKETING.security.map((card) => (
              <div className="mk-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
            <div className="mk-card">
              <h3>Tenant isolation</h3>
              <p>
                Every workspace&apos;s data is scoped at the query layer and
                covered by automated cross-tenant access tests that run against
                the real API.
              </p>
            </div>
            <div className="mk-card">
              <h3>Open source, auditable</h3>
              <p>
                The engine is AGPL-3.0. Anyone can read the code that touches
                their credentials — and every user of this service is entitled
                to the corresponding source.{' '}
                <Link href="/source">Get the source.</Link>
              </p>
            </div>
          </div>
          <p className="mk-free-line">
            Found a vulnerability? Write to us before disclosing publicly
            {MARKETING.supportEmail
              ? `: ${MARKETING.supportEmail}`
              : ' via the contact address in your account settings.'}
          </p>
        </div>
      </section>
      <MarketingFooter />
    </>
  );
}
