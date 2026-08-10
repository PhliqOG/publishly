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
    'Post to social media from n8n with Publishly: an HTTP Request node schedules posts through the REST API, and a Webhook node receives signed post.published and post.failure events. No custom node required.',
};

// Static code block in the site's terminal styling (mk-term, marketing.css).
function CodeBlock({ title, children }: { title: string; children: ReactNode }) {
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
    title: 'Create a Publishly API key',
    body: 'In Publishly settings, issue a scoped key with posts write access. It’s shown once — store it in an n8n credential, not in the workflow JSON.',
  },
  {
    title: 'Add an HTTP Request node',
    body: 'Method POST, URL https://<your-publishly-host>/public/v1/posts. Add a header named Authorization with your API key as the value, and set the body type to JSON.',
  },
  {
    title: 'Build the post body',
    body: 'Map your trigger data (a form, a sheet row, an RSS item) into the JSON body: the content, the schedule time, and the channels to publish to. The API validates server-side and rejects bad input as a readable 400 — surface that error output in n8n instead of swallowing it.',
  },
  {
    title: 'Add a Webhook node for delivery events',
    body: 'Create an n8n Webhook node (POST), then register its URL as a webhook endpoint in Publishly. You’ll receive post.published when a post lands and post.failure when one dies — with the failure class, code, plain-English reason, and whether Publishly will retry.',
  },
  {
    title: 'Verify the signature before trusting the event',
    body: 'Every event is signed. In a Code node, read the X-Publishly-Signature header (t=<timestamp>,v1=<hex>), compute HMAC-SHA256 over `${t}.${rawBody}` with your webhook signing secret, and compare it to v1. Reject mismatches and stale timestamps.',
  },
  {
    title: 'Route on what actually happened',
    body: 'Branch on the event type: log receipts to your reporting sheet on post.published, page a human or open a ticket on post.failure where willRetry is false. That’s the whole point — your automation reacts to delivery truth, not to “scheduled”.',
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
              <h1 className="mk-h2">Post to social from n8n — with receipts.</h1>
              <p className="mk-section-lede">
                There’s no first-party Publishly node in n8n yet, and this
                recipe doesn’t need one: two standard nodes cover scheduling
                and delivery events end to end.
              </p>
            </header>
            <QuickAnswer>
              To post to social media from n8n with Publishly, use an HTTP
              Request node to POST to /public/v1/posts with your API key in
              the Authorization header, and a Webhook node to receive signed
              post.published and post.failure events. Publishly has no
              first-party n8n node yet — the standard nodes are the supported
              path, and they carry the full delivery-receipt model.
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
              The curl equivalent
            </h2>
            <p
              style={{
                color: 'var(--mk-text-2)',
                fontSize: 15,
                maxWidth: '62ch',
                margin: 0,
              }}
            >
              Whatever the HTTP Request node sends is exactly this call — test
              it from a terminal first, then wire the node.
            </p>
            <CodeBlock title="curl — schedule a post">
              {`curl -X POST https://your-publishly-host/public/v1/posts \\
  -H 'Authorization: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{ "content": "Launch day.", "when": "2026-08-14T18:00" }'`}
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
              Events arrive with an X-Publishly-Event header naming the event
              type and an X-Publishly-Signature header in the form{' '}
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
              . If a first-party n8n node ships, this page will say so — until
              then, this recipe is the honest, supported answer.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
