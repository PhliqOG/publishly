import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingFooter } from '@gitroom/frontend/components/marketing/chrome';
import { MegaNav } from '@gitroom/frontend/components/marketing/mega-nav';
import { HalftoneHeroBackground } from '@gitroom/frontend/components/marketing/halftone';
import { PlatformIcon } from '@gitroom/frontend/components/marketing/icons';
import { ApiTerminal } from '@gitroom/frontend/components/marketing/terminal';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { LiveProofBar } from '@gitroom/frontend/components/marketing/live-proof-bar';
import { AccountHealthPreview } from '@gitroom/frontend/components/marketing/account-health-preview';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import {
  Byline,
  FactLine,
  FaqBlock,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import { POST_FAILURE_CATALOG } from '@gitroom/nestjs-libraries/reliability/post.failure';

const FAILURE_CODES = Object.keys(POST_FAILURE_CATALOG).length;

const AUDIENCES = [
  {
    href: '/for-agencies',
    title: 'Agencies',
    body: 'See the broken client connection before the client sees a missed post.',
  },
  {
    href: '/for-multi-brand',
    title: 'Multi-brand and multi-location teams',
    body: 'Keep every brand separate while seeing the health of the whole operation.',
  },
  {
    href: '/for-creator-networks',
    title: 'Media and creator networks',
    body: 'Keep every show, newsletter, and channel on schedule without watching each one by hand.',
  },
  {
    href: '/for-developers',
    title: 'Software teams',
    body: 'Add dependable social posting to your product without hiding delivery problems from your users.',
  },
];

const INTEGRATIONS = [
  {
    label: 'REST API',
    href: '/api-docs',
    sub: 'Build posting into your product',
  },
  { label: 'n8n', href: '/integrations/n8n', sub: 'Connect visual workflows' },
  { label: 'Make', href: '/integrations/make', sub: 'Connect Make scenarios' },
  {
    label: 'MCP',
    href: '/integrations/mcp',
    sub: 'Let approved assistants post',
  },
];

const FAQ = [
  {
    q: 'How do I know when a scheduled post fails?',
    a: `Publishly alerts you as soon as it knows. The post shows a plain-English reason, one of ${FAILURE_CODES} documented error codes, and whether it will be tried again. Developers can receive the same information inside their own product through a signed webhook.`,
  },
  {
    q: 'What counts as a successful post?',
    a: 'A request being accepted is not enough. Publishly marks a destination successful only after it confirms that the post is live and stores the public link in its delivery receipt.',
  },
  {
    q: 'Can Publishly warn me before a social connection expires?',
    a: 'Yes. Publishly checks connection health and warns before expected token expiry. If a connection stops working, that account is held back and the rest of your brands, clients, and locations keep publishing.',
  },
  {
    q: 'Does Publishly charge for every account?',
    a: 'No. Paid plans are based on how many posts are successfully delivered each month. Every paid plan includes unlimited connected accounts. The free plan includes 50 successful posts across 5 accounts.',
  },
  {
    q: 'Can I use Publishly inside my own software?',
    a: 'Yes. The posting API, status checks, delivery events, n8n package, Make package, and MCP server all use the same posting and safety rules as the Publishly app.',
  },
];

export const metadata: Metadata = {
  title: {
    absolute:
      'Publishly — reliable social media posting API with unlimited accounts',
  },
  description:
    'Publishly is the reliability layer for social posting at scale. Every post gets proof, every failure gets a reason and safe retry, and every paid plan includes unlimited accounts.',
  keywords: [
    'social media posting api',
    'post to multiple accounts api',
    'social media api unlimited accounts',
  ],
  alternates: { canonical: '/' },
};

export default function MarketingHome() {
  return (
    <>
      <MegaNav />
      <main id="mk-main">
        <header className="mk-hero mk-hero-c mk-home-hero">
          <div className="mk-hero-bleed">
            <div className="mk-hero-panel">
              <HalftoneHeroBackground />
              <div className="mk-hero-stage">
                <LiveProofBar />

                <div className="mk-hero-copy">
                  <span className="mk-hero-position">
                    The reliability layer for social posting at scale
                  </span>
                  <h1 className="mk-h1" data-hero-el>
                    {MARKETING.tagline}
                  </h1>
                  <p className="mk-hero-sub" data-hero-el>
                    {MARKETING.sub} Flat price. Unlimited accounts on every paid
                    plan.
                  </p>
                  <div className="mk-hero-ctas" data-hero-el>
                    <Link
                      href={MARKETING.authRegister}
                      className="mk-btn mk-btn-primary"
                    >
                      {MARKETING.cta.primary}
                    </Link>
                    <Link href="/reliability" className="mk-btn mk-btn-ghost">
                      See the proof
                    </Link>
                  </div>
                  <p className="mk-hero-note" data-hero-el>
                    Start free · 50 successful posts · 5 accounts · no card
                  </p>
                </div>

                <div className="mk-hero-terminal" data-hero-el>
                  <ApiTerminal />
                  <p className="mk-hero-terminal-note">
                    One post succeeds. One hits a platform limit. Both tell you
                    exactly what happened next.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="mk-netrow" aria-label="Supported networks">
          <div className="mk-container">
            <p className="mk-netrow-note">
              Authorized connections through official platform APIs
            </p>
            <div className="mk-netrow-items">
              {MARKETING.networks.map((network) => (
                <span key={network} className="mk-netrow-item">
                  <PlatformIcon name={network} />
                  {network}
                </span>
              ))}
              <span className="mk-netrow-item">+ additional integrations</span>
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="home-pain">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Why this exists</span>
                <h2 id="home-pain" className="mk-h2" style={{ marginTop: 14 }}>
                  You scheduled it. Your client noticed it never went live.
                </h2>
                <p className="mk-section-lede">
                  That is the worst way to learn a posting tool broke. The
                  problem usually follows the same four steps.
                </p>
              </div>
              <div className="mk-rows">
                {MARKETING.pains.map((pain, index) => (
                  <div className="mk-row" key={pain.title}>
                    <h3>
                      <span className="mk-mono" style={{ display: 'block' }}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {pain.title}
                    </h3>
                    <p>{pain.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <FactLine>
              At current monthly rates, 100 Ayrshare profiles work out to
              $1,228.30 and 30 Buffer Team channels cost $360. Publishly Growth
              is $99 a month with unlimited connected accounts.{' '}
              <Link href="/pricing">See the source-checked math.</Link>
            </FactLine>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="home-answer"
        >
          <div className="mk-container">
            <span className="mk-eyebrow">What Publishly does instead</span>
            <h2 id="home-answer" className="mk-h2" style={{ marginTop: 14 }}>
              Every post ends with proof or a clear next step.
            </h2>
            <p className="mk-section-lede">{MARKETING.entity}</p>
            <QuickAnswer>
              Publishly watches the delivery so your team does not have to. It
              confirms live posts, explains failed ones, retries temporary
              problems safely, warns about weak connections, and keeps one
              broken account from stopping the rest of your work.
            </QuickAnswer>
            <div className="mk-benefits">
              {MARKETING.answers.map((answer, index) => (
                <div className="mk-benefit" key={answer.title}>
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
            <p style={{ marginTop: 30 }}>
              <Link href="/reliability" className="mk-arrow">
                See exactly how failures are handled
              </Link>
            </p>
            <Byline published="2026-08-10" updated="2026-08-11" />
          </div>
        </section>

        <section className="mk-section" aria-labelledby="home-health">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'center' }}>
              <div>
                <span className="mk-eyebrow">Account health</span>
                <h2
                  id="home-health"
                  className="mk-h2"
                  style={{ marginTop: 14 }}
                >
                  You cannot watch 200 client and brand accounts. Publishly
                  does.
                </h2>
                <p className="mk-section-lede">
                  See healthy connections, early token warnings, posts being
                  retried, and accounts that need reconnecting in one view. Fix
                  the small problem before it becomes a missed client post.
                </p>
                <ul className="mk-points">
                  <li>Warnings before expected token expiry</li>
                  <li>Disconnected accounts held back automatically</li>
                  <li>Healthy accounts keep publishing</li>
                  <li>A reason and next action beside every problem</li>
                </ul>
              </div>
              <AccountHealthPreview />
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="home-for"
        >
          <div className="mk-container">
            <span className="mk-eyebrow">Built for the operator</span>
            <h2 id="home-for" className="mk-h2" style={{ marginTop: 14 }}>
              Built for the person running 50 brands, not one.
            </h2>
            <p className="mk-section-lede">
              Built for teams managing 20–500+ accounts across clients,
              locations, brands, markets, publications, or their own software
              users.
            </p>
            <div className="mk-cards">
              {AUDIENCES.map((audience, index) => (
                <Link
                  href={audience.href}
                  className="mk-card"
                  key={audience.title}
                >
                  <span className="mk-card-num">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{audience.title}</h3>
                  <p>{audience.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-center" id="pricing">
          <div className="mk-container">
            <span className="mk-eyebrow">Flat pricing</span>
            <h2 className="mk-h2" style={{ marginTop: 14 }}>
              Stop paying a tax on your own growth.
            </h2>
            <p className="mk-section-lede">
              Pay for posts Publishly confirms as live. Failed and unconfirmed
              posts do not use your allowance. Every paid plan includes
              unlimited connected accounts.
            </p>
            <PricingCards compact />
            <p className="mk-free-line">
              From 5 brand or client accounts to 500 — same posting rules, same
              flat price.{' '}
              <Link href="/pricing" style={{ textDecoration: 'underline' }}>
                Compare every plan and run the calculator
              </Link>
              .
            </p>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="home-integrations"
        >
          <div className="mk-container">
            <span className="mk-eyebrow">Works with your tools</span>
            <h2
              id="home-integrations"
              className="mk-h2"
              style={{ marginTop: 14 }}
            >
              Use Publishly in the way your team already works.
            </h2>
            <p className="mk-section-lede">
              Use the app, connect a visual workflow, or add reliable social
              posting to your own product. Every route ends with the same proof
              and the same failure alerts.
            </p>
            <div className="mk-cards">
              {INTEGRATIONS.map((item, index) => (
                <Link href={item.href} className="mk-card" key={item.label}>
                  <span className="mk-card-num">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{item.label}</h3>
                  <p>{item.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <FaqBlock title="Straight answers" entries={FAQ} />

        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Find the broken connection first.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Start free. Schedule one real post. Keep the receipt.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/status" className="mk-btn mk-btn-ghost">
                  Open public status
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
