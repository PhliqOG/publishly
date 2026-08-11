import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'Integrations',
  description:
    'Connect Publishly to anything: a REST API with scoped keys, an MCP server for AI assistants, signed webhooks, and honest recipes for n8n and Make.',
  alternates: { canonical: '/integrations' },
};

// Every card links to a real integration surface. No first-party n8n node or
// Make module exists yet — those pages say so and document the REST recipe.
const CARDS: Array<{
  num: string;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}> = [
  {
    num: 'REST API',
    title: 'The public API',
    body: 'Everything the dashboard schedules, a scoped key can schedule. Create, list and delete posts, upload media, read per-post delivery status.',
    href: '/api-docs',
    linkLabel: 'API docs',
  },
  {
    num: 'MCP',
    title: 'MCP server',
    body: 'Publishly ships a Model Context Protocol server, so an MCP-capable AI assistant can drive your schedule directly — with your API key, under your scopes.',
    href: '/integrations/mcp',
    linkLabel: 'Set up MCP',
  },
  {
    num: 'Webhooks',
    title: 'Signed webhooks',
    body: 'post.published and post.failure events, signed with HMAC-SHA256, retried on failure, with a delivery-attempt ledger. Your systems learn the moment a post lands or dies.',
    href: '/api-docs',
    linkLabel: 'Webhook reference',
  },
  {
    num: 'n8n',
    title: 'n8n',
    body: 'No first-party node yet — and you don’t need one. An HTTP Request node schedules posts; a Webhook node receives signed delivery events. Full recipe inside.',
    href: '/integrations/n8n',
    linkLabel: 'n8n recipe',
  },
  {
    num: 'Make',
    title: 'Make',
    body: 'Same honest story: no first-party module yet. Make’s HTTP module plus a custom webhook cover scheduling and delivery events end to end.',
    href: '/integrations/make',
    linkLabel: 'Make recipe',
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
                One API surface. Every automation stack.
              </h1>
              <p className="mk-section-lede">
                Publishly is built to be driven by other software: a REST API
                with scoped keys, an MCP server for AI assistants, and signed
                webhooks that tell your systems what actually happened to every
                post.
              </p>
            </header>
            <QuickAnswer>
              Publishly integrates through four surfaces: a public REST API
              (scoped, revocable keys), a built-in MCP server for AI
              assistants, and signed post.published / post.failure webhooks.
              n8n and Make work today through those same surfaces — no
              first-party node exists yet, and the recipes below don’t need
              one.
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

            <p
              style={{
                marginTop: 44,
                color: 'var(--mk-text-3)',
                fontSize: 14,
                maxWidth: '62ch',
              }}
            >
              Everything on this page maps to shipped or in-tree surfaces —
              endpoints and event names match the running backend. If a recipe
              here ever drifts from the API, the API docs win.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
