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
    'A social media posting API for developers: REST /public/v1, scoped revocable keys, a per-post status endpoint, signed post.published / post.failure webhooks with HMAC verification, an MCP server, and a free tier with real API access.',
  keywords: [
    'social media posting api for developers',
    'social media api free tier',
    'posting api webhooks',
  ],
};

// Facts map to data/public-product-facts.json (api.*, reliability.*) — the
// same file the rest of the marketing site draws API claims from. Endpoint
// paths mirror the ones already published on /api-docs; do not add a path
// here that isn't listed there too.

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

const API_BASICS = [
  {
    h: 'One base path',
    p: 'Every call goes through REST /public/v1 — the same surface the dashboard itself calls internally, not a stripped-down subset.',
  },
  {
    h: 'Scoped, revocable keys',
    p: 'API keys are hashed at rest and shown once at creation. Scope a key to only what an integration needs, and revoke it independently at any time.',
  },
  {
    h: 'A status endpoint per post',
    p: 'GET /public/v1/posts/:id/status returns the publishing job’s current state — you don’t have to guess whether something landed.',
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
    a: 'Yes. POST /public/v1/posts accepts a future publish time — the post moves through SCHEDULED → QUEUED → PROCESSING and on to PUBLISHED, the same pipeline the dashboard’s composer uses.',
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
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '20ch' }}>
              The posting API your SaaS embeds.
            </h1>
            <p className="mk-section-lede">
              A REST API, scoped keys, a per-post status endpoint, and signed
              webhooks for what actually happened — built so you can embed
              social publishing into your own product without building the
              reliability layer yourself.
            </p>
            <QuickAnswer>
              Publishly’s public API is REST at /public/v1, authenticated with
              scoped, revocable keys. Create a post with POST
              /public/v1/posts, poll GET /public/v1/posts/:id/status, or
              subscribe to signed post.published and post.failure webhooks.
              An MCP server ships with the backend, and the Free plan includes
              real API access — 50 posts/month across 5 accounts.
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
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
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
              The surface, in three facts.
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

        <section className="mk-section mk-section-tint" aria-labelledby="dev-curl">
          <div className="mk-container">
            <h2 id="dev-curl" className="mk-h2">
              Create a post, then check on it.
            </h2>
            <p className="mk-section-lede">
              Two calls: schedule, then poll. Both are exactly what the
              HTTP Request node in the n8n recipe sends.
            </p>
            <CodeBlock title="curl — schedule a post">
              {`curl -X POST https://your-publishly-host/public/v1/posts \\
  -H 'Authorization: YOUR_API_KEY' \\
  -H 'Content-Type: application/json' \\
  -d '{ "content": "Launch day.", "when": "2026-08-14T18:00" }'`}
            </CodeBlock>
            <CodeBlock title="curl — poll delivery status">
              {`curl https://your-publishly-host/public/v1/posts/<post-id>/status \\
  -H 'Authorization: YOUR_API_KEY'

# response (one destination shown):
{
  "state": "PUBLISHED",
  "providerPostId": "17962233445566778",
  "providerUrl": "https://www.instagram.com/p/Cx1a2b3C4d5/",
  "attempts": 1
}`}
            </CodeBlock>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="dev-webhooks">
          <div className="mk-container">
            <h2 id="dev-webhooks" className="mk-h2">
              Signed webhooks, not polling.
            </h2>
            <p className="mk-section-lede">
              Register an endpoint and Publishly pushes post.published the
              moment a post lands, and post.failure the moment one dies —
              with a reason, a class, and whether it will retry.
            </p>
            <FactLine>
              Every webhook is signed with HMAC-SHA256, retried on delivery
              failure, and tracked in a delivery-attempt ledger — so a missed
              event isn’t a silent one.
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

        <section className="mk-section mk-section-tint" aria-labelledby="dev-automation">
          <div className="mk-container">
            <h2 id="dev-automation" className="mk-h2">
              MCP, n8n, Make — the same API underneath.
            </h2>
            <p className="mk-section-lede">
              Publishly ships a built-in MCP server for AI assistants, and the
              same REST API plus webhooks power n8n and Make today. Neither
              automation tool has a first-party Publishly node yet — this page
              says so plainly, and the recipes below don’t need one.
            </p>
            <div className="mk-cards">
              <div className="mk-card">
                <span className="mk-card-num">MCP</span>
                <h3>Built-in MCP server</h3>
                <p>
                  Ships with the backend — no plugin to install. An
                  MCP-capable assistant can schedule and manage posts under
                  your API key’s scopes.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link href="/integrations/mcp" className="mk-arrow">
                    Set up MCP
                  </Link>
                </p>
              </div>
              <div className="mk-card">
                <span className="mk-card-num">n8n</span>
                <h3>REST + webhooks recipe</h3>
                <p>
                  No first-party node yet. An HTTP Request node schedules
                  posts; a Webhook node receives signed delivery events.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link href="/integrations/n8n" className="mk-arrow">
                    n8n recipe
                  </Link>
                </p>
              </div>
              <div className="mk-card">
                <span className="mk-card-num">Make</span>
                <h3>REST + webhooks recipe</h3>
                <p>
                  Same honest story: no first-party module yet. An HTTP
                  module plus a custom webhook cover the same ground.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link href="/integrations/make" className="mk-arrow">
                    Make recipe
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
