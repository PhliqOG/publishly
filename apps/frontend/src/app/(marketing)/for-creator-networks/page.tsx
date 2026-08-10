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
  title: 'Posting API for Creator Networks',
  description:
    'One publishing pipeline for media networks & creator teams: every show, newsletter & channel brand on one calendar, CSV bulk scheduling with per-row validation, delivery receipts across the network & one flat price.',
};

// The network angle: a slate of distinct properties — shows, newsletters,
// channel brands — each with its own audience and channels, run as one
// publishing operation. Framing stays multi-brand / multi-channel throughout;
// facts map to data/public-product-facts.json.

const SLATE = [
  {
    h: 'One pipeline for every property',
    p: 'Each show, newsletter or channel brand keeps its own workspace, channels & media. The publishing rail underneath is the same — one place to plan the slate, one place to check it landed.',
  },
  {
    h: 'Bulk scheduling that shows its work',
    p: 'Load a week of the network’s posts from a CSV. Every row is validated before anything commits, and every rejected row tells you why — no half-imported slates, no mystery gaps on Thursday.',
  },
  {
    h: 'Receipts across the network',
    p: 'Every post to every channel runs as a tracked delivery with a full state history, and a successful post stores the live URL. When a sponsor asks “did it go out?”, the answer is a link.',
  },
  {
    h: 'Failures reach the team, not the audience',
    p: 'A failed post carries a plain-English reason and fires a signed webhook the same moment. Transient failures retry automatically with backoff — and a retry can never double-post.',
  },
];

// Schematic of the real CSV preview behavior: per-row validation with a
// stated reason before anything commits. Placeholder property names only.
const CSV_ROWS = [
  ['row 12', 'ok', 'morning-brief · X · Thu 08:00'],
  ['row 13', 'ok', 'morning-brief · LinkedIn · Thu 08:05'],
  ['row 14', 'rejected', 'caption exceeds X’s 280-character limit'],
  ['row 15', 'ok', 'field-notes · Instagram · Thu 17:30'],
  ['row 16', 'rejected', 'media URL missing for a video post'],
  ['row 17', 'ok', 'weekend-desk · YouTube · Sat 10:00'],
] as const;

const FAQ = [
  {
    q: 'Can a media network schedule posts for many shows at once?',
    a: 'Yes. Each show, newsletter, or channel brand lives in its own workspace with its own connected channels, and CSV bulk scheduling loads a whole slate in one import — with every row validated and every rejection explained before anything commits. The calendar then shows each property’s week, backed by a delivery receipt per post.',
  },
  {
    q: 'How does CSV bulk scheduling work?',
    a: 'Upload a CSV of scheduled posts and Publishly runs a full validation preview: every row is checked against each platform’s real limits, and every rejected row tells you exactly why. Commit when it’s clean — committed rows become scheduled posts with the same receipts, retries, and failure alerts as anything scheduled by hand.',
  },
  {
    q: 'What does it cost to run a whole network on Publishly?',
    a: 'One flat price sized by posting volume — $29 to $299 a month, with unlimited connected channels on every paid plan. The Free plan includes API access with 50 posts a month across 5 accounts, so you can pilot one property before moving the slate.',
  },
];

export default function ForCreatorNetworksPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        {/* ---- hero: left editorial with mono slate index ---- */}
        <section className="mk-hero">
          <div className="mk-container">
            <span className="mk-eyebrow">For creator networks &amp; media teams</span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '16ch' }}>
              Every show. Every newsletter. One pipeline.
            </h1>
            <p className="mk-section-lede" style={{ maxWidth: '54ch' }}>
              You&rsquo;re publishing a slate, not a profile — shows,
              newsletters, channel brands, each with its own audience and its
              own channels. Publishly runs the whole network as one operation,
              with receipts.
            </p>
            <QuickAnswer>
              Publishly gives media networks and creator teams one pipeline for
              every show, newsletter, and channel brand they run. Schedule the
              whole slate by CSV with per-row validation, get a delivery
              receipt for every post on every channel, and pay one flat price
              sized by volume — not by channel count.
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
            {/* mono index of the slate this page covers */}
            <div
              aria-hidden="true"
              style={{
                marginTop: 56,
                paddingTop: 16,
                borderTop: '1px solid var(--mk-line)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px 34px',
              }}
            >
              {['Shows', 'Newsletters', 'Channel brands', 'One pipeline'].map(
                (label) => (
                  <span
                    key={label}
                    className="mk-mono"
                    style={{ color: 'var(--mk-text-3)' }}
                  >
                    {label}
                  </span>
                )
              )}
            </div>
          </div>
        </section>

        {/* ---- the slate: numbered benefits, centered column ---- */}
        <section className="mk-section mk-center">
          <div className="mk-container">
            <h2 className="mk-h2">The whole slate, one operation.</h2>
            <div className="mk-benefits">
              {SLATE.map((item, index) => (
                <div className="mk-benefit" key={item.h}>
                  <span className="mk-benefit-num">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{item.h}</h3>
                    <p>{item.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- CSV validation: split copy beside a mono readout ---- */}
        <section className="mk-section mk-section-tint">
          <div className="mk-container">
            <div className="mk-split">
              <div>
                <span className="mk-eyebrow">Bulk, with receipts</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  A week of the network in one import.
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
                  Your slate probably already lives in a spreadsheet. Bring it
                  as-is: the import previews every row against each
                  platform&rsquo;s real limits before anything commits — so a
                  bad row never quietly eats a slot.
                </p>
                <FactLine>
                  Publishly&rsquo;s CSV import validates every row before
                  anything commits — and every rejected row states its reason.
                </FactLine>
              </div>
              <div
                style={{
                  border: '1px solid var(--mk-line)',
                  borderRadius: 'var(--mk-radius)',
                  background: '#fff',
                  boxShadow: 'var(--mk-shadow)',
                  overflow: 'hidden',
                }}
              >
                <div
                  className="mk-mono"
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--mk-line)',
                    color: 'var(--mk-text-3)',
                    background: 'var(--mk-bg)',
                  }}
                >
                  Validation preview · nothing committed yet
                </div>
                <div style={{ padding: '6px 18px 12px' }}>
                  {CSV_ROWS.map(([row, verdict, detail]) => (
                    <div
                      key={row}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'baseline',
                        gap: '2px 16px',
                        padding: '9px 0',
                        borderBottom: '1px solid var(--mk-line)',
                      }}
                    >
                      <span
                        className="mk-mono"
                        style={{ color: 'var(--mk-text-3)', width: '4.4em', flex: 'none' }}
                      >
                        {row}
                      </span>
                      <span
                        className="mk-mono"
                        style={{
                          width: '5.8em',
                          flex: 'none',
                          color:
                            verdict === 'ok' ? 'var(--mk-blue)' : '#b4231f',
                        }}
                      >
                        {verdict}
                      </span>
                      <span
                        style={{
                          flex: '1 1 200px',
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          color: 'var(--mk-text-2)',
                        }}
                      >
                        {detail}
                      </span>
                    </div>
                  ))}
                  <p
                    className="mk-mono"
                    style={{ margin: '12px 0 0', color: 'var(--mk-text-3)' }}
                  >
                    Fix the 2 rejected rows · commit when clean
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- statement ---- */}
        <section className="mk-quiet" style={{ textAlign: 'left' }}>
          <div className="mk-container">
            <p className="mk-statement">
              {'A network is a promise of cadence. The pipeline that keeps that promise should show its receipts — for every show, every send, every channel.'
                .split(' ')
                .map((word, index) => (
                  <span className="mk-w" key={index}>
                    {word}{' '}
                  </span>
                ))}
            </p>
          </div>
        </section>

        {/* ---- flat price ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <span className="mk-eyebrow">One price for the slate</span>
            <h2 className="mk-h2" style={{ marginTop: 14 }}>
              The network grows. The bill doesn&rsquo;t follow it around.
            </h2>
            <p className="mk-section-lede">
              Launching a new show means connecting its channels — not
              renegotiating your tooling. Plans are sized by how much the
              network posts, and that&rsquo;s the only variable.
            </p>
            <FactLine>
              Publishly plans are flat — $29–$299 a month sized by posting
              volume, with unlimited connected channels on every paid plan.
            </FactLine>
          </div>
        </section>

        <FaqBlock title="Network questions" entries={FAQ} />

        {/* ---- close ---- */}
        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Put the slate on rails.</h2>
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
