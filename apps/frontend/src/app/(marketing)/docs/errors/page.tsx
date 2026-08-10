import type { Metadata } from 'next';
import Link from 'next/link';
import { CSSProperties } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import {
  POST_FAILURE_CATALOG,
  POST_FAILURE_CLASSES,
  PostFailureClass,
} from '@gitroom/nestjs-libraries/reliability/post.failure';

// DOCS-AS-CITATION: this page renders the engine's real failure catalog,
// imported from the same module the publishing pipeline uses to classify
// failures. Nothing here is hand-copied, so nothing here can drift.

const TOTAL = Object.keys(POST_FAILURE_CATALOG).length;

export const metadata: Metadata = {
  title: 'Publishing error codes',
  description: `Every failed Publishly post carries one of ${TOTAL} documented failure codes — the engine's actual catalog, grouped by what recovers on its own, what needs your action & what is a content problem.`,
};

const CLASS_META: Record<PostFailureClass, { label: string; blurb: string }> = {
  recoverable: {
    label: 'Recovers on its own',
    blurb:
      'Transient failures. Publishly retries these automatically with backoff — usually you do nothing.',
  },
  user_action_needed: {
    label: 'Needs your action',
    blurb:
      'The connection, account or workspace needs a fix from you before the post can be retried.',
  },
  data_problem: {
    label: 'Content problem',
    blurb:
      'The platform rejected the content itself. Change the post — retrying it unchanged fails again.',
  },
};

const codesFor = (cls: PostFailureClass) =>
  Object.entries(POST_FAILURE_CATALOG).filter(
    ([, def]) => def.failureClass === cls
  );

const DT: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.4,
};

const DD: CSSProperties = {
  margin: 0,
  color: 'var(--mk-text-2)',
  fontSize: 15,
  lineHeight: 1.6,
};

export default function ErrorCatalogPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ display: 'block' }}>
                Docs · Publishing errors
              </span>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '16ch' }}
              >
                Every failure has a code.
              </h1>
              <p className="mk-section-lede">
                Every failed Publishly post carries one of these codes — this
                is the engine&rsquo;s actual catalog, rendered from the same
                module the publishing pipeline uses. It cannot drift from what
                the API returns.
              </p>
              <Byline published="2026-08-10" />
            </div>
          </div>
        </header>

        <section className="mk-section" style={{ paddingTop: 32 }}>
          <div className="mk-container">
            <QuickAnswer>
              Every failed Publishly post carries one of {TOTAL} documented
              failure codes, each classed one of three ways: recoverable
              failures retry automatically with backoff, needs-your-action
              failures wait for you to fix the connection or account, and
              content problems need the post itself changed. Each failure also
              fires a signed post.failure webhook carrying the code.
            </QuickAnswer>
          </div>
        </section>

        {POST_FAILURE_CLASSES.map((cls) => {
          const codes = codesFor(cls);
          return (
            <section
              className="mk-section"
              style={{ paddingTop: 24 }}
              key={cls}
              aria-labelledby={`err-${cls}`}
            >
              <div className="mk-container">
                <div style={{ maxWidth: '58ch' }}>
                  <h2 id={`err-${cls}`} className="mk-h2">
                    {CLASS_META[cls].label}.
                  </h2>
                  <p className="mk-section-lede">
                    {CLASS_META[cls].blurb}{' '}
                    <span className="mk-mono">
                      {codes.length} of {TOTAL} codes
                    </span>
                  </p>
                </div>
                <dl className="mk-rows" style={{ margin: '36px 0 0' }}>
                  {codes.map(([code, def]) => (
                    <div className="mk-row" key={code}>
                      <dt style={DT}>
                        <Link
                          href={`/docs/errors/${code}`}
                          className="mk-mono mk-arrow"
                        >
                          {code}
                        </Link>
                      </dt>
                      <dd style={DD}>{def.defaultReason}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          );
        })}

        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">See how failures are handled end to end.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Codes are one layer — receipts, retries &amp; webhooks are the
                rest.
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
