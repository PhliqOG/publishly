import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CSSProperties } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { Byline } from '@gitroom/frontend/components/marketing/geo';
import {
  POST_FAILURE_CATALOG,
  PostFailureClass,
  PostFailureCode,
} from '@gitroom/nestjs-libraries/reliability/post.failure';

// DOCS-AS-CITATION: one static page per real failure code in
// POST_FAILURE_CATALOG. generateStaticParams enumerates the catalog's own
// keys and dynamicParams is off, so this route can only ever exist for a
// code the engine actually emits — nothing here is hand-typed per code.

export function generateStaticParams() {
  return Object.keys(POST_FAILURE_CATALOG).map((code) => ({ code }));
}

export const dynamicParams = false;

function isKnownCode(value: string): value is PostFailureCode {
  return Object.prototype.hasOwnProperty.call(POST_FAILURE_CATALOG, value);
}

const TOTAL = Object.keys(POST_FAILURE_CATALOG).length;

const CLASS_META: Record<
  PostFailureClass,
  { label: string; retryable: string; steps: string[] }
> = {
  recoverable: {
    label: 'Recovers on its own',
    retryable:
      'Yes. This is a transient failure — Publishly retries the post automatically with backoff, so you usually don’t need to do anything.',
    steps: [
      'No action needed — Publishly is already retrying this post with backoff.',
      'Check the post’s delivery receipt if you want to confirm the retry landed.',
      'If it’s still failing after several retries, contact support with the post ID.',
    ],
  },
  user_action_needed: {
    label: 'Needs your action',
    retryable:
      'Only after you act. Fix the connection or setting this code points to, then retry — this class of failure is not retried automatically.',
    steps: [
      'Open the affected connection in Publishly and check its status.',
      'Reconnect the account, grant the missing permission, or fix the workspace setting the reason describes.',
      'Retry the post from its delivery receipt once the connection is healthy again.',
      'Confirm the receipt reaches PUBLISHED before scheduling more posts to that account.',
    ],
  },
  data_problem: {
    label: 'Content problem',
    retryable:
      'Only after you change the content. The platform rejected what was sent, so retrying it unchanged will fail the same way every time.',
    steps: [
      'Open the post and compare it against the reason above.',
      'Edit the media, caption, or settings the platform rejected.',
      'Save your changes and retry.',
    ],
  },
};

const DT: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.4 };
const DD: CSSProperties = {
  margin: 0,
  color: 'var(--mk-text-2)',
  fontSize: 15,
  lineHeight: 1.6,
};

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { code } = await params;
  if (!isKnownCode(code)) {
    return { title: 'Publishing error — Publishly' };
  }
  return {
    title: `${code} — Publishly publishing error`,
    description: POST_FAILURE_CATALOG[code].defaultReason,
    alternates: { canonical: `/docs/errors/${code}` },
  };
}

export default async function ErrorCodePage({ params }: PageProps) {
  const { code } = await params;
  if (!isKnownCode(code)) {
    notFound();
  }

  const definition = POST_FAILURE_CATALOG[code];
  const meta = CLASS_META[definition.failureClass];

  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <Link
                href="/docs/errors"
                className="mk-eyebrow"
                style={{ display: 'block' }}
              >
                Docs · Publishing errors
              </Link>
              <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '20ch' }}>
                {code}
              </h1>
              <p className="mk-section-lede">
                {meta.label} — one of {TOTAL} documented failure codes the
                publishing engine can emit, rendered from the same catalog the
                pipeline imports.
              </p>
              <Byline published="2026-08-10" />
            </div>
          </div>
        </header>

        <section className="mk-section" style={{ paddingTop: 32 }}>
          <div className="mk-container">
            <dl className="mk-rows" style={{ maxWidth: '70ch', margin: 0 }}>
              <div className="mk-row">
                <dt style={DT}>What it means</dt>
                <dd style={DD}>{definition.defaultReason}</dd>
              </div>
              <div className="mk-row">
                <dt style={DT}>Is it retryable?</dt>
                <dd style={DD}>{meta.retryable}</dd>
              </div>
              <div className="mk-row">
                <dt style={DT}>What Publishly does</dt>
                <dd style={DD}>
                  <ul className="mk-points" style={{ margin: 0 }}>
                    <li>
                      Records the failure against the post with the code{' '}
                      <span className="mk-mono">{code}</span>.
                    </li>
                    <li>
                      Fires a signed post.failure webhook carrying the class,
                      code, reason &amp; whether Publishly will retry.
                    </li>
                    <li>
                      Surfaces the reason above directly on the post, so you
                      never have to guess what happened.
                    </li>
                  </ul>
                </dd>
              </div>
              <div className="mk-row">
                <dt style={DT}>What you should do</dt>
                <dd style={DD}>
                  <ul className="mk-points" style={{ margin: 0 }}>
                    {meta.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">See how failures are handled end to end.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                This code is one layer — receipts, retries &amp; webhooks are
                the rest.
              </p>
              <div className="mk-hero-ctas">
                <Link href="/reliability" className="mk-btn mk-btn-primary">
                  The reliability layer
                </Link>
                <Link href="/api-docs" className="mk-btn mk-btn-ghost">
                  API docs
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
