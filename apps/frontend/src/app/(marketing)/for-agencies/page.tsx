import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  FactLine,
  FaqBlock,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Social Media API for Agencies',
  description:
    'The social media API & scheduler for agencies running 20–500 client accounts: delivery receipts per client account, failure webhooks before the client notices, workspace isolation & flat $29–$299 pricing — never per profile.',
};

// The agency angle: you manage a fleet you cannot watch by hand, so the tool
// has to be the one that tells you — before the client does. Facts on this
// page map to data/public-product-facts.json + data/claim-provenance.json
// (ayrshare-100-profiles).

const FLEET_REALITY = [
  {
    h: 'Silent failures',
    p: 'Most schedulers mark a post “scheduled” and move on. When it never lands, you find out from the client — days later, mid-report.',
  },
  {
    h: 'Tokens die on a timer',
    p: 'Access tokens on the major platforms expire in roughly 60 days. One quiet expiry and a client’s account slips into a reconnect loop while its queue keeps “posting” into nothing.',
  },
  {
    h: 'No reasons, just red',
    p: 'A red icon with no explanation isn’t status — it’s homework, multiplied by every account you manage.',
  },
];

const RECEIPTS = [
  {
    num: '01',
    h: 'A receipt per client account',
    p: 'Each destination runs as its own tracked delivery with a full state history — and a successful post stores the live URL. Proof you can paste straight into a client report.',
  },
  {
    num: '02',
    h: 'Failures with reasons',
    p: 'A failed post carries a plain-English reason, classed as recoverable, needs-your-action, or a content problem. The same moment, a signed post.failure webhook tells your systems.',
  },
  {
    num: '03',
    h: 'Retries that never double-post',
    p: 'Transient failures retry automatically with backoff. The publish call itself fires exactly once — a retry can never post twice to a client’s account.',
  },
];

const FAQ = [
  {
    q: 'How do agencies manage 100+ client social accounts?',
    a: 'Give each client its own workspace, connect their channels through official OAuth, and let the platform watch delivery. In Publishly every post carries a delivery receipt and every failure fires an alert with a reason, so 100+ accounts don’t need 100 pairs of eyes. Plans are flat, so winning another client never raises the software bill.',
  },
  {
    q: 'How do I know a client’s post failed before they do?',
    a: 'The moment a post fails, Publishly records a plain-English failure reason and sends a signed post.failure webhook — alongside an in-app alert. Transient failures retry automatically with backoff, so many failures resolve before anyone outside your team ever notices.',
  },
  {
    q: 'Can I keep client accounts isolated?',
    a: 'Yes. Each client lives in its own workspace: accounts, tokens, media and history stay separate, team roles are per workspace, and an audit trail records who did what. When a client leaves, their data leaves with them — cleanly.',
  },
  {
    q: 'What does Publishly cost for an agency?',
    a: 'Plans run $29 to $299 a month, sized by how much you post — connected accounts are unlimited on every paid plan. At 100 profiles the per-profile tools bill over $1,200 a month; Publishly doesn’t price per profile at all.',
  },
];

export default function ForAgenciesPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        {/* ---- hero: left editorial, answer-first ---- */}
        <section className="mk-hero">
          <div className="mk-container">
            <span className="mk-eyebrow">For agencies</span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '16ch' }}>
              Find out from a webhook, not your client.
            </h1>
            <p className="mk-section-lede" style={{ maxWidth: '54ch' }}>
              You&rsquo;re running 20, 100, maybe 500 client accounts. The tool
              that schedules them should be the one that tells you when
              something breaks — before the client&rsquo;s report does.
            </p>
            <QuickAnswer>
              Publishly is a social media API and scheduler built for agencies
              running large client fleets. Every post gets a delivery receipt
              per client account, every failure fires an alert with a reason
              before the client notices, and pricing stays flat at $29–$299 a
              month — never per profile.
            </QuickAnswer>
            <Byline published="2026-08-10" />
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
              <Link href="/pricing" className="mk-arrow">
                See flat pricing
              </Link>
            </div>
          </div>
        </section>

        {/* ---- the fleet reality: split heading beside failure rows ---- */}
        <section className="mk-section mk-section-tint">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">The fleet reality</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  Twenty clients. Two hundred accounts. Zero spare eyes.
                </h2>
                <p className="mk-section-lede" style={{ fontSize: 16 }}>
                  Posts go out all day across every client you manage. Nobody
                  can watch that by hand — and the failure modes don&rsquo;t
                  announce themselves.
                </p>
              </div>
              <div className="mk-rows">
                {FLEET_REALITY.map((item) => (
                  <div className="mk-row" key={item.h}>
                    <h3>{item.h}</h3>
                    <p>{item.p}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- receipts: numbered cards, one per guarantee ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <span className="mk-eyebrow">Delivery, accounted for</span>
            <h2 className="mk-h2" style={{ marginTop: 14 }}>
              Every client post, receipted.
            </h2>
            <div className="mk-cards">
              {RECEIPTS.map((card) => (
                <div className="mk-card" key={card.h}>
                  <span className="mk-card-num">{card.num}</span>
                  <h3>{card.h}</h3>
                  <p>{card.p}</p>
                </div>
              ))}
            </div>
            <FactLine>
              Every failed post in Publishly records a plain-English reason and
              fires a signed post.failure webhook the moment it happens.
            </FactLine>
          </div>
        </section>

        {/* ---- statement: the page thesis, word-shift ---- */}
        <section className="mk-quiet" style={{ textAlign: 'left' }}>
          <div className="mk-container">
            <p className="mk-statement">
              {'You should never learn a post failed from the client. The alert reaches you first — with the reason, and the retry already scheduled.'
                .split(' ')
                .map((word, index) => (
                  <span className="mk-w" key={index}>
                    {word}{' '}
                  </span>
                ))}
            </p>
          </div>
        </section>

        {/* ---- isolation: reversed split, boundary you can hand to a client ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-split mk-split-rev" style={{ alignItems: 'start' }}>
              <div className="mk-rows">
                <div className="mk-row">
                  <h3>Separate by construction</h3>
                  <p>
                    A client&rsquo;s accounts, tokens, media &amp; posting
                    history live in their own workspace. Nothing bleeds between
                    clients — not credentials, not content, not analytics.
                  </p>
                </div>
                <div className="mk-row">
                  <h3>Roles &amp; audit trail</h3>
                  <p>
                    Invite your team per workspace. Invitations, channel
                    changes, key management &amp; bulk operations are recorded —
                    who, what, when, from where.
                  </p>
                </div>
                <div className="mk-row">
                  <h3>Clean offboarding</h3>
                  <p>
                    When a client leaves, their workspace leaves with them.
                    Disconnecting a channel destroys its tokens immediately —
                    no residue in your stack.
                  </p>
                </div>
              </div>
              <div>
                <span className="mk-eyebrow">Isolation</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  One client per workspace. Cleanly.
                </h2>
                <p
                  style={{
                    margin: '16px 0 0',
                    color: 'var(--mk-text-2)',
                    fontSize: 15.5,
                    lineHeight: 1.68,
                    maxWidth: '46ch',
                  }}
                >
                  Isolation isn&rsquo;t a screen in the UI — it&rsquo;s the
                  boundary your contracts assume. Publishly enforces it in the
                  data model, so you can promise it to a client with a straight
                  face.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- pricing: the growth-tax section ---- */}
        <section className="mk-section mk-section-tint">
          <div className="mk-container">
            <span className="mk-eyebrow">Pricing at fleet scale</span>
            <h2 className="mk-h2" style={{ marginTop: 14 }}>
              Winning a client shouldn&rsquo;t raise your software bill.
            </h2>
            <p className="mk-section-lede">
              Per-profile pricing is a tax on your growth: every account you
              win for a client is a line item you pay for. Publishly sizes
              plans by how much you post — accounts are unlimited on every
              paid plan.
            </p>
            <FactLine>
              At 100 profiles the per-profile tools bill over $1,200 a month.
              Publishly runs $29–$299 a month flat, with unlimited connected
              accounts on every paid plan.
            </FactLine>
          </div>
        </section>

        {/* ---- managed services: quiet band, honest offer ---- */}
        <section style={{ padding: '72px 0 0' }}>
          <div className="mk-container">
            <div className="mk-band">
              <div>
                <h2 className="mk-h2" style={{ fontSize: 'clamp(1.5rem, 2.6vw, 2rem)' }}>
                  Need hands as well as rails?
                </h2>
                <p style={{ maxWidth: '58ch' }}>
                  We offer managed multi-brand operations — brand setup,
                  isolation architecture, planning cadence. Ask us.
                </p>
              </div>
              <Link href="/contact" className="mk-arrow">
                Talk to us
              </Link>
            </div>
          </div>
        </section>

        <FaqBlock title="Agency questions" entries={FAQ} />

        {/* ---- close ---- */}
        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Run the fleet. Keep the receipts.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                No credit card needed. 7-day trial on every plan.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/pricing" className="mk-btn mk-btn-ghost">
                  See pricing
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
