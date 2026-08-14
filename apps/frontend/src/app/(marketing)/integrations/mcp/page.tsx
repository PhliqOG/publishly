import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  FaqBlock,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'Social media MCP server',
  description:
    'Let an approved AI assistant publish and schedule through Publishly, then check delivery receipts and account health with controlled access.',
  alternates: { canonical: '/integrations/mcp' },
};

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Choose how the assistant signs in',
    body: 'Use the guided OAuth connection or an API key. Give the assistant read-only access, posting access, or both — and revoke it whenever you want.',
  },
  {
    title: 'Point your assistant at the Publishly MCP endpoint',
    body: 'Add the Publishly connection shown in the API docs. Keys stay out of the web address and logs.',
  },
  {
    title: 'Ask for what you want, in plain language',
    body: 'Ask it to publish now, schedule for later, check a post’s receipt, or find the brand, client, or location accounts that need attention. Publishly still checks ownership, platform rules, and plan limits.',
  },
  {
    title: 'Keep proof for every post',
    body: 'Every scheduled post still gets a delivery receipt and a failure reason. Letting an assistant help never removes the checks.',
  },
];

export default function McpIntegrationPage() {
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
                Integrations · MCP
              </span>
              <h1 className="mk-h2">
                Let an approved AI assistant schedule posts safely.
              </h1>
              <p className="mk-section-lede">
                Publishly includes the connection an AI assistant needs to
                publish, schedule, check receipts, and find accounts that need
                attention — with access you control.
              </p>
            </header>
            <QuickAnswer>
              Publishly includes a built-in MCP (Model Context Protocol) server
              — it starts with the app, with no extra plugin to install. A
              compatible assistant can publish, schedule, read delivery
              receipts, and check account health. Every action stays inside the
              workspace and permissions you approved.
            </QuickAnswer>
            <Byline published="2026-08-10" />

            <div className="mk-prose" style={{ marginTop: 48 }}>
              <h2>What MCP is</h2>
              <p>
                MCP is a common way for an AI assistant to use approved tools in
                another product. In Publishly, it means the assistant can
                schedule or check a post without pretending to be a person
                clicking through the site.
              </p>

              <h2>What you can do with it</h2>
              <p>
                Drive publishing from wherever you already work with an
                assistant: publish now, schedule a checked post, ask what
                happened to it, or find disconnected accounts. Every action
                stays inside the approved workspace and leaves the same proof as
                work done in the dashboard.
              </p>

              <h2>How to set it up</h2>
            </div>

            <div className="mk-benefits" style={{ margin: '8px 0 0' }}>
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

            <p
              style={{
                marginTop: 36,
                color: 'var(--mk-text-2)',
                fontSize: 15,
                maxWidth: '62ch',
              }}
            >
              Endpoint paths and connection specifics live in the{' '}
              <Link
                href="/api-docs"
                style={{
                  color: 'var(--mk-blue)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                API docs
              </Link>{' '}
              — they’re versioned with the backend, so this page stays honest by
              not duplicating them.
            </p>
          </div>
        </section>

        <FaqBlock
          entries={[
            {
              q: 'Is the MCP server an add-on or a separate product?',
              a: 'Neither. The MCP server starts with the Publishly backend itself. If you run Publishly, you have it.',
            },
            {
              q: 'Which assistants can connect?',
              a: 'Any client that speaks the Model Context Protocol. Publishly implements the server side of the open standard and doesn’t gate specific assistants.',
            },
            {
              q: 'Can an assistant post something my workspace hasn’t authorized?',
              a: 'No. MCP access is authorized per workspace, scoped per tool, and revocable. A read-only key cannot call publish_post or schedule_post, and cross-workspace resource IDs are rejected.',
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </>
  );
}
