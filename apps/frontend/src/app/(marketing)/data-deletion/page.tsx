import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import { DeletionStatusPanel } from './deletion-status';

// Server component on purpose: this is the data-deletion URL submitted to Meta
// app review, so the policy has to be in the initial HTML — readable without
// JavaScript, a session, or a ?code parameter. Only the confirmation-code
// lookup hydrates on the client.
export const metadata: Metadata = {
  title: 'Data deletion',
  description: `How to delete your ${MARKETING.brand} data and revoke connected-platform access, including Meta de-authorization requests.`,
  alternates: { canonical: '/data-deletion' },
};

export default function DataDeletionPage() {
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
                Privacy / Data deletion
              </span>
              <h1 className="mk-h2">Delete connected-platform data</h1>
            </header>
            <div className="mk-prose">
              <Suspense fallback={null}>
                <DeletionStatusPanel />
              </Suspense>

              <h2>Delete data from {MARKETING.brand}</h2>
              <ol>
                <li>Sign in and open Settings → Team &amp; workspace.</li>
                <li>Export your workspace first if you want a copy.</li>
                <li>
                  Disconnect an individual channel to destroy that channel’s
                  stored authorization, or use Delete workspace for the full
                  workspace deletion workflow.
                </li>
              </ol>
              <h2>Meta de-authorization</h2>
              <p>
                Removing {MARKETING.brand} from Facebook, Instagram, or Threads
                sends a signed deletion request to {MARKETING.brand}. Matching
                credentials, provider-derived analytics and inbox state are
                erased, pending destinations are cancelled, and Meta-linked
                identifiers are anonymized. Meta then shows you a confirmation
                link to this page.
              </p>
              <p>
                Need help with a deletion request?{' '}
                {MARKETING.supportEmail ? (
                  <>
                    Email{' '}
                    <a href={`mailto:${MARKETING.supportEmail}`}>
                      {MARKETING.supportEmail}
                    </a>
                    .
                  </>
                ) : (
                  <>
                    Reach us through the <Link href="/contact">contact page</Link>
                    .
                  </>
                )}
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
