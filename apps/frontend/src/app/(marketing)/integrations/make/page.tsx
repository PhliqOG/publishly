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
  title: 'Make.com social media posting API',
  description:
    'Post to social from Make with clear delivery receipts, failure reasons, safe retries, and account-health alerts from Publishly.',
  alternates: { canonical: '/integrations/make' },
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
    title: 'Create the Publishly app in Make',
    body: 'The app currently installs from integrations/make-publishly in this repository through Make’s developer area. A public Make catalog listing is not claimed yet.',
  },
  {
    title: 'Give it only the access it needs',
    body: 'Add your Publishly address and API key. Limit the key to posting, reading receipts, checking account health, or receiving alerts based on what this scenario does.',
  },
  {
    title: 'Choose what the scenario should do',
    body: 'Publish now, schedule for later, get a delivery receipt, or check which brand, client, or location accounts need attention.',
  },
  {
    title: 'Add Watch Events for alerts',
    body: 'Watch Events securely connects the scenario to delivery, failure, and connection alerts. Delete it and Publishly removes that connection.',
  },
  {
    title: 'Reject fake or stale alerts',
    body: 'Before a scenario starts, Watch Events verifies that the alert came from Publishly and was sent recently. API errors appear as errors, never as an empty success.',
  },
  {
    title: 'Act on the real result',
    body: 'Treat confirmed live as success. Send failed posts to the right person using the reason Publishly provides, and use the event ID so one alert never causes the same action twice.',
  },
];

export default function MakeIntegrationPage() {
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
                Integrations · Make
              </span>
              <h1 className="mk-h2">
                Post to social from Make — with receipts.
              </h1>
              <p className="mk-section-lede">
                Publish, schedule, check account health, and react to delivery
                alerts from the Make scenarios your team already uses.
              </p>
            </header>
            <QuickAnswer>
              Create the Publishly app from this repository, add an API key, and
              choose whether the scenario posts content, checks receipts,
              watches account health, or reacts to alerts. A public Make catalog
              listing is not claimed yet.
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
              The Make actions send this same request. You can also use the API
              directly in Make’s HTTP module.
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
              The dedicated webhook performs this check before emitting a
              bundle. At the wire level, events carry an X-Publishly-Event
              header and an X-Publishly-Signature header in the form{' '}
              <code>t=&lt;unix-timestamp&gt;,v1=&lt;hex&gt;</code>. Recompute
              and compare, in a downstream module that can run the hash:
            </p>
            <CodeBlock title="verify HMAC (pseudocode)">
              {`const header = webhook.headers['x-publishly-signature']; // t=...,v1=...
const [t, v1] = header.split(',').map((p) => p.split('=')[1]);

const expected = hmacSha256(YOUR_SIGNING_SECRET, \`\${t}.\${rawBody}\`);

if (expected !== v1) throw new Error('Bad signature');
// Optionally: reject if t is older than a few minutes.`}
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
              . Component and release-status details live in the repository’s
              distribution guide; no public Make catalog listing is implied.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
