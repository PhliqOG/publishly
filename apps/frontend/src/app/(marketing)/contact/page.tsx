import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
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
                Contact
              </span>
              <h1 className="mk-h2">Write to the operator.</h1>
              <p className="mk-section-lede">
                Onboarding, platform permissions, billing, privacy &amp;
                account-export questions are handled by the operator support
                address configured for this deployment.
              </p>
            </header>

            {MARKETING.supportEmail ? (
              <div className="mk-band" style={{ maxWidth: 860 }}>
                <div>
                  <h2 style={{ fontSize: 'clamp(1.4rem, 2.4vw, 1.8rem)' }}>
                    Email support
                  </h2>
                  <p>
                    Name the workspace &amp; the affected network so the first
                    reply can resolve it.
                  </p>
                </div>
                <a
                  className="mk-btn mk-btn-primary"
                  href={`mailto:${MARKETING.supportEmail}`}
                >
                  Email {MARKETING.supportEmail}
                </a>
              </div>
            ) : (
              <p className="mk-draft" style={{ maxWidth: '70ch', margin: 0 }}>
                Operator action required: set NEXT_PUBLIC_SUPPORT_EMAIL before
                launch so this page exposes a working support channel.
              </p>
            )}

            <div className="mk-prose" style={{ marginTop: 40 }}>
              <h2>Security reports</h2>
              <p>
                Include a concise reproduction &amp; never place access tokens
                or customer data in email. Disclosure expectations are on the{' '}
                <Link href="/security">security page</Link>.
              </p>
              <h2>Data requests</h2>
              <p>
                Export &amp; erasure are described in the{' '}
                <Link href="/privacy">privacy policy</Link>. Accounts connected
                through Meta can also use the{' '}
                <Link href="/data-deletion">data-deletion flow</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
