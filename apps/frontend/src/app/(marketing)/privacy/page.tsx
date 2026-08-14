import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${MARKETING.brand} collects, uses, protects, and deletes account and connected-platform data.`,
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
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
                Legal / Privacy
              </span>
              <h1 className="mk-h2">Privacy Policy</h1>
              <p>Effective {legal.effectiveDate}</p>
            </header>
            <div className="mk-prose">
              <h2>1. Who controls your data</h2>
              <p>
                {legal.entity}, {legal.address} (&quot;{MARKETING.brand}
                &quot;, &quot;we&quot;, or &quot;us&quot;) operates the service.
                This policy covers our website, API, dashboard, automation
                integrations, and connected social-platform features.
              </p>

              <h2>2. Information we collect</h2>
              <ul>
                <li>
                  Account and workspace data, including your name, email,
                  memberships, roles, invitations, account groups, and tags.
                </li>
                <li>
                  Content and instructions you provide, including drafts,
                  captions, schedules, media, platform settings, webhook URLs,
                  and support messages.
                </li>
                <li>
                  Connected-platform data you authorize us to access, such as
                  profile or Page identifiers, display names, avatars,
                  authorization tokens, posting capabilities, posts, comments,
                  and account or post analytics supported by that platform.
                </li>
                <li>
                  Reliability and security data, including delivery receipts,
                  classified errors, retry attempts, connection health, audit
                  events, IP address, device/browser information, and service
                  logs.
                </li>
                <li>
                  Subscription and transaction status from Stripe. We do not
                  store complete payment-card numbers.
                </li>
              </ul>

              <h2>3. How we use information</h2>
              <p>We use this information only as needed to:</p>
              <ul>
                <li>
                  authenticate users and provide the workspace, publishing,
                  scheduling, analytics, receipt, webhook, and health features
                  they request;
                </li>
                <li>
                  send content to a selected platform, independently confirm
                  delivery, classify failures, retry safe failures, and warn
                  about expiring or unhealthy connections;
                </li>
                <li>
                  secure, troubleshoot, monitor, and improve the service;
                </li>
                <li>
                  administer subscriptions, enforce usage limits, answer
                  support requests, and comply with law.
                </li>
              </ul>
              <p>
                We do not sell personal information. We do not use connected
                social-platform data for advertising, data-broker profiles, or
                training general-purpose artificial intelligence models.
                Optional AI features process only the prompts and content a
                user deliberately submits to that feature.
              </p>

              <h2>4. Google and YouTube user data</h2>
              <p>
                When you connect YouTube, Publishly requests the minimum Google
                scopes shown on our <Link href="/platform-review">platform review page</Link>{' '}
                to identify your channel, upload a video you schedule, confirm
                that video through an independent read, and show your YouTube
                Analytics. Publishly&apos;s use and transfer to any other app of
                information received from Google APIs will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <p>
                We do not transfer Google user data to advertising platforms,
                use it to determine creditworthiness, allow humans to read it
                except with your affirmative support consent or when necessary
                for security/legal compliance, or use it to train generalized
                AI models.
              </p>

              <h2>5. When information is shared</h2>
              <ul>
                <li>
                  With the social platform you chose, to perform the action you
                  requested.
                </li>
                <li>
                  With infrastructure, storage, email, monitoring, support,
                  payment, and optional AI subprocessors under contracts that
                  limit processing to providing their service to us.
                </li>
                <li>
                  With workspace members according to their role and your
                  workspace configuration.
                </li>
                <li>
                  When required by law, to protect users or the service, or as
                  part of a business transaction with notice and appropriate
                  safeguards.
                </li>
              </ul>
              <p>
                We do not give a connected platform&apos;s data to another
                platform unless you explicitly choose that destination and the
                transfer is necessary to publish your content there.
              </p>

              <h2>6. Security</h2>
              <p>
                Provider tokens and per-user app credentials are encrypted
                with authenticated AES-256-GCM before database storage. API
                keys are scope-limited, revocable, shown once, and stored as
                hashes. We also apply tenant isolation, audit logging, bounded
                retries, SSRF controls, and least-privilege provider scopes.
                No internet service can promise absolute security; report a
                suspected issue to {legal.privacyEmail || MARKETING.supportEmail}.
              </p>

              <h2>7. Retention, revocation, and deletion</h2>
              <p>
                We retain workspace content and delivery history while your
                workspace remains active or as needed to provide the service,
                resolve disputes, enforce agreements, and satisfy legal
                obligations. Disconnecting a channel attempts provider-side
                revocation where the platform supports it and removes stored
                authorization credentials and provider-derived connection data.
                Deleting a workspace starts removal of its content and
                connections. Encrypted backups age out through the normal
                backup lifecycle and are not restored except for disaster
                recovery.
              </p>
              <p>
                Google/YouTube authorized data is removed as soon as it is no
                longer necessary and, after revocation or a valid deletion
                request, no later than seven days unless retention is required
                for security or law. Posts already published on a third-party
                platform remain there until you delete them on that platform.
                See the <Link href="/data-deletion">data-deletion instructions</Link>.
              </p>

              <h2>8. Your controls and rights</h2>
              <p>
                You can disconnect individual accounts, revoke API keys, export
                workspace data, or request workspace deletion in the product.
                You can also revoke access directly in a platform&apos;s settings,
                including{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Account third-party access
                </a>
                . Depending on where you live, you may have rights to access,
                correct, delete, restrict, object to, or receive a portable copy
                of personal data. We verify requests before acting on them.
              </p>

              <h2>9. Cookies, children, and international processing</h2>
              <p>
                We use essential cookies for sessions, security, preferences,
                and checkout, plus configured privacy-conscious service
                analytics. Publishly is a business service not directed to
                children under 13, and we do not knowingly collect their data.
                Data may be processed where we and our subprocessors operate;
                we use legally required transfer safeguards where applicable.
              </p>

              <h2>10. Changes and contact</h2>
              <p>
                We will update the effective date and provide appropriate notice
                before material changes take effect. Privacy and deletion
                questions may be sent to{' '}
                {legal.privacyEmail ? (
                  <a href={`mailto:${legal.privacyEmail}`}>{legal.privacyEmail}</a>
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
