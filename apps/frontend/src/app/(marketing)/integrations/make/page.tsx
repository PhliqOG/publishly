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
    'Post to social media from Make.com with Publishly: an HTTP module schedules posts through the REST API, and a custom webhook module receives signed post.published and post.failure events. No first-party module required.',
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
    body: 'In Publishly settings, issue a scoped key with posts write access. It’s shown once — store it in a Make connection or a keychain, not hardcoded in the scenario.',
  },
  {
    title: 'Add an HTTP module',
    body: 'Use HTTP > Make a request. Method POST, URL https://<your-publishly-host>/public/v1/posts. Add a header named Authorization with your API key as the value, and set the body type to JSON.',
  },
  {
    title: 'Build the post body',
    body: 'Map your trigger data (a form, a spreadsheet row, an RSS item) into the JSON body: the content, the schedule time, and the channels to publish to. The API validates server-side and rejects bad input as a readable 400 — surface that error output in the scenario instead of swallowing it.',
  },
  {
    title: 'Add a custom webhook module for delivery events',
    body: 'Create a Make Webhooks > Custom webhook module, then register its URL as a webhook endpoint in Publishly. You’ll receive post.published when a post lands and post.failure when one dies — with the failure class, code, plain-English reason, and whether Publishly will retry.',
  },
  {
    title: 'Verify the signature before trusting the event',
    body: 'Every event is signed. Read the X-Publishly-Signature header (t=<timestamp>,v1=<hex>), compute HMAC-SHA256 over `${t}.${rawBody}` with your webhook signing secret in a downstream module, and compare it to v1. Reject mismatches and stale timestamps.',
  },
  {
    title: 'Route on what actually happened',
    body: 'Branch with a Router on the event type: log receipts to your reporting sheet on post.published, page a human or open a ticket on post.failure where willRetry is false. That’s the whole point — your scenario reacts to delivery truth, not to “scheduled”.',
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
              <h1 className="mk-h2">Post to social from Make — with receipts.</h1>
              <p className="mk-section-lede">
                There’s no first-party Publishly module in Make yet, and this
                recipe doesn’t need one: two standard modules cover scheduling
                and delivery events end to end.
              </p>
            </header>
            <QuickAnswer>
              To post to social media from Make.com with Publishly, use an
              HTTP module to POST to /public/v1/posts with your API key in
              the Authorization header, and a custom Webhooks module to
              receive signed post.published and post.failure events. Publishly
              has no first-party Make module yet — the standard modules are
              the supported path, and they carry the full delivery-receipt
              model.
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
              Whatever the HTTP module sends is exactly this call — test it
              from a terminal first, then wire the module.
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
              . If a first-party Make module ships, this page will say so —
              until then, this recipe is the honest, supported answer.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
