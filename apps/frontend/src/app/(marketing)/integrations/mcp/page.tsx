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
    'Publishly ships a built-in MCP server, so any MCP-capable AI assistant can schedule and manage social posts through your Publishly workspace — authenticated with your own API key.',
};

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Create a scoped API key',
    body: 'In your Publishly settings, issue an API key with only the scopes your assistant needs — posts read/write is enough for scheduling. The key is shown once and hashed at rest.',
  },
  {
    title: 'Point your assistant at the Publishly MCP endpoint',
    body: 'Add Publishly as an MCP server in your assistant’s configuration, using your Publishly backend URL and the API key as the credential. The exact connection details for your deployment are in the API docs.',
  },
  {
    title: 'Ask for what you want, in plain language',
    body: '“Schedule this across the three retail brands for Thursday morning.” The assistant calls Publishly’s tools; Publishly validates, schedules, and reports back — same rules as the dashboard.',
  },
  {
    title: 'Let the receipts close the loop',
    body: 'Every scheduled post still gets a delivery receipt and a failure reason. Automation through MCP changes who types — not what gets verified.',
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
                A social media MCP server, built in.
              </h1>
              <p className="mk-section-lede">
                Publishly’s backend ships a Model Context Protocol server. Any
                MCP-capable AI assistant can drive your posting schedule —
                authenticated as you, limited by your key’s scopes.
              </p>
            </header>
            <QuickAnswer>
              Publishly includes a built-in MCP (Model Context Protocol)
              server — it starts with the backend, no plugin to install. Connect
              an MCP-capable assistant to your Publishly backend’s MCP endpoint
              with a scoped API key, and it can schedule, list and manage posts
              in your workspace through the same validated pipeline as the
              dashboard.
            </QuickAnswer>
            <Byline published="2026-08-10" />

            <div className="mk-prose" style={{ marginTop: 48 }}>
              <h2>What MCP is</h2>
              <p>
                The Model Context Protocol is an open standard that lets AI
                assistants call tools exposed by other software — the
                assistant discovers what a server can do and invokes it with
                structured, permissioned calls instead of screen-scraping or
                pasted API snippets. Publishly exposes its scheduling
                capabilities as one of those servers.
              </p>

              <h2>What you can do with it</h2>
              <p>
                Drive scheduling from wherever you already work with an
                assistant: draft a post in conversation and have it scheduled
                to the right channels, ask what’s queued this week, or
                reschedule a slot — without opening the dashboard. Every action
                goes through the same server-side validation, delivery
                tracking, and audit trail as a post created by hand. An
                assistant can’t do anything your API key wasn’t scoped to do.
              </p>

              <h2>Setup, honestly outlined</h2>
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
              — they’re versioned with the backend, so this page stays honest
              by not duplicating them.
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
              q: 'Can an assistant post something my key can’t?',
              a: 'No. MCP calls authenticate with your API key and inherit its scopes. Revoke the key and the assistant’s access ends with it.',
            },
          ]}
        />
      </main>
      <MarketingFooter />
    </>
  );
}
