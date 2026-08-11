'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type DeletionStatus = {
  confirmationCode: string;
  status: string;
  connectionsDeleted: number;
  requestedAt: string;
  completedAt: string | null;
};

// Only the confirmation-code lookup is client-side. The page around it renders
// on the server: Meta links users here to read the deletion policy, so the
// content must exist in the initial HTML with or without a ?code parameter.
export function DeletionStatusPanel() {
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

  if (!code) return null;

  return (
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
            Confirmation code: <code>{status.confirmationCode}</code>
          </p>
          <p>
            {status.connectionsDeleted} connected account
            {status.connectionsDeleted === 1 ? '' : 's'} removed.
          </p>
        </div>
      ) : (
        <p>
          This confirmation code was not found. Check the complete URL you
          received, or use the contact page below.
        </p>
      )}
    </>
  );
}
