import type { Metadata } from 'next';
import Link from 'next/link';
import { ReactNode } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import {
  Byline,
  FactLine,
  FaqBlock,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'Social media posting API for developers',
  description:
    'A social media posting API for developers: REST /public/v1, scoped revocable keys, confirmed-live receipts, signed post.receipt / post.failure webhooks, MCP, n8n, Make, and a real free tier.',
  keywords: [
    'social media posting api for developers',
    'social media api free tier',
    'posting api webhooks',
  ],
  alternates: { canonical: '/for-developers' },
};

// Facts map to data/public-product-facts.json (api.*, reliability.*) — the
// same file the rest of the marketing site draws API claims from. Endpoint
// paths mirror the ones already published on /api-docs; do not add a path
// here that isn't listed there too.

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

const API_BASICS = [
  {
    h: 'One predictable API',
    p: 'Create posts, upload media, connect accounts, read results, and pull analytics through one versioned API.',
  },
  {
    h: 'Keys you can limit and turn off',
    p: 'Give each integration only the access it needs. You can revoke one key without interrupting everything else.',
  },
  {
    h: 'A result for every post',
    p: 'Ask for a post’s status or delivery receipts at any time. Your users never have to guess whether it landed.',
  },
];

const FAQ = [
  {
    q: 'Is there a free social media posting API?',
    a: 'Yes. Publishly’s Free plan includes real API access — not a locked demo — with 50 posts per month across 5 connected accounts, no credit card required.',
  },
  {
    q: 'How do I get notified when a post fails?',
    a: 'Register a webhook endpoint and Publishly fires a signed post.failure event the moment a post fails, carrying the failure class, code, a plain-English reason, and whether it will be retried. You don’t have to poll for it.',
  },
  {
    q: 'Does the API support scheduling?',
    a: 'Yes. POST /public/v1/posts accepts a future publish time. Each destination emits queued → uploading → sent → confirmed_live receipts, or a failed receipt with a classified reason. Sent is not success.',
  },
  {
    q: 'How do I verify webhook signatures?',
    a: 'Every webhook carries an X-Publishly-Signature header shaped t=<unix-timestamp>,v1=<hex>. Recompute an HMAC-SHA256 over `${timestamp}.${body}` with your signing secret and compare it to v1 — reject the request if they don’t match.',
  },
];

export default function ForDevelopersPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              For developers
            </span>
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '20ch' }}
            >
              Give your users social posting you can prove.
            </h1>
            <p className="mk-section-lede">
              Add posting to your product without also building delivery checks,
              retry rules, connection warnings, and failure alerts. Publishly
              handles those parts and gives your software the result.
            </p>
            <QuickAnswer>
              Publishly’s public API is REST at /public/v1, authenticated with
              scoped, revocable keys. Create a post with POST /public/v1/posts,
              poll GET /public/v1/posts/:id/status, or subscribe to signed
              post.receipt and post.failure webhooks. An MCP server ships with
              the backend, and the Free plan includes real API access — 50
              posts/month across 5 accounts.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
            <div
              style={{
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: 34,
              }}
            >
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                {MARKETING.cta.primary}
              </Link>
              <Link href="/api-docs" className="mk-arrow">
                Full API docs
              </Link>
            </div>
          </div>
        </header>

        <section className="mk-section" aria-labelledby="dev-basics">
          <div className="mk-container">
            <h2 id="dev-basics" className="mk-h2">
              What your product gets.
            </h2>
            <div className="mk-rows" style={{ marginTop: 32 }}>
              {API_BASICS.map((item) => (
                <div className="mk-row" key={item.h}>
                  <h3>{item.h}</h3>
                  <p>{item.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="dev-curl"
        >
          <div className="mk-container">
            <h2 id="dev-curl" className="mk-h2">
              Create a post, then get its receipt.
            </h2>
            <p className="mk-section-lede">
              Replace the API key and connection ID. These are the same calls
              used by the Publishly app and the n8n and Make integrations.
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
      "integration": { "id": "YOUR_CONNECTION_ID" },
      "value": [{ "content": "Launch day.", "image": [] }],
      "settings": { "__type": "linkedin" }
    }]
  }'`}
            </CodeBlock>
            <CodeBlock title="curl — get the delivery receipt">
              {`curl https://your-publishly-host/public/v1/posts/POST_ID/receipts \\
  -H 'Authorization: YOUR_API_KEY'

# response (trimmed to the delivery fields):
{
  "postId": "POST_ID",
  "latestStage": "confirmed_live",
  "receipts": [{
    "provider": "linkedin",
    "stage": "confirmed_live",
    "attempt": 1,
    "providerPostId": "urn:li:share:742…",
    "providerUrl": "https://www.linkedin.com/feed/update/urn:li:share:742…",
    "confirmationMethod": "linkedin_post_read"
  }]
}`}
            </CodeBlock>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="dev-webhooks">
          <div className="mk-container">
            <h2 id="dev-webhooks" className="mk-h2">
              Your app hears about failures immediately.
            </h2>
            <p className="mk-section-lede">
              Give Publishly a callback URL and it sends your app a delivery
              event as the post moves forward. A confirmed-live event means the
              platform check found the public post. A failure event includes the
              reason and whether another safe attempt is coming.
            </p>
            <FactLine>
              Every webhook is signed with HMAC-SHA256, retried on delivery
              failure, and recorded — so a missed alert is visible and can be
              investigated.
            </FactLine>
            <p
              style={{
                marginTop: 26,
                color: 'var(--mk-text-2)',
                fontSize: 15,
                maxWidth: '62ch',
              }}
            >
              Every event carries an X-Publishly-Signature header shaped{' '}
              <code>t=&lt;unix-timestamp&gt;,v1=&lt;hex&gt;</code>. Recompute
              and compare before you trust the payload:
            </p>
            <CodeBlock title="verify HMAC (pseudocode)">
              {`const [t, v1] = header
  .split(',')
  .reduce((acc, part) => {
    const [k, v] = part.split('=');
    return { ...acc, [k]: v };
  }, {});

const expected = hmacSha256(signingSecret, \`\${t}.\${rawBody}\`);

if (expected !== v1) throw new Error('Bad signature');
// Optionally: reject if t is older than a few minutes.`}
            </CodeBlock>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="dev-automation"
        >
          <div className="mk-container">
            <h2 id="dev-automation" className="mk-h2">
              Use code, n8n, Make, or an approved AI assistant.
            </h2>
            <p className="mk-section-lede">
              Every option uses the same delivery checks and retry rules. The
              n8n and Make packages currently install from this codebase; we do
              not claim public marketplace listings that are not live.
            </p>
            <div className="mk-cards">
              <div className="mk-card">
                <span className="mk-card-num">MCP</span>
                <h3>Built-in MCP server</h3>
                <p>
                  The server is built in. An approved assistant can publish,
                  schedule, read receipts, and check account health with only
                  the permissions you give it.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link href="/integrations/mcp" className="mk-arrow">
                    Set up MCP
                  </Link>
                </p>
              </div>
              <div className="mk-card">
                <span className="mk-card-num">n8n</span>
                <h3>Official node source</h3>
                <p>
                  Publish, schedule, read receipts, check account health, and
                  start a workflow when a verified alert arrives.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link href="/integrations/n8n" className="mk-arrow">
                    n8n node
                  </Link>
                </p>
              </div>
              <div className="mk-card">
                <span className="mk-card-num">Make</span>
                <h3>Official custom-app source</h3>
                <p>
                  Ready-made actions for posting, scheduling, receipts, and
                  account health, plus a trigger for verified alerts.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link href="/integrations/make" className="mk-arrow">
                    Make app
                  </Link>
                </p>
              </div>
            </div>
            <p style={{ marginTop: 28 }}>
              <Link href="/integrations" className="mk-arrow">
                All integrations
              </Link>
            </p>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              A free tier with a real API key.
            </h2>
            <p>
              The Free plan isn’t a locked demo — it includes API access: 50
              posts a month across 5 connected accounts, no credit card
              required. Build against the real endpoints before you pay for
              anything.
            </p>
          </div>
        </section>

        <FaqBlock title="Developer questions" entries={FAQ} />

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Get an API key in a minute.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Free plan includes API access. No credit card needed.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/api-docs" className="mk-btn mk-btn-ghost">
                  Full API docs
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
