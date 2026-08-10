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

      <section style={{ padding: '96px 0 88px' }}>
        <div className="mk-container">
          <div className="mk-reveal">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Security
            </span>
            <h1
              className="mk-h1"
              style={{
                fontSize: 'clamp(2.7rem, 5.6vw, 4.4rem)',
                marginTop: 20,
                maxWidth: '18ch',
              }}
            >
              A commitment, not a brochure.
            </h1>
            <p className="mk-section-lede">
              A scheduler holds the keys to your audience. Here is how those
              keys are handled — stated plainly.
            </p>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">01</span>
            <span className="mk-num-label">Commitments</span>
          </div>
          <div className="mk-cards mk-reveal" data-delay="120">
            {MARKETING.security.map((card, i) => (
              <div className="mk-card" key={card.title}>
                <div className="mk-card-num">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
            ))}
            <div className="mk-card">
              <div className="mk-card-num">05</div>
              <h3>Tenant isolation</h3>
              <p>
                Every workspace&apos;s data is scoped at the query layer and
                covered by automated cross-tenant access tests that run against
                the real API.
              </p>
            </div>
            <div className="mk-card">
              <div className="mk-card-num">06</div>
              <h3>Open source, auditable</h3>
              <p>
                The engine is AGPL-3.0. Anyone can read the code that touches
                their credentials — and every user of this service is entitled
                to the corresponding source.{' '}
                <Link href="/source" style={{ textDecoration: 'underline' }}>
                  Get the source.
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">02</span>
            <span className="mk-num-label">Disclosure</span>
          </div>
          <div className="mk-band mk-reveal">
            <div>
              <h2 style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)' }}>
                Found a vulnerability?
              </h2>
              <p>
                Write to us before disclosing publicly
                {MARKETING.supportEmail
                  ? `: ${MARKETING.supportEmail}`
                  : ' via the contact address in your account settings.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">03</span>
            <span className="mk-num-label">Start</span>
          </div>
          <div className="mk-band mk-reveal">
            <div>
              <h2 style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)' }}>
                Read the code, then start.
              </h2>
              <p>
                The engine is open source, and the source offer is public.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                {MARKETING.cta.primary}
              </Link>
              <Link href="/source" className="mk-btn mk-btn-ghost">
                {MARKETING.openSource.linkLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
