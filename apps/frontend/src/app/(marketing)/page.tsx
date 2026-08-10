import type { Metadata } from 'next';
import Link from 'next/link';
import { CSSProperties } from 'react';
import { MarketingFooter } from '@gitroom/frontend/components/marketing/chrome';
import { MegaNav } from '@gitroom/frontend/components/marketing/mega-nav';
import { HalftoneHeroBackground } from '@gitroom/frontend/components/marketing/halftone';
import { PlatformIcon } from '@gitroom/frontend/components/marketing/icons';
import { ConnectionDiagram } from '@gitroom/frontend/components/marketing/diagram';
import { ApiTerminal } from '@gitroom/frontend/components/marketing/terminal';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import {
  Byline,
  FactLine,
  FaqBlock,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import { POST_FAILURE_CATALOG } from '@gitroom/nestjs-libraries/reliability/post.failure';

// The home page tells one story in order: what breaks (pains) → what Publishly
// does instead (answers) → the journey a post actually takes → where the
// product is going (labeled in development) → price → questions.
// Every claim maps to data/public-product-facts.json. Multi-account language is
// multi-brand / multi-client / multi-location, never bot/farm/autopilot framing.

// Counted from the catalog the publisher imports, so the number can't drift.
const FAILURE_CODES = Object.keys(POST_FAILURE_CATALOG).length;

const INTEGRATIONS: Array<{ label: string; href: string; sub: string }> = [
  { label: 'REST API', href: '/api-docs', sub: 'scoped keys, /public/v1' },
  { label: 'MCP', href: '/integrations/mcp', sub: 'for AI assistants' },
  { label: 'n8n', href: '/integrations/n8n', sub: 'HTTP + webhook recipe' },
  { label: 'Make', href: '/integrations/make', sub: 'HTTP + webhook recipe' },
  { label: 'Webhooks', href: '/api-docs', sub: 'signed, retried, ledgered' },
];

const FAQ = [
  {
    q: 'How do I know when a scheduled post fails?',
    a: `The moment a delivery fails, its receipt flips to RETRYING or FAILED with a plain-English reason and one of ${FAILURE_CODES} documented failure codes, and a signed post.failure webhook fires to your endpoint carrying the class, the code and whether Publishly will retry. You can also poll GET /public/v1/posts/:id/status for any post at any time. You never have to go looking for a red icon — the failure comes to you.`,
  },
  {
    q: 'Is there a posting API that doesn’t charge per account?',
    a: 'Publishly is priced by how much you publish, not by how many accounts you connect. Paid plans start at $29/mo and every one of them includes unlimited connected social accounts; the free plan covers 5 accounts and 50 posts a month. Running 40 client accounts and running 400 costs the same.',
  },
  {
    q: 'How do I post to 100 accounts through one API?',
    a: 'Connect each account once through its platform’s official OAuth flow, then POST to /public/v1/posts with the destinations you want. One call can carry many destinations, and each destination is tracked as its own delivery with its own receipt, state history and live URL — so a failure on one never hides the other 99.',
  },
  {
    q: 'Why do scheduled Instagram posts fail silently?',
    a: 'Usually the access token died — tokens on the major platforms expire in roughly 60 days, and most schedulers keep marking posts “scheduled” while the connection behind them is dead. Publishly refreshes tokens automatically on schedule, and the moment a refresh fails you get an in-app alert and an email while the account is flagged and pulled out of delivery. The queue stops cleanly instead of posting into nothing.',
  },
  {
    q: 'Can Publishly detect a disconnected social account?',
    a: 'Yes. Scheduled token refreshes and delivery attempts both surface dead connections: a revoked or disconnected account is flagged, excluded from delivery and raised with a reconnect alert. The rest of your calendar keeps publishing while you reconnect the one that broke.',
  },
];

const STATEMENT = MARKETING.copyBank.client;

/* ---------------------------------------------------------------- styles */

const PAIN_NUM: CSSProperties = {
  display: 'block',
  color: 'var(--mk-blue)',
  marginBottom: 7,
};

const COLUMN: CSSProperties = { maxWidth: 720, margin: '0 auto' };

const MONO_NOTE: CSSProperties = {
  margin: '26px 0 0',
  color: 'var(--mk-text-3)',
};

/* ---------------------------------------------------------------- meta */

export const metadata: Metadata = {
  title: {
    absolute:
      'Publishly — Social media posting API with unlimited accounts | Nothing fails silently',
  },
  description:
    'Publishly is a social media posting API and scheduler for teams running many brands, clients and locations. Every post gets a delivery receipt, every failure gets a reason and a signed webhook, and every paid plan includes unlimited connected accounts from $29/mo.',
};

/* ---------------------------------------------------------------- page */

export default function MarketingHome() {
  return (
    <>
      <MegaNav />
      <main id="mk-main">
        {/* ---- 1 · hero + the post lifecycle, live ---- */}
        <header className="mk-hero mk-hero-c">
          <div className="mk-hero-bleed">
            <div className="mk-hero-panel">
              <HalftoneHeroBackground />
              <div className="mk-hero-panel-content">
                <h1 className="mk-h1" data-hero-el>
                  {MARKETING.tagline}
                </h1>
                <p className="mk-hero-sub" data-hero-el>
                  {MARKETING.sub}
                </p>
                <div className="mk-hero-ctas" data-hero-el>
                  <Link
                    href={MARKETING.authRegister}
                    className="mk-btn mk-btn-primary"
                  >
                    {MARKETING.cta.primary}
                  </Link>
                  <Link href="#journey" className="mk-btn mk-btn-ghost">
                    {MARKETING.cta.secondary}
                  </Link>
                </div>
                <p className="mk-hero-note" data-hero-el>
                  No credit card needed. 7-day trial on every plan.
                </p>
              </div>
            </div>
          </div>
          <div className="mk-container">
            <div className="mk-shot" data-hero-el>
              <div className="mk-dark">
                <ApiTerminal />
              </div>
              <p
                className="mk-mono"
                style={{ margin: '16px 0 0', color: 'var(--mk-text-3)' }}
              >
                One endpoint, two outcomes — both of them tell you
              </p>
            </div>
          </div>
        </header>

        {/* ---- 2 · what Publishly is, in one sentence ---- */}
        <section className="mk-section" aria-labelledby="home-what">
          <div className="mk-container">
            <span className="mk-eyebrow">What this is</span>
            <h2 id="home-what" className="mk-h2" style={{ marginTop: 14 }}>
              {MARKETING.copyBank.fleet}
            </h2>
            <p className="mk-section-lede" style={{ maxWidth: '62ch' }}>
              {MARKETING.entity}
            </p>
            <QuickAnswer>
              Publishly is a social media posting API and scheduler for
              operators running 20 to 500+ accounts across brands, clients and
              locations. Every destination gets its own delivery receipt with a
              state history and a live URL, every failure carries one of{' '}
              {FAILURE_CODES} documented codes and fires a signed post.failure
              webhook, and transient failures retry without any risk of
              double-posting. Paid plans start at $29/mo with unlimited
              connected accounts.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </section>

        <section className="mk-netrow" aria-label="Supported networks">
          <div className="mk-container">
            <p className="mk-netrow-note">
              Publishes through official APIs only
            </p>
            <div className="mk-netrow-items">
              {MARKETING.networks.map((n) => (
                <span key={n} className="mk-netrow-item">
                  <PlatformIcon name={n} />
                  {n}
                </span>
              ))}
              <span className="mk-netrow-item">+ 24 more</span>
            </div>
          </div>
        </section>

        {/* ---- 3 · the pain narrative ---- */}
        <section className="mk-section" aria-labelledby="home-pain">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">What actually breaks</span>
                <h2 id="home-pain" className="mk-h2" style={{ marginTop: 14 }}>
                  You didn&rsquo;t find out. Your client did.
                </h2>
                <p className="mk-section-lede">
                  This is the sequence every operator running a couple hundred
                  accounts already knows by heart. It doesn&rsquo;t start with
                  a crash &mdash; it starts with silence.
                </p>
              </div>
              <div className="mk-rows">
                {MARKETING.pains.map((pain, index) => (
                  <div className="mk-row" key={pain.title}>
                    <h3>
                      <span className="mk-mono" style={PAIN_NUM}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {pain.title}
                    </h3>
                    <p>{pain.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mk-quiet" style={{ textAlign: 'left' }}>
          <div className="mk-container">
            <p className="mk-statement">
              {STATEMENT.split(' ').map((word, index) => (
                <span className="mk-w" key={index}>
                  {word}{' '}
                </span>
              ))}
            </p>
          </div>
        </section>

        {/* ---- 4 · the answer ---- */}
        <section className="mk-section" id="answers" aria-labelledby="home-answer">
          <div className="mk-container">
            <div style={COLUMN}>
              <span className="mk-eyebrow">The answer</span>
              <h2 id="home-answer" className="mk-h2" style={{ marginTop: 14 }}>
                {MARKETING.copyBank.receipt}
              </h2>
            </div>
            <div className="mk-benefits">
              {MARKETING.answers.map((answer, index) => (
                <div
                  className="mk-benefit mk-reveal"
                  key={answer.title}
                  data-delay={index * 50}
                >
                  <span className="mk-benefit-num">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{answer.title}</h3>
                    <p>{answer.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...COLUMN, marginTop: 8 }}>
              <FactLine>
                Publishly&rsquo;s paid plans start at $29/mo with unlimited
                connected accounts &mdash; pricing is sized by how much you
                post, never by how many accounts you run.
              </FactLine>
              <FactLine>
                Every Publishly post failure carries one of {FAILURE_CODES}{' '}
                documented failure codes in three classes &mdash; recoverable,
                needs-your-action, or a content problem &mdash; and fires a
                signed post.failure webhook the moment it happens.
              </FactLine>
              <FactLine>
                Transient failures retry automatically with backoff from 15
                seconds to 30 minutes, but the publish call itself fires exactly
                once &mdash; a retry can never duplicate a post.
              </FactLine>
              <p style={{ marginTop: 26 }}>
                <Link href="/reliability" className="mk-arrow">
                  The full reliability model
                </Link>
              </p>
            </div>
          </div>
        </section>

        {/* ---- 5 · the journey a post takes ---- */}
        <section
          className="mk-section mk-section-tint"
          id="journey"
          aria-labelledby="home-journey"
        >
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">The journey</span>
                <h2 id="home-journey" className="mk-h2" style={{ marginTop: 14 }}>
                  {MARKETING.copyBank.watch}
                </h2>
                <p className="mk-section-lede">
                  One calendar holds every brand you run. Each post is routed to
                  that brand&rsquo;s own accounts and delivered through each
                  platform&rsquo;s official API &mdash; one workspace per
                  client, never a shared pool.
                </p>
                <p className="mk-section-lede">
                  Every destination hands back its own receipt: the state, the
                  live URL, and a webhook to your systems. Then the numbers come
                  home &mdash; views, saves and shares land against the exact
                  post that earned them.
                </p>
                <p className="mk-section-lede">
                  That measured result is what closes the loop back to the
                  calendar. The receipt half ships today; the caption learning
                  half is in development.
                </p>
                <p style={{ marginTop: 26 }}>
                  <Link href="/publishing" className="mk-arrow">
                    How delivery works
                  </Link>
                </p>
              </div>
              <ConnectionDiagram />
            </div>
          </div>
        </section>

        {/* ---- 6 · the learning loop — direction, not shipped UI ---- */}
        <section className="mk-section" aria-labelledby="home-learning">
          <div className="mk-container">
            <span className="mk-eyebrow">Roadmap</span>
            <h2 id="home-learning" className="mk-h2" style={{ marginTop: 14 }}>
              Where Publishly is going &mdash; in development now
            </h2>
            <p className="mk-section-lede">
              None of this is shipped. It&rsquo;s the direction the product is
              being built toward, described here so you can judge it before it
              exists &mdash; not sold to you as a screenshot.
            </p>
            <div className="mk-duo">
              {MARKETING.learning.map((item) => (
                <div className="mk-duo-cell" key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              ))}
            </div>
            <p className="mk-mono" style={MONO_NOTE}>
              In development · not available today · no dates promised
            </p>
          </div>
        </section>

        {/* ---- 7 · pricing teaser ---- */}
        <section className="mk-section mk-section-tint mk-center" id="pricing">
          <div className="mk-container">
            <div className="mk-reveal">
              <h2 className="mk-h2">{MARKETING.copyBank.tax}</h2>
              <p className="mk-section-lede">
                Four plans, one variable that matters: how much you publish.
                Every paid plan includes unlimited connected social accounts, so
                winning the next 50 accounts doesn&rsquo;t change your bill.
              </p>
            </div>
            <PricingCards compact />
            <p className="mk-free-line">
              {MARKETING.copyBank.same} Full detail on the{' '}
              <Link href="/pricing" style={{ textDecoration: 'underline' }}>
                pricing page
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ---- 8 · driven by your own stack ---- */}
        <section className="mk-section" aria-labelledby="home-integrations">
          <div className="mk-container">
            <span className="mk-eyebrow">Integrations</span>
            <h2
              id="home-integrations"
              className="mk-h2"
              style={{ marginTop: 14 }}
            >
              Everything the app does, your scripts can do.
            </h2>
            <p className="mk-section-lede">
              Scoped keys, one posting endpoint, signed delivery events. No
              first-party n8n node or Make module exists yet &mdash; the recipes
              use the same REST surface and say so.
            </p>
            <div
              style={{
                marginTop: 34,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '14px 40px',
                borderTop: '1px solid var(--mk-line)',
                paddingTop: 24,
              }}
            >
              {INTEGRATIONS.map((item) => (
                <Link key={item.label} href={item.href} className="mk-mono">
                  {item.label}{' '}
                  <span style={{ color: 'var(--mk-text-3)' }}>{item.sub}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ---- 9 · FAQ ---- */}
        <FaqBlock title="Questions operators ask" entries={FAQ} />

        {/* ---- 10 · close ---- */}
        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Stop finding out from your clients.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Connect an account, schedule a post &amp; read its receipt. No
                credit card needed. 7-day trial on every plan.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/reliability" className="mk-btn mk-btn-ghost">
                  See how it fails safely
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
