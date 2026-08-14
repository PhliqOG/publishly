import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The terms governing access to and use of ${MARKETING.brand}.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  const legal = MARKETING.legal;
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
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
              <p>Effective {legal.effectiveDate}</p>
            </header>
            <div className="mk-prose">
              <h2>1. Agreement and operator</h2>
              <p>
                These Terms are an agreement between you and {legal.entity},{' '}
                {legal.address} (&quot;{MARKETING.brand}&quot;, &quot;we&quot;,
                or &quot;us&quot;). By creating an account, using the API, or
                accepting an invitation, you agree to these Terms, our{' '}
                <Link href="/privacy">Privacy Policy</Link>, and our{' '}
                <Link href="/acceptable-use">Acceptable Use Policy</Link>.
                If you act for an organization, you confirm that you can bind it.
              </p>

              <h2>2. Service and eligibility</h2>
              <p>
                {MARKETING.brand} provides social-account connection,
                composition, scheduling, publishing, delivery-receipt,
                observability, analytics, webhook, and automation tools. You
                must be legally able to enter this agreement and must provide
                accurate account and billing information. You are responsible
                for users, API clients, and automations operating under your
                workspace.
              </p>

              <h2>3. Connected accounts and authority</h2>
              <p>
                You may connect only accounts, Pages, profiles, channels, and
                brands you own or are authorized to manage. You authorize us to
                use the credentials and platform permissions you grant solely to
                perform your requested actions. Third-party platform terms,
                policies, quotas, app-review limits, and content rules also
                apply. A platform may reject, delay, limit, remove, or relabel
                content independently of Publishly.
              </p>

              <h2>4. Your content</h2>
              <p>
                You retain ownership of your content. You grant us a limited,
                worldwide, non-exclusive license to host, process, reproduce,
                adapt for technical formatting, transmit, and display content
                only as necessary to provide, secure, and support the service.
                You represent that you have all rights and disclosures needed
                for the content, media, music, brands, claims, and audiences you
                select.
              </p>

              <h2>5. Acceptable use</h2>
              <p>
                You may not use Publishly for unlawful content, spam, deceptive
                or artificial engagement, impersonation, credential theft,
                platform-policy evasion, account farms, unauthorized automated
                access, security testing without permission, malware, or
                infringement. Multi-account features are for legitimate
                multi-client, multi-brand, multi-location, creator-team, and
                multi-market operations.
              </p>

              <h2>6. Plans, usage, and billing</h2>
              <p>
                Current prices and allowances appear on the{' '}
                <Link href="/pricing">pricing page</Link> and at checkout. Paid
                plans are flat-price and include unlimited connected accounts;
                Free includes up to five. Monthly posting usage is counted only
                when a destination reaches independently confirmed_live status.
                Failed, cancelled, retrying, and unconfirmed attempts do not use
                posting quota.
              </p>
              <p>
                Stripe processes payments. Subscriptions renew for the selected
                monthly or annual term until cancelled. Taxes may apply. Unless
                law requires otherwise, fees already paid are non-refundable.
                Cancellation takes effect at the end of the paid term; usage
                above a plan limit requires waiting for reset or changing plan.
              </p>

              <h2>7. Reliability, retries, and platform risk</h2>
              <p>
                Publishly records delivery stages and classified failures and
                applies safe retries where the outcome is known to be
                recoverable. A sent request is not represented as successful
                until independent confirmation. When the outcome of a platform
                mutation cannot be proven, we may stop automatic retries to
                avoid a duplicate and ask you to verify the destination.
              </p>
              <p>
                We work to keep the service available, but do not guarantee
                uninterrupted operation or that a third-party platform will
                accept every post. Any contractual service level applies only
                when included in your order or a separate written SLA.
              </p>

              <h2>8. Security and account responsibility</h2>
              <p>
                Keep login credentials, API keys, webhook secrets, and devices
                secure; use least privilege; promptly revoke access no longer
                needed; and notify us of suspected compromise. You are
                responsible for actions performed with valid workspace
                credentials unless caused by our breach of these Terms.
              </p>

              <h2>9. Suspension and termination</h2>
              <p>
                You may cancel or delete your workspace at any time. We may
                limit or suspend access for material breach, security risk,
                non-payment, unlawful activity, platform-policy violations, or
                risk to other users, and will provide notice when reasonably
                possible. On termination, your access ends and data is handled
                under the Privacy Policy and data-deletion process. Posts
                already live on a third-party platform remain under your
                control there.
              </p>

              <h2>10. Intellectual property and open source</h2>
              <p>
                We and our licensors retain rights in the service, branding,
                documentation, and non-user content. Publishly includes
                AGPL-3.0 open-source software; the corresponding source for the
                running service is available through the{' '}
                <Link href="/source">source page</Link>. Open-source components
                remain governed by their licenses.
              </p>

              <h2>11. Disclaimers and limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, the service is provided
                &quot;as is&quot; and &quot;as available&quot; without implied
                warranties of merchantability, fitness for a particular
                purpose, or non-infringement. We are not responsible for
                third-party platform changes, suspensions, content decisions,
                or outages.
              </p>
              <p>
                To the maximum extent permitted by law, neither party is liable
                for indirect, incidental, special, consequential, exemplary, or
                punitive damages, or lost profits, revenues, goodwill, or data.
                Our aggregate liability arising from the service will not
                exceed the amount you paid us during the twelve months before
                the event giving rise to the claim. These limits do not apply
                where law prohibits them.
              </p>

              <h2>12. Governing law, changes, and contact</h2>
              <p>
                These Terms are governed by the laws of {legal.governingLaw},
                without regard to conflict-of-law rules. We may update these
                Terms and will provide appropriate notice before a material
                change takes effect. Continued use after the effective date
                means you accept the updated Terms.
              </p>
              <p>
                Questions may be sent to{' '}
                {MARKETING.supportEmail ? (
                  <a href={`mailto:${MARKETING.supportEmail}`}>
                    {MARKETING.supportEmail}
                  </a>
                ) : (
                  <Link href="/contact">our contact page</Link>
                )}
                .
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
