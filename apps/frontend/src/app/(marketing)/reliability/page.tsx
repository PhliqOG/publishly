import type { Metadata } from 'next';
import Link from 'next/link';
import { CSSProperties } from 'react';
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
import {
  POST_FAILURE_CATALOG,
  POST_FAILURE_CLASSES,
} from '@gitroom/nestjs-libraries/reliability/post.failure';
import type {
  PostFailureClass,
  PostFailureCode,
} from '@gitroom/nestjs-libraries/reliability/post.failure';
import { StatusLivePanel } from '../status/status-live-panel';

// The proof page for "Nothing fails silently." The failure taxonomy below is
// rendered from the same TypeScript catalog the publishing engine imports
// (POST_FAILURE_CATALOG) — the page structurally cannot drift from the code.
// Every claim maps to data/public-product-facts.json.

export const metadata: Metadata = {
  title: {
    absolute:
      'Social posting reliability — receipts, alerts and safe retries | Publishly',
  },
  description:
    'See how Publishly confirms live posts, explains every failure, retries temporary problems safely, warns about expiring connections, and publishes real status data.',
  alternates: { canonical: '/reliability' },
};

/* ---------------------------------------------------------------- data */

const CODES = Object.keys(POST_FAILURE_CATALOG) as PostFailureCode[];

const CLASS_META: Record<PostFailureClass, { label: string; blurb: string }> = {
  recoverable: {
    label: 'Recovers on its own',
    blurb:
      'A short platform or network problem. Publishly waits, tries again safely, and keeps you informed.',
  },
  user_action_needed: {
    label: 'Needs your action',
    blurb:
      'Something only you can fix — a revoked authorization, a missing permission, a platform restriction. The post is held & the receipt says exactly what to do.',
  },
  data_problem: {
    label: 'Content problem',
    blurb:
      'The platform rejected the content itself. Identical content would fail identically, so nothing retries until you change it.',
  },
};

const TAXONOMY = POST_FAILURE_CLASSES.map((failureClass) => ({
  failureClass,
  ...CLASS_META[failureClass],
  codes: CODES.filter(
    (code) => POST_FAILURE_CATALOG[code].failureClass === failureClass
  ),
}));

// Example receipt — field-for-field from the public publishing status.
const RECEIPT_JSON = `{
  "state": "PUBLISHED",
  "deliveryStage": "confirmed_live",
  "providerPostId": "17895695668004550",
  "providerUrl": "https://www.instagram.com/p/DM7kQx2NwXb/",
  "attempts": 1,
  "completedAt": "2026-08-10T14:30:12.000Z"
}`;

// The webhook example's failure block is built from the real catalog entry, so
// class / code / reason can never drift from what the engine actually sends.
const FAILURE_EXAMPLE: PostFailureCode = 'rate_limited';

const WEBHOOK_BODY = JSON.stringify(
  {
    specversion: '1.0',
    id: 'post.failure:cf1f6ab2:retry:2:rate_limited',
    type: 'post.failure',
    time: '2026-08-10T14:31:44.000Z',
    data: {
      postId: 'cf1f6ab2-93d4-4c8e-9a75-6f0b1de4c210',
      integrationId: '52a7c9e8-0d13-4b6f-b2c4-8e9d1f3a7b65',
      provider: 'instagram',
      attempt: 2,
      willRetry: true,
      failure: {
        class: POST_FAILURE_CATALOG[FAILURE_EXAMPLE].failureClass,
        code: FAILURE_EXAMPLE,
        reason: POST_FAILURE_CATALOG[FAILURE_EXAMPLE].defaultReason,
      },
    },
  },
  null,
  2
);

const WEBHOOK_HEADERS = [
  'User-Agent: Publishly-Webhooks/1.0',
  'X-Publishly-Event: post.failure',
  'X-Publishly-Event-Id: post.failure:cf1f6ab2:retry:2:rate_limited',
  'X-Publishly-Timestamp: 1786372304',
  'X-Publishly-Signature: t=1786372304,v1=6e0fc19b…a41c',
].join('\n');

const STATEMENT =
  'Tell you quickly. Retry carefully. Never risk posting the same thing twice just to make a dashboard look green.';

const FAQ = [
  {
    q: 'How do I know when a scheduled post fails?',
    a: 'Publishly alerts you as soon as it knows. The post shows a plain-English reason, whether it will be tried again, and what you need to do. Developers can receive the same details in their own software through a signed failure event.',
  },
  {
    q: 'What happens when a social media API token expires?',
    a: 'Where a platform allows renewal, Publishly refreshes the connection automatically. If that renewal fails, you get an in-app alert and an email, and that account is held back so more posts are not lost while you reconnect it.',
  },
  {
    q: 'Does Publishly retry failed posts automatically?',
    a: 'Temporary problems such as rate limits, platform outages, and network errors are tried again after a safe delay. Problems that need your action or different content are held with an exact reason instead of being repeated blindly. A regular recovery check also catches recently missed schedule times.',
  },
  {
    q: 'Can a retry cause a duplicate post?',
    a: 'No. The publish call itself fires exactly once per delivery; retries only re-run the safe steps around it. If a platform outcome can’t be confirmed, the post is marked outcome_unknown and you’re asked to check the account — it is never silently replayed.',
  },
  {
    q: 'How does Publishly detect a disconnected account?',
    a: 'Scheduled token refreshes and delivery attempts both surface dead connections. A revoked or disconnected account is flagged, excluded from delivery, and raised with a reconnect alert — one dead account never breaks the rest of the calendar.',
  },
];

/* ---------------------------------------------------------------- styles */

const CELL_H3: CSSProperties = {
  fontSize: 16.5,
  letterSpacing: '-0.015em',
  margin: '10px 0 0',
};

const CELL_P: CSSProperties = {
  margin: '7px 0 0',
  fontSize: 14,
  lineHeight: 1.62,
  color: 'var(--mk-text-2)',
};

const BODY_P: CSSProperties = {
  margin: '16px 0 0',
  color: 'var(--mk-text-2)',
  fontSize: 15.5,
  lineHeight: 1.68,
  maxWidth: '48ch',
};

const MONO_BLOCK: CSSProperties = {
  fontFamily: 'var(--mk-font-mono), monospace',
  fontSize: 13,
  lineHeight: 1.75,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: 'var(--mk-text)',
  margin: 0,
};

/* ---------------------------------------------------------------- page */

export default function ReliabilityPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        {/* ---- 1 · editorial hero ---- */}
        <section className="mk-hero">
          <div className="mk-container">
            <span className="mk-eyebrow">Reliability</span>
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '15ch' }}
            >
              When a post breaks, you hear about it first.
            </h1>
            <p className="mk-section-lede" style={{ maxWidth: '56ch' }}>
              You cannot watch every account across every brand, client, and
              location. Publishly checks what went live, explains what did not,
              and handles temporary problems before they become client calls.
            </p>
            <QuickAnswer>
              A post is only called successful after Publishly confirms it is
              live. A failure comes with a clear reason, an alert, and a safe
              next step. Temporary problems are retried; uncertain outcomes are
              stopped for review so Publishly never risks posting twice.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-11" />
            <div
              style={{
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: 30,
              }}
            >
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                {MARKETING.cta.primary}
              </Link>
              <Link href="/status" className="mk-arrow">
                See live status
              </Link>
            </div>
            <div
              aria-hidden="true"
              style={{
                marginTop: 52,
                paddingTop: 16,
                borderTop: '1px solid var(--mk-line)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px 34px',
              }}
            >
              {[
                'Why it failed',
                'Proof it went live',
                'Instant alerts',
                'Safe retries',
                'Connection warnings',
              ].map((item) => (
                <span
                  key={item}
                  className="mk-mono"
                  style={{ color: 'var(--mk-text-3)' }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---- 2 · the failure taxonomy — rendered from the shipped catalog ---- */}
        <section className="mk-section" aria-labelledby="rel-taxonomy">
          <div className="mk-container">
            <span className="mk-eyebrow">The failure catalog</span>
            <h2 id="rel-taxonomy" className="mk-h2" style={{ marginTop: 14 }}>
              Every failure has a name.
            </h2>
            <p className="mk-section-lede">
              These are the actual reasons Publishly uses, pulled from the same
              list as the posting system. Every failed post gets one reason and
              one clear next step: Publishly tries again, you take action, or
              the content needs to change.
            </p>
            {TAXONOMY.map((group) => (
              <div key={group.failureClass} style={{ marginTop: 48 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '4px 18px',
                    flexWrap: 'wrap',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 19,
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {group.label}
                  </h3>
                  <span className="mk-mono" style={{ color: 'var(--mk-blue)' }}>
                    {group.failureClass} · {group.codes.length} codes
                  </span>
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 14.5,
                    lineHeight: 1.62,
                    color: 'var(--mk-text-2)',
                    maxWidth: '64ch',
                  }}
                >
                  {group.blurb}
                </p>
                <div
                  style={{
                    marginTop: 18,
                    borderTop: '1px solid var(--mk-line)',
                  }}
                >
                  {group.codes.map((code) => (
                    <div
                      key={code}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'baseline',
                        gap: '4px 24px',
                        padding: '12px 0',
                        borderBottom: '1px solid var(--mk-line)',
                      }}
                    >
                      <Link
                        href={`/docs/errors/${code}`}
                        className="mk-mono"
                        style={{
                          color: 'var(--mk-text)',
                          flex: 'none',
                          width: '19em',
                        }}
                      >
                        {code}
                      </Link>
                      <span
                        style={{
                          flex: '1 1 320px',
                          minWidth: 240,
                          fontSize: 14,
                          lineHeight: 1.55,
                          color: 'var(--mk-text-2)',
                        }}
                      >
                        {POST_FAILURE_CATALOG[code].defaultReason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <FactLine>
              Every Publishly post failure carries one of {CODES.length}{' '}
              documented failure codes in three classes &mdash; recoverable,
              needs-your-action, or a content problem &mdash; each with a
              plain-English default reason.
            </FactLine>
          </div>
        </section>

        {/* ---- 3 · delivery receipts — split, copy beside the receipt ---- */}
        <section
          className="mk-section mk-section-tint"
          aria-labelledby="rel-receipts"
        >
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Delivery receipts</span>
                <h2
                  id="rel-receipts"
                  className="mk-h2"
                  style={{ marginTop: 14 }}
                >
                  A receipt for every destination.
                </h2>
                <p style={BODY_P}>
                  Each destination runs as its own tracked delivery with a full
                  state history. A post sent to six chosen brand accounts gets
                  six receipts &mdash; one can fail and retry while the other
                  five stay published.
                </p>
                <p
                  className="mk-mono"
                  style={{
                    margin: '22px 0 0',
                    color: 'var(--mk-text-2)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {'SCHEDULED → QUEUED → PROCESSING → PUBLISHED\n'}
                  {'                       ↳ RETRYING → PROCESSING\n'}
                  {'                       ↳ FAILED (class + code + reason)'}
                </p>
                <p style={BODY_P}>
                  On success the receipt stores the platform&rsquo;s post ID
                  &amp; the live URL &mdash; proof the post exists, not an
                  inference that it probably does. Poll it whenever you like:
                </p>
                <p
                  className="mk-mono"
                  style={{
                    margin: '18px 0 0',
                    padding: '12px 16px',
                    border: '1px solid var(--mk-line)',
                    borderRadius: 8,
                    display: 'inline-block',
                    color: 'var(--mk-text)',
                  }}
                >
                  GET /public/v1/posts/:id/status
                </p>
              </div>
              <div className="mk-term mk-reveal">
                <div className="mk-term-top">
                  <span className="mk-term-dot" />
                  <span className="mk-term-dot" />
                  <span className="mk-term-dot" />
                  <span className="mk-term-title">delivery receipt</span>
                </div>
                <div className="mk-term-body">
                  <span className="mk-term-prompt">GET</span>{' '}
                  /public/v1/posts/cf1f6ab2/status{'\n\n'}
                  <span className="mk-term-ok">200 OK</span>
                  {'\n'}
                  {RECEIPT_JSON}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- 4 · webhooks — full-width mono block + guarantees grid ---- */}
        <section className="mk-section" aria-labelledby="rel-webhooks">
          <div className="mk-container">
            <span className="mk-eyebrow">Webhooks</span>
            <h2 id="rel-webhooks" className="mk-h2" style={{ marginTop: 14 }}>
              The failure reaches you first.
            </h2>
            <p className="mk-section-lede">
              A webhook is simply an alert sent straight to your own software.
              Publishly sends one as a post moves forward and another when it
              fails. The failure alert includes the reason and whether another
              safe attempt is coming. This is the actual payload:
            </p>
            <div
              className="mk-term mk-reveal"
              style={{ marginTop: 36, maxWidth: 760 }}
            >
              <div className="mk-term-top">
                <span className="mk-term-dot" />
                <span className="mk-term-dot" />
                <span className="mk-term-dot" />
                <span className="mk-term-title">post.failure delivery</span>
              </div>
              <div className="mk-term-body">
                <span className="mk-term-prompt">POST</span>{' '}
                https://ops.your-agency.com/hooks/publishly{'\n'}
                {WEBHOOK_HEADERS}
                {'\n\n'}
                {WEBHOOK_BODY}
              </div>
            </div>
            <div
              style={{
                marginTop: 44,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                columnGap: 44,
                borderTop: '1px solid var(--mk-line)',
              }}
            >
              {[
                {
                  tag: 'Signed',
                  title: 'Proves the alert came from Publishly',
                  body: 'Every alert includes a secure signature and timestamp. Your software can reject a changed, fake, or stale alert before acting on it.',
                },
                {
                  tag: 'Retried',
                  title: 'Tries again if your receiver is down',
                  body: 'If your alert receiver is temporarily unavailable, Publishly tries three times. The posting result remains recorded even when your endpoint is down.',
                },
                {
                  tag: 'Ledgered',
                  title: 'Keeps a record of every alert attempt',
                  body: 'You can see when Publishly called your software, what came back, how long it took, and why an attempt failed.',
                },
              ].map((cell, index) => (
                <div
                  key={cell.tag}
                  style={{
                    padding: '18px 0 22px',
                    borderBottom: '1px solid var(--mk-line)',
                  }}
                >
                  <span className="mk-mono" style={{ color: 'var(--mk-blue)' }}>
                    {cell.tag} · {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 style={CELL_H3}>{cell.title}</h3>
                  <p style={CELL_P}>{cell.body}</p>
                </div>
              ))}
            </div>
            <FactLine>
              Publishly signs every alert with HMAC-SHA256, tries delivery up to
              three times, and records what happened on every attempt.
            </FactLine>
          </div>
        </section>

        {/* ---- 5 · retries — heading column beside the row index ---- */}
        <section
          className="mk-section mk-section-tint"
          aria-labelledby="rel-retries"
        >
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Retries</span>
                <h2
                  id="rel-retries"
                  className="mk-h2"
                  style={{ marginTop: 14 }}
                >
                  Retries that can&rsquo;t double-post.
                </h2>
                <p className="mk-section-lede" style={{ fontSize: 16 }}>
                  The philosophy is deliberate: aggressive about telling you,
                  conservative about touching the platform twice. A duplicate
                  post in front of a client&rsquo;s audience is worse than a
                  late one &mdash; the engine is built around that ranking.
                </p>
              </div>
              <div className="mk-rows">
                {[
                  {
                    title: '15 seconds → 30 minutes',
                    body: 'Temporary problems are tried again after a delay that grows from 15 seconds up to 30 minutes. Every attempt appears in the receipt.',
                  },
                  {
                    title: 'The publish call fires exactly once',
                    body: 'Safe checks can run again. The one step that creates the public post is never repeated blindly, so a retry cannot create a duplicate.',
                  },
                  {
                    title: 'Unconfirmed is a state, not a guess',
                    body: 'If a platform stops responding at the wrong moment, Publishly tells you the result is unknown and asks you to check before trying again. It never guesses and repeats the post.',
                  },
                  {
                    title: 'A regular recovery check catches missed times',
                    body: 'If a recent schedule time is missed during a restart or service problem, Publishly finds it within the hour and queues it again when the account is healthy.',
                  },
                ].map((row) => (
                  <div className="mk-row" key={row.title}>
                    <h3>{row.title}</h3>
                    <div>
                      <p>{row.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <FactLine>
              Publishly tries temporary failures again after 15 seconds to 30
              minutes, but never repeats the step that could create a duplicate
              post.
            </FactLine>
          </div>
        </section>

        {/* ---- 6 · token health — quiet narrow editorial column ---- */}
        <section className="mk-section" aria-labelledby="rel-tokens">
          <div className="mk-container">
            <div style={{ maxWidth: '60ch' }}>
              <span className="mk-eyebrow">Token health</span>
              <h2 id="rel-tokens" className="mk-h2" style={{ marginTop: 14 }}>
                {MARKETING.copyBank.token}
              </h2>
              <p style={{ ...BODY_P, maxWidth: '58ch' }}>
                Platform connections do not last forever. LinkedIn access
                tokens, for example, are commonly issued for 60 days, while
                TikTok access tokens are much shorter and normally renew in the
                background. Publishly records the expiry the platform reports
                instead of pretending every network uses the same timer.
              </p>
              <p style={{ ...BODY_P, maxWidth: '58ch' }}>
                The moment a refresh fails, you get an in-app alert &amp; an
                email &mdash; not a red icon you discover next week. The account
                is flagged &amp; excluded from delivery, so its queue stops
                cleanly instead of posting into nothing.
              </p>
              <p
                style={{
                  margin: '26px 0 0',
                  fontSize: 18,
                  letterSpacing: '-0.015em',
                  fontWeight: 600,
                  color: 'var(--mk-text)',
                  maxWidth: '40ch',
                }}
              >
                {MARKETING.copyBank.calendar}
              </p>
              <p style={{ ...BODY_P, maxWidth: '58ch' }}>
                A dead connection is held back on its own &mdash; the other
                brands, clients, and locations on the calendar keep publishing
                while you reconnect the one that broke.
              </p>
              <FactLine>
                When the reported expiry is far enough away, Publishly warns at
                the 30, 14, 7, 3, and 1-day checkpoints. Shorter connections
                warn at the checkpoints they actually cross.
              </FactLine>
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="rel-status"
        >
          <div className="mk-container">
            <span className="mk-eyebrow">Public proof</span>
            <h2 id="rel-status" className="mk-h2" style={{ marginTop: 14 }}>
              A real status page. Real delivery data.
            </h2>
            <p className="mk-section-lede">
              These numbers come from service checks and finished post
              deliveries. If there is not enough evidence yet, Publishly says
              that plainly instead of showing a made-up 100%.
            </p>
            <StatusLivePanel />
          </div>
        </section>

        {/* ---- 7 · quiet typography block — the page statement ---- */}
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

        {/* ---- 8 · FAQ ---- */}
        <FaqBlock title="Questions operators ask" entries={FAQ} />

        {/* ---- 9 · close ---- */}
        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Stop finding out from your clients.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Connect a channel, schedule a post &amp; read its receipt. Free
                forever plan — no credit card. 7-day trial on every paid plan.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/api-docs" className="mk-btn mk-btn-ghost">
                  Read the API docs
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
