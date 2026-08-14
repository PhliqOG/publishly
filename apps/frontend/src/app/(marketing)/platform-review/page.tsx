import type { Metadata } from 'next';
import Link from 'next/link';
import manifest from '../../../../../../data/provider-approval-manifest.json';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

type ProviderReview = {
  id: string;
  name: string;
  authModel: string;
  reviewPath: string;
  callback: string | null;
  additionalCallbacks?: string[];
  scopes: string[];
  additionalPermissionSets?: Array<{ label: string; scopes: string[] }>;
  appPermissions?: string[];
  permissionPurpose: string;
  reviewEvidence: string;
  limitations: string;
  officialDocs: string[];
};

export const metadata: Metadata = {
  title: 'Platform review information',
  description:
    'Public app-review information for Publishly: real use case, provider permissions, callbacks, limitations, legal links, and reviewer journey.',
  alternates: { canonical: '/platform-review' },
  robots: { index: true, follow: true },
};

export default function PlatformReviewPage() {
  const origin = MARKETING.siteUrl.replace(/\/$/, '');
  const providers = manifest.providers as ProviderReview[];
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
                Trust / Platform review
              </span>
              <h1 className="mk-h2">Platform review information</h1>
              <p className="mk-lede" style={{ maxWidth: 820 }}>
                This public page tells platform reviewers exactly what Publishly
                does, why each permission is requested, how to test it, and what
                remains limited before approval. Last reviewed{' '}
                {manifest.updated}.
              </p>
            </header>

            <div className="mk-prose">
              <h2>Real product and intended users</h2>
              <p>{manifest.publicDescription}</p>
              <p>
                Publishly is a user-directed publishing tool, not an account
                farm, artificial-engagement service, or internal upload utility.
                It acts only after a user connects an account they are
                authorized to manage and explicitly creates or schedules
                content.
              </p>

              <h2>Reviewer journey</h2>
              <ol>
                <li>
                  Open the public homepage,{' '}
                  <Link href="/privacy">Privacy Policy</Link>,{' '}
                  <Link href="/terms">Terms</Link>,{' '}
                  <Link href="/data-deletion">data-deletion instructions</Link>,
                  and <Link href="/status">live status page</Link> without
                  signing in.
                </li>
                <li>
                  Use credentials supplied only in the platform&apos;s protected
                  review form to sign in to the dedicated reviewer workspace.
                </li>
                <li>
                  Connect the reviewer-owned test account through the official
                  authorization screen and approve only the listed permissions.
                </li>
                <li>
                  Compose a small test post, inspect the platform-specific
                  preflight/preview, publish, and follow queued - uploading -
                  sent - confirmed_live (or a classified failure) in the receipt
                  view.
                </li>
                <li>
                  Exercise every requested read, analytics, comment, or
                  customer-initiated messaging capability, then disconnect the
                  account and verify revocation/deletion.
                </li>
              </ol>
              <p>
                Test credentials and private app identifiers are intentionally
                absent from this public page. They are shared only through the
                provider&apos;s secure reviewer field.
              </p>
            </div>

            <div style={{ display: 'grid', gap: 18, marginTop: 36 }}>
              {providers.map((provider) => (
                <article
                  id={provider.id}
                  key={provider.id}
                  style={{
                    border: '1px solid var(--mk-line)',
                    borderRadius: 18,
                    padding: 24,
                  }}
                >
                  <div className="mk-prose">
                    <h2 style={{ marginTop: 0 }}>{provider.name}</h2>
                    <p>
                      <strong>Authentication:</strong> {provider.authModel}
                      <br />
                      <strong>Access path:</strong> {provider.reviewPath}
                      <br />
                      <strong>Callback:</strong>{' '}
                      {provider.callback
                        ? [
                            provider.callback,
                            ...(provider.additionalCallbacks || []),
                          ]
                            .map((callback) => `${origin}${callback}`)
                            .join(', ')
                        : 'No OAuth callback'}
                    </p>
                    <p>
                      <strong>Requested permissions:</strong>{' '}
                      {[...provider.scopes, ...(provider.appPermissions || [])]
                        .length
                        ? [
                            ...provider.scopes,
                            ...(provider.appPermissions || []),
                          ].map((scope, index) => (
                            <span key={scope}>
                              {index ? ', ' : ''}
                              <code>{scope}</code>
                            </span>
                          ))
                        : 'No operator-owned application permissions'}
                    </p>
                    {(provider.additionalPermissionSets || []).map(
                      (permissionSet) => (
                        <p key={permissionSet.label}>
                          <strong>{permissionSet.label} permissions:</strong>{' '}
                          {permissionSet.scopes.map((scope, index) => (
                            <span key={scope}>
                              {index ? ', ' : ''}
                              <code>{scope}</code>
                            </span>
                          ))}
                        </p>
                      )
                    )}
                    <p>
                      <strong>Why:</strong> {provider.permissionPurpose}
                    </p>
                    <p>
                      <strong>Evidence path:</strong> {provider.reviewEvidence}
                    </p>
                    <p>
                      <strong>Current limitation:</strong>{' '}
                      {provider.limitations}
                    </p>
                    <p>
                      <strong>Official references:</strong>{' '}
                      {provider.officialDocs.map((url, index) => (
                        <span key={url}>
                          {index ? ' / ' : ''}
                          <a href={url} target="_blank" rel="noreferrer">
                            reference {index + 1}
                          </a>
                        </span>
                      ))}
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mk-prose" style={{ marginTop: 36 }}>
              <h2>Review and privacy contact</h2>
              <p>
                Operator: {MARKETING.legal.entity}, {MARKETING.legal.address}.
                Questions can be sent to{' '}
                {MARKETING.supportEmail ? (
                  <a href={`mailto:${MARKETING.supportEmail}`}>
                    {MARKETING.supportEmail}
                  </a>
                ) : (
                  <Link href="/contact">the contact page</Link>
                )}
                . Approval is determined by each platform; this page does not
                claim a partnership, certification, or approval that has not
                been granted.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
