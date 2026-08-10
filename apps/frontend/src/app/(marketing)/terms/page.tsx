import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  return (
    <>
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-container">
            <header style={{ marginBottom: 36 }}>
              <span
                className="mk-eyebrow"
                style={{ display: 'block', marginBottom: 20 }}
              >
                Legal / Terms
              </span>
              <h1 className="mk-h2">Terms of Service</h1>
            </header>
            <div className="mk-prose">
              <p className="mk-draft">
                Draft template — the operator must have counsel review and
                complete this document (jurisdiction, company identity, dates)
                before public launch.
              </p>
              <h2>1. The service</h2>
              <p>
                {MARKETING.brand} provides tools for scheduling and publishing
                content to third-party social networks that you connect through
                their official authorization flows. The service publishes only
                what you create and schedule.
              </p>
              <h2>2. Your accounts and content</h2>
              <p>
                You retain all rights to the content you publish. You are
                responsible for complying with each connected platform&apos;s
                terms and for the contents of what you schedule. We may suspend
                workspaces that use the service for spam, deception, or
                unlawful content.
              </p>
              <h2>3. Acceptable use</h2>
              <p>
                No unlawful content, no spam or artificial engagement schemes,
                no attempts to access other workspaces&apos; data, and no
                resale of the service without agreement.
              </p>
              <h2>4. Billing</h2>
              <p>
                Paid plans are billed through Stripe on a monthly or yearly
                cycle and include a trial period as shown at checkout. You can
                cancel any time from the billing portal; access continues to
                the end of the paid period.
              </p>
              <h2>5. Availability and liability</h2>
              <p>
                The service is provided without warranty as described in its
                license (AGPL-3.0). Third-party platforms change and rate-limit
                their APIs; scheduled posts can be delayed or rejected by those
                platforms.
              </p>
              <h2>6. Termination and data</h2>
              <p>
                You may delete your workspace at any time; see the Privacy
                Policy for what deletion covers and how to export first.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
