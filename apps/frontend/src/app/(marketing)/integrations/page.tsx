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
  title: 'Social media API integrations for n8n, Make and MCP',
  description:
    'Connect Publishly to your product, n8n, Make, or an approved AI assistant. Every option returns clear posting results and failure alerts.',
  alternates: { canonical: '/integrations' },
};

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

// Every card links to a real, implementation-backed integration surface.
const CARDS: Array<{
  num: string;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}> = [
  {
    num: 'REST API',
    title: 'Add posting to your product',
    body: 'Create and schedule posts, upload media, connect accounts, and read the result of every delivery.',
    href: '/api-docs',
    linkLabel: 'API docs',
  },
  {
    num: 'MCP',
    title: 'Let an approved assistant help',
    body: 'The built-in MCP server lets a compatible AI assistant schedule posts and check results with only the permissions you approve.',
    href: '/integrations/mcp',
    linkLabel: 'Set up MCP',
  },
  {
    num: 'Webhooks',
    title: 'Send results to your own software',
    body: 'Your software gets an immediate, verified alert when a post advances, goes live, or fails — including the reason and retry decision.',
    href: '/api-docs',
    linkLabel: 'Webhook reference',
  },
  {
    num: 'n8n',
    title: 'Build visual workflows in n8n',
    body: 'Publish, schedule, check account health, and start a workflow when a verified delivery alert arrives.',
    href: '/integrations/n8n',
    linkLabel: 'n8n node',
  },
  {
    num: 'Make',
    title: 'Build scenarios in Make',
    body: 'Use ready-made actions for posting, scheduling, receipts, and account health, plus a trigger for verified alerts.',
    href: '/integrations/make',
    linkLabel: 'Make app',
  },
];

export default function IntegrationsPage() {
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
                Integrations
              </span>
              <h1 className="mk-h2">
                Connect Publishly to the tools you already use.
              </h1>
              <p className="mk-section-lede">
                Build posting into your own product, use a visual workflow, or
                let an approved assistant help. Every route ends with the same
                clear result: live, retrying, or needs your attention.
              </p>
            </header>
            <QuickAnswer>
              Publishly integrates through four surfaces: a public REST API with
              keys you can limit and revoke, a built-in MCP server for AI
              assistants, verified delivery alerts, and n8n and Make packages.
              The n8n and Make packages currently install from this codebase; no
              public marketplace listing is claimed yet.
            </QuickAnswer>
            <Byline published="2026-08-10" />

            <div className="mk-cards" style={{ marginTop: 56 }}>
              {CARDS.map((card) => (
                <div className="mk-card" key={card.title}>
                  <span className="mk-card-num">{card.num}</span>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                  <p style={{ marginTop: 14 }}>
                    <Link href={card.href} className="mk-arrow">
                      {card.linkLabel}
                    </Link>
                  </p>
                </div>
              ))}
            </div>

            <section style={{ marginTop: 82 }} aria-labelledby="receipt-curl">
              <span className="mk-eyebrow">Copy-paste proof</span>
              <h2 id="receipt-curl" className="mk-h2" style={{ marginTop: 14 }}>
                Ask for the receipt. Get the result.
              </h2>
              <p className="mk-section-lede">
                After creating a post, replace <code>POST_ID</code> below with
                the ID returned by Publishly. The response shows each delivery
                step and the final live link when the platform confirms it.
              </p>
              <CodeBlock title="curl — get a delivery receipt">
                {`curl https://your-publishly-host/public/v1/posts/POST_ID/receipts \\
  -H 'Authorization: YOUR_API_KEY'

# response (trimmed to the delivery fields)
{
  "postId": "POST_ID",
  "latestStage": "confirmed_live",
  "receipts": [{
    "provider": "linkedin",
    "stage": "confirmed_live",
    "attempt": 1,
    "providerUrl": "https://www.linkedin.com/feed/update/urn:li:share:742…",
    "confirmationMethod": "linkedin_post_read"
  }]
}`}
              </CodeBlock>
              <p style={{ marginTop: 22 }}>
                <Link href="/for-developers" className="mk-arrow">
                  See the complete create-and-check example
                </Link>
              </p>
            </section>

            <p
              style={{
                marginTop: 44,
                color: 'var(--mk-text-3)',
                fontSize: 14,
                maxWidth: '62ch',
              }}
            >
              Everything on this page maps to working code in this repository.
              The API reference remains the source of truth for exact request
              fields and event names.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
