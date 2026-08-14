import type { Metadata } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'n8n social media posting',
  description:
    'Post to social from n8n with clear delivery receipts, failure reasons, safe retries, and account-health alerts from Publishly.',
  alternates: { canonical: '/integrations/n8n' },
};

// Static code block in the site's terminal styling (mk-term, marketing.css).
function CodeBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mk-term" style={{ marginTop: 20 }}>
      <div className="mk-term-top">
        <span className="mk-term-dot" />
        <span className="mk-term-dot" />
        <span className="mk-term-dot" />
        <span className="mk-term-title">{title}</span>
      </div>
      <pre className="mk-term-body" style={{ margin: 0, minHeight: 0 }}>
        {children}
      </pre>
    </div>
  );
}

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Install the Publishly node',
    body: 'The node currently installs from integrations/n8n-nodes-publishly in this repository on self-hosted n8n. A public n8n catalog listing is not claimed yet.',
  },
  {
    title: 'Give it only the access it needs',
    body: 'Add your Publishly address and API key. Limit the key to posting, reading receipts, checking account health, or receiving alerts based on what this workflow does.',
  },
  {
    title: 'Choose what the workflow should do',
    body: 'Publish now, schedule for later, get a delivery receipt, or check which brand, client, or location accounts need attention.',
  },
  {
    title: 'Turn on delivery alerts',
    body: 'The Publishly Trigger securely connects the workflow to delivery, failure, and connection alerts. Turn the trigger off and Publishly removes that connection.',
  },
  {
    title: 'Reject fake or stale alerts',
    body: 'Before a workflow starts, the trigger verifies that the alert came from Publishly and was sent recently.',
  },
  {
    title: 'Act on the real result',
    body: 'Treat confirmed live as success. Send failed posts to the right person using the reason Publishly provides, and use the event ID so one alert never causes the same action twice.',
  },
];

export default function N8nIntegrationPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <section className="mk-section">
          <div className="mk-container">
            <header style={{ marginBottom: 12 }}>
              <span
                className="mk-eyebrow"
                style={{ display: 'block', marginBottom: 20 }}
              >
                Integrations · n8n
              </span>
              <h1 className="mk-h2">
                Post to social from n8n — with receipts.
              </h1>
              <p className="mk-section-lede">
                Publish, schedule, check account health, and react to delivery
                alerts from the visual workflows your team already uses.
              </p>
            </header>
            <QuickAnswer>
              Install the node from this repository on self-hosted n8n, add a
              Publishly API key, and choose whether the workflow posts content,
              checks receipts, watches account health, or reacts to alerts. A
              public n8n catalog listing is not claimed yet.
            </QuickAnswer>
            <Byline published="2026-08-10" />

            <div className="mk-benefits" style={{ marginTop: 40 }}>
              {STEPS.map((step, i) => (
                <div className="mk-benefit" key={step.title}>
                  <span className="mk-benefit-num">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <h2
              style={{
                fontSize: '22px',
                letterSpacing: '-0.02em',
                margin: '56px 0 6px',
              }}
            >
              Use the API directly if needed
            </h2>
            <p
              style={{
                color: 'var(--mk-text-2)',
                fontSize: 15,
                maxWidth: '62ch',
                margin: 0,
              }}
            >
              The node sends this same request. Use it directly when an n8n
              installation cannot load custom nodes.
            </p>
            <CodeBlock title="curl — schedule a post">
              {`curl -X POST https://your-publishly-host/public/v1/posts \\
  -H 'Authorization: YOUR_API_KEY' \\
  -H 'Idempotency-Key: campaign-location-2026-08-14' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "type": "schedule",
    "date": "2026-08-14T18:00:00.000Z",
    "shortLink": false,
    "tags": [],
    "posts": [{
      "integration": { "id": "connection-id" },
      "value": [{ "content": "Launch day.", "image": [] }],
      "settings": { "__type": "linkedin" }
    }]
  }'`}
            </CodeBlock>

            <h2
              style={{
                fontSize: '22px',
                letterSpacing: '-0.02em',
                margin: '56px 0 6px',
              }}
            >
              Verifying the webhook signature
            </h2>
            <p
              style={{
                color: 'var(--mk-text-2)',
                fontSize: 15,
                maxWidth: '62ch',
                margin: 0,
              }}
            >
              Publishly Trigger performs this check before emitting workflow
              data. At the wire level, events carry an X-Publishly-Event header
              and an X-Publishly-Signature header in the form{' '}
              <code>t=&lt;unix-timestamp&gt;,v1=&lt;hex&gt;</code>. Recompute
              and compare:
            </p>
            <CodeBlock title="n8n Code node — verify HMAC">
              {`const crypto = require('crypto');

const header = $request.headers['x-publishly-signature']; // t=...,v1=...
const parts = Object.fromEntries(
  header.split(',').map((p) => p.split('='))
);

const expected = crypto
  .createHmac('sha256', YOUR_SIGNING_SECRET)
  .update(parts.t + '.' + rawBody)
  .digest('hex');

if (expected !== parts.v1) throw new Error('Bad signature');
// Optionally: reject if parts.t is older than a few minutes.`}
            </CodeBlock>

            <p
              style={{
                marginTop: 36,
                color: 'var(--mk-text-2)',
                fontSize: 15,
                maxWidth: '62ch',
              }}
            >
              Full endpoint and payload reference:{' '}
              <Link
                href="/api-docs"
                style={{
                  color: 'var(--mk-blue)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                API docs
              </Link>
              . Package and release-status details live in the repository’s
              distribution guide; no npm or hosted catalog listing is implied.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
