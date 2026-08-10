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
  title: 'Post to Multiple Accounts API',
  description:
    'One calendar & one API for multi-brand and multi-location businesses: per-brand routing, brand isolation & pricing sized by posting volume — brand number 50 costs the same as brand number 5.',
};

// The multi-brand angle: the operator running a portfolio, not a profile.
// One calendar, per-brand routing, isolation, and the in-development learning
// loop (always labeled). Facts map to data/public-product-facts.json; the
// learning items are ai.in_development — direction, never shipped UI.

const PORTFOLIO = [
  {
    h: 'Every brand, one view',
    p: 'Month, week & day views across the whole portfolio. Work one brand when you’re deep in it; see the entire slate when you’re planning the week.',
  },
  {
    h: 'Per-brand routing',
    p: 'Each post goes to that brand’s own connected channels — captions tailored per network, checked against each platform’s real limits before anything schedules.',
  },
  {
    h: 'Brand isolation',
    p: 'Workspaces keep every brand’s accounts, tokens, media & history separate. Nothing bleeds across brands — not credentials, not content, not analytics.',
  },
  {
    h: 'Receipts per brand',
    p: 'Every destination runs as a tracked delivery with a full state history. When Tuesday’s slate goes out, you check receipts — not fifty tabs.',
  },
];

// ai.in_development — presented as direction, labeled on every tile.
const LEARNING = [
  {
    h: 'Brand Folders',
    p: 'Each brand gets a guided knowledge base — voice, banned words, product facts, audience, past winners. Fifty brands stay fifty distinct voices, never one blended mush.',
  },
  {
    h: 'Caption Memory',
    p: 'Every caption is joined to its measured results, per brand. New captions are written against what this brand’s audience actually rewarded — not generic viral tips.',
  },
  {
    h: 'A schedule that tunes itself',
    p: 'Slots drift toward the hours each brand’s audience measurably rewards — bounded, explainable & always under your control.',
  },
];

const FAQ = [
  {
    q: 'How do I post to multiple accounts across different brands?',
    a: 'Connect each brand’s channels through the platforms’ official OAuth flows, then publish from one calendar or one API call. Publishly routes every post to the right brand’s accounts, tailors the caption per network, and returns a delivery receipt per destination — so the portfolio stays one operation instead of fifty logins.',
  },
  {
    q: 'Will 50 brands end up sounding the same?',
    a: 'They shouldn’t, and the structure fights it: every brand keeps its own workspace, channels, and media, and captions are tailored per network per brand. Brand Folders — currently in development — go further: a per-brand knowledge base of voice, banned words, and past winners that grounds every generated caption, so fifty brands stay fifty distinct voices.',
  },
  {
    q: 'Does adding another brand raise the price?',
    a: 'No. Plans are sized by how much you post each month, not how many brands or accounts you run — connected accounts are unlimited on every paid plan, from $29 to $299 a month. Brand number 50 costs the same as brand number 5.',
  },
];

export default function ForMultiBrandPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        {/* ---- hero: centered, portfolio-first ---- */}
        <section className="mk-hero mk-hero-c">
          <div className="mk-container">
            <span className="mk-eyebrow">For multi-brand teams</span>
            <h1 className="mk-h1" style={{ marginTop: 18 }}>
              {MARKETING.copyBank.fleet}
            </h1>
            <p className="mk-hero-sub">
              Multi-brand, multi-location, multi-market — one calendar for the
              whole portfolio, one flat price for the volume.
            </p>
            <div className="mk-hero-ctas">
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
                {MARKETING.cta.primary}
              </Link>
              <Link href="/pricing" className="mk-btn mk-btn-ghost">
                See pricing
              </Link>
            </div>
            <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'left' }}>
              <QuickAnswer>
                Publishly lets multi-brand and multi-location businesses post
                to all of their accounts from one calendar and one API. Every
                brand keeps its own channels, voice, and workspace, and pricing
                is sized by posting volume — so brand number 50 costs the same
                as brand number 5.
              </QuickAnswer>
              <Byline published="2026-08-10" />
            </div>
          </div>
        </section>

        {/* ---- statement first: the thesis before the features ---- */}
        <section className="mk-quiet" style={{ textAlign: 'left' }}>
          <div className="mk-container">
            <p className="mk-statement">
              {'A portfolio is not fifty separate jobs. It is one publishing operation with fifty voices — and it deserves tooling that treats it that way.'
                .split(' ')
                .map((word, index) => (
                  <span className="mk-w" key={index}>
                    {word}{' '}
                  </span>
                ))}
            </p>
          </div>
        </section>

        {/* ---- the portfolio calendar: reversed split, rows lead ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-split mk-split-rev" style={{ alignItems: 'start' }}>
              <div className="mk-rows">
                {PORTFOLIO.map((item) => (
                  <div className="mk-row" key={item.h}>
                    <h3>{item.h}</h3>
                    <p>{item.p}</p>
                  </div>
                ))}
              </div>
              <div>
                <span className="mk-eyebrow">One calendar</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  Fifty brands. One board.
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
                  You already hold the whole portfolio in your head. Publishly
                  puts it on one board — every brand&rsquo;s slate visible,
                  every post routed to the right channels, every delivery
                  receipted.
                </p>
                <FactLine>{MARKETING.copyBank.same}</FactLine>
              </div>
            </div>
          </div>
        </section>

        {/* ---- learning loop: bento tiles, labeled in development ---- */}
        <section className="mk-section mk-section-tint">
          <div className="mk-container">
            <span className="mk-eyebrow">In development</span>
            <h2 className="mk-h2" style={{ marginTop: 14 }}>
              50 brands. 50 voices. Kept that way.
            </h2>
            <p className="mk-section-lede">
              The learning loop we&rsquo;re building keeps every brand sounding
              like itself. This is where Publishly is going — direction, not
              shipped UI, and we label it that way.
            </p>
            <div className="mk-bento" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {LEARNING.map((tile) => (
                <div className="mk-tile" key={tile.h}>
                  <span className="mk-tile-label">In development</span>
                  <h3>{tile.h}</h3>
                  <p>{tile.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- pricing: volume, not brand count ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Pricing</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  Priced by what you post. Not how many brands you run.
                </h2>
              </div>
              <div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--mk-text-2)',
                    fontSize: 15.5,
                    lineHeight: 1.68,
                    maxWidth: '52ch',
                  }}
                >
                  Adding a brand should be a creative decision, not a pricing
                  call. On Publishly it&rsquo;s just connecting channels — the
                  plan you&rsquo;re on already covers them.
                </p>
                <FactLine>
                  Publishly plans run $29–$299 a month sized by monthly posting
                  volume; connected accounts are unlimited on every paid plan.
                </FactLine>
              </div>
            </div>
          </div>
        </section>

        <FaqBlock title="Multi-brand questions" entries={FAQ} />

        {/* ---- close ---- */}
        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Bring the whole portfolio.</h2>
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
