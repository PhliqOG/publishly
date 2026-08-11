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

// The proof page for "Nothing fails silently." The failure taxonomy below is
// rendered from the same TypeScript catalog the publishing engine imports
// (POST_FAILURE_CATALOG) — the page structurally cannot drift from the code.
// Every claim maps to data/public-product-facts.json.

export const metadata: Metadata = {
  title: {
    absolute:
      'Reliability — delivery receipts, failure webhooks & safe retries | Publishly',
  },
  description:
    'How do you know when a scheduled post fails? Publishly answers with a delivery receipt per destination, 20 documented failure codes, a signed post.failure webhook the moment it happens & retries that can never double-post.',
  alternates: { canonical: '/reliability' },
};

/* ---------------------------------------------------------------- data */

const CODES = Object.keys(POST_FAILURE_CATALOG) as PostFailureCode[];

const CLASS_META: Record<PostFailureClass, { label: string; blurb: string }> = {
  recoverable: {
    label: 'Recovers on its own',
    blurb:
      'Transient trouble — rate limits, platform blips, network errors. Publishly retries these automatically with backoff. You’re informed, never summoned.',
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

// Example receipt — field-for-field the PublishingJob columns the status
// endpoint reports: state, providerPostId, providerUrl, attempts, completedAt.
const RECEIPT_JSON = `{
  "state": "PUBLISHED",
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
    id: '9b1f6d2e-4a53-4f1d-8c07-52d6a90f4a31',
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
  'X-Publishly-Event-Id: 9b1f6d2e-4a53-4f1d-8c07-52d6a90f4a31',
  'X-Publishly-Timestamp: 1786372304',
  'X-Publishly-Signature: t=1786372304,v1=6e0fc19b…a41c',
].join('\n');

const STATEMENT =
  'Aggressive about telling you. Conservative about touching the platform twice. Every guarantee on this page is that one sentence, applied.';

const FAQ = [
  {
    q: 'How do I know when a scheduled post fails?',
    a: 'You’re told the moment it happens. The post’s delivery receipt flips to RETRYING or FAILED with a plain-English reason and one of 20 documented failure codes, and a signed post.failure webhook fires to your endpoint with the class, code, reason, and whether Publishly will retry. You can also poll GET /public/v1/posts/:id/status at any time.',
  },
  {
    q: 'What happens when a social media API token expires?',
    a: 'Publishly refreshes tokens automatically on a schedule. The moment a refresh fails you get an in-app alert and an email, and the account is flagged and excluded from delivery — so no further posts are lost while you reconnect it.',
  },
  {
    q: 'Does Publishly retry failed posts automatically?',
    a: 'Transient failures — rate limits, platform outages, network errors — retry automatically with backoff from 15 seconds to 30 minutes. Failures that need your action or a content change are held with an exact reason instead of being retried blindly, and an hourly sweeper re-queues missed slots.',
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
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '15ch' }}>
              {MARKETING.copyBank.silent}
            </h1>
            <p className="mk-section-lede" style={{ maxWidth: '56ch' }}>
              You&rsquo;re running 50 brands across a couple hundred accounts
              &mdash; you can&rsquo;t watch them all, and you shouldn&rsquo;t
              have to. When a post dies at 2am, you find out from a webhook
              &mdash; not from your client. Every delivery here is receipted,
              every failure carries a documented reason &amp; nothing is
              retried behind your back.
            </p>
            <QuickAnswer>
              Every Publishly post runs as a tracked delivery with a full state
              history and a receipt you can query by API. When a post fails, it
              carries one of {CODES.length} documented failure codes and fires
              a signed post.failure webhook the moment it happens. Transient
              failures retry automatically with backoff &mdash; and the publish
              call fires exactly once, so a retry can never double-post.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
            <div
              style={{
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                alignItems: 'center',
                marginTop: 30,
              }}
            >
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
                {MARKETING.cta.primary}
              </Link>
              <Link href="/api-docs" className="mk-arrow">
                Read the API docs
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
                'The failure catalog',
                'Delivery receipts',
                'Failure webhooks',
                'Safe retries',
                'Token health',
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
              This is the actual failure catalog the engine ships &mdash; this
              table is rendered from the same TypeScript file the publisher
              imports, not a marketing rewrite. Every failed post carries
              exactly one of these codes, classed by what happens next.
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
                  <h3 style={{ margin: 0, fontSize: 19, letterSpacing: '-0.015em' }}>
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
                <div style={{ marginTop: 18, borderTop: '1px solid var(--mk-line)' }}>
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
                        style={{ color: 'var(--mk-text)', flex: 'none', width: '19em' }}
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
        <section className="mk-section mk-section-tint" aria-labelledby="rel-receipts">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Delivery receipts</span>
                <h2 id="rel-receipts" className="mk-h2" style={{ marginTop: 14 }}>
                  A receipt for every destination.
                </h2>
                <p style={BODY_P}>
                  Each destination runs as its own tracked delivery with a full
                  state history. A post to 6 networks is 6 receipts &mdash; one
                  can fail &amp; retry while the other 5 stay published.
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
              The failure calls you.
            </h2>
            <p className="mk-section-lede">
              Two events matter to an operator: post.published when the
              platform confirms, and post.failure the moment a delivery fails
              &mdash; carrying the class, the code, the reason &amp; whether a
              retry is already coming. This is the actual post.failure payload:
            </p>
            <div className="mk-term mk-reveal" style={{ marginTop: 36, maxWidth: 760 }}>
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
                  title: 'HMAC-SHA256, verifiable & replay-proof',
                  body: 'Every delivery is signed over timestamp.body with your endpoint’s signing secret. The X-Publishly-Signature header carries t= and v1= so you can verify the payload & reject replays before trusting a byte.',
                },
                {
                  tag: 'Retried',
                  title: '3 delivery attempts with backoff',
                  body: 'A receiver that’s down gets three attempts with backoff. If all three fail, the failure event still holds its delivery state — the record of what happened never depends on your endpoint being up.',
                },
                {
                  tag: 'Ledgered',
                  title: 'Every attempt, on the record',
                  body: 'Each attempt is written to a per-attempt delivery ledger — status code, duration & error — so “did you actually call us?” is answered with rows, not recollection.',
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
              Publishly signs every webhook with HMAC-SHA256, attempts delivery
              3 times with backoff, and records every attempt in a per-attempt
              delivery ledger.
            </FactLine>
          </div>
        </section>

        {/* ---- 5 · retries — heading column beside the row index ---- */}
        <section className="mk-section mk-section-tint" aria-labelledby="rel-retries">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Retries</span>
                <h2 id="rel-retries" className="mk-h2" style={{ marginTop: 14 }}>
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
                    body: 'Transient failures — rate limits, platform outages, network errors — retry automatically with backoff from 15 seconds up to 30 minutes. Each attempt lands in the receipt’s state history.',
                  },
                  {
                    title: 'The publish call fires exactly once',
                    body: 'Queueing, token refresh & status checks retry freely. The one call that actually creates the post is never wrapped in a retry — so a retry is structurally incapable of double-posting.',
                  },
                  {
                    title: 'Unconfirmed is a state, not a guess',
                    body: 'If a platform goes dark mid-publish, the outcome is marked outcome_unknown and you’re told to check the account before retrying. Ambiguity is surfaced — never silently replayed.',
                  },
                  {
                    title: 'An hourly sweeper catches missed slots',
                    body: 'If a slot is missed — a deploy, a restart, a bad hour — the sweeper re-queues it within the hour, for any channel that’s still healthy and any slot from the last two days.',
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
              Publishly retries transient failures automatically with backoff
              from 15 seconds to 30 minutes, but the publish call itself fires
              exactly once &mdash; a retry can never duplicate a post.
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
                Tokens on the major platforms die on a timer &mdash; roughly 60
                days on several of them. Publishly refreshes every connection
                automatically on schedule, before delivery ever needs it.
              </p>
              <p style={{ ...BODY_P, maxWidth: '58ch' }}>
                The moment a refresh fails, you get an in-app alert &amp; an
                email &mdash; not a red icon you discover next week. The
                account is flagged &amp; excluded from delivery, so its queue
                stops cleanly instead of posting into nothing.
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
                A dead connection is quarantined to its own account &mdash; the
                other brands &amp; clients on the calendar keep publishing
                while you reconnect the one that broke.
              </p>
              <p
                className="mk-mono"
                style={{ margin: '24px 0 0', color: 'var(--mk-text-3)' }}
              >
                Coming, not shipped yet: expiry warnings days ahead of token
                death.
              </p>
              <FactLine>
                When a token refresh fails, Publishly alerts you in-app and by
                email immediately, flags the account, and excludes it from
                delivery so the rest of the calendar keeps publishing.
              </FactLine>
            </div>
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
                Connect a channel, schedule a post &amp; read its receipt.
                Free forever plan — no credit card. 7-day trial on every paid plan.
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
