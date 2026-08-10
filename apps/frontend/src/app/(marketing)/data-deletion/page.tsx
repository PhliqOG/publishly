'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

type DeletionStatus = {
  confirmationCode: string;
  status: string;
  connectionsDeleted: number;
  requestedAt: string;
  completedAt: string | null;
};

function DataDeletionContent() {
  const code = useSearchParams().get('code') || '';
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(!!code);

  useEffect(() => {
    if (!code) return;
    const controller = new AbortController();
    const backend = (process.env.NEXT_PUBLIC_BACKEND_URL || '').replace(
      /\/$/,
      ''
    );
    fetch(
      `${backend}/public/meta/data-deletion/status?code=${encodeURIComponent(
        code
      )}`,
      { signal: controller.signal }
    )
      .then(async (response) =>
        response.ok ? (response.json() as Promise<DeletionStatus>) : null
      )
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [code]);

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
              {code ? (
                <>
                  <h2>Request status</h2>
                  {loading ? (
                    <p>Checking your deletion request…</p>
                  ) : status ? (
                    <div role="status">
                      <p>
                        Status: <strong>{status.status}</strong>
                      </p>
                      <p>
                        Confirmation code:{' '}
                        <code>{status.confirmationCode}</code>
                      </p>
                      <p>
                        {status.connectionsDeleted} connected account
                        {status.connectionsDeleted === 1 ? '' : 's'} removed.
                      </p>
                    </div>
                  ) : (
                    <p>
                      This confirmation code was not found. Check the complete
                      URL you received or contact support.
                    </p>
                  )}
                </>
              ) : null}

              <h2>Delete data from Publishly</h2>
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
                Removing Publishly from Facebook, Instagram, or Threads sends a
                signed deletion request to Publishly. Matching credentials,
                provider-derived analytics and inbox state are erased, pending
                destinations are cancelled, and Meta-linked identifiers are
                anonymized. Meta then shows you a confirmation link to this
                page.
              </p>
              <p>
                Need help? Contact{' '}
                {MARKETING.supportEmail ||
                  'the support address published by the operator'}
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

export default function DataDeletionPage() {
  return (
    <Suspense fallback={null}>
      <DataDeletionContent />
    </Suspense>
  );
}
