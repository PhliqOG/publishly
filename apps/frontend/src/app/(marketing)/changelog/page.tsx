import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

// DOCS-AS-CITATION: real, dated build history only. No invented version
// numbers, no back-filled feature dates — every bullet below maps to actual
// work in this repo (see git log and data/public-product-facts.json).

export const metadata: Metadata = {
  title: 'Changelog — Publishly',
  description:
    'A pre-launch changelog of what actually shipped in Publishly’s build, dated by day — no invented version numbers, no back-filled feature dates.',
  alternates: { canonical: '/changelog' },
};

type Entry = {
  date: string;
  tags: string[];
  bullets: string[];
};

const ENTRIES: Entry[] = [
  {
    date: '2026-08-10',
    tags: ['Added', 'Changed'],
    bullets: [
      'Failure catalog: every publishing failure now classifies into one of 20 documented codes across three classes — recoverable, needs-your-action, content problem.',
      'Signed post.failure webhooks: a failed post fires an HMAC-signed event carrying the failure class, code, reason & whether Publishly will retry.',
      'Publishing-job receipts: each destination tracks its own delivery state history, with the provider post ID & live URL stored on success.',
      'New pricing model: flat tiers sized by monthly post volume, with unlimited connected accounts on every paid plan — replacing per-account pricing logic.',
      'Marketing site rebuilt around the reliability story: docs-as-citation error pages, this changelog, and platform reference pages generated from the real failure catalog and provider code.',
    ],
  },
  {
    date: '2026-08-09',
    tags: ['Added'],
    bullets: [
      'Initial Publishly platform build, forked from the open-source Postiz engine (AGPL-3.0).',
      'Marketing site stood up alongside the in-app product.',
      'Security hardening pass across authentication, encrypted token storage & scoped API keys.',
      'Background publishing that keeps scheduled posts moving after the browser closes.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ display: 'block' }}>
                Changelog
              </span>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '16ch' }}
              >
                What actually shipped.
              </h1>
              <p className="mk-section-lede">
                Pre-launch changelog — Publishly is in active build toward
                launch. Entries below are dated development milestones, not
                versioned releases, and every bullet maps to real work in this
                repository.
              </p>
              <Byline published="2026-08-10" updated="2026-08-10" />
            </div>
          </div>
        </header>

        <section className="mk-section" style={{ paddingTop: 32 }}>
          <div className="mk-container">
            <QuickAnswer>
              Publishly has not launched yet — this changelog covers two days of
              build so far. 2026-08-09 was the initial platform build on the
              open-source Postiz engine; 2026-08-10 repositioned the product
              around delivery reliability with a documented failure catalog,
              signed failure webhooks, publishing-job receipts, a new flat
              pricing model & a rebuilt marketing site.
            </QuickAnswer>

            <div
              style={{ marginTop: 48, borderTop: '1px solid var(--mk-line)' }}
            >
              {ENTRIES.map((entry) => (
                <article
                  key={entry.date}
                  style={{
                    padding: '40px 0',
                    borderBottom: '1px solid var(--mk-line)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      className="mk-mono"
                      style={{ color: 'var(--mk-text)', fontSize: 14 }}
                    >
                      {entry.date}
                    </span>
                    {entry.tags.map((tag) => (
                      <span key={tag} className="mk-minichip">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <ul className="mk-points" style={{ marginTop: 18 }}>
                    {entry.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <p
              style={{
                marginTop: 32,
                color: 'var(--mk-text-3)',
                fontSize: 14,
                maxWidth: '62ch',
              }}
            >
              No invented version numbers and no back-filled feature dates —
              when a claim here needs backing, it maps to{' '}
              <code className="mk-mono">data/public-product-facts.json</code> or
              the commit history of this repository.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
