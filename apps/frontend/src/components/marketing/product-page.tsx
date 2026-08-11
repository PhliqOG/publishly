import Link from 'next/link';
import { ReactNode } from 'react';
import { MarketingFooter, MarketingNav } from './chrome';
import { MARKETING } from './marketing.config';

// Shared editorial template for the six product routes (/publishing
// /calendar /analytics /engagement /api-docs /agencies). Server component —
// MotionRuntime in the marketing layout activates the few .mk-reveal panels
// and the .mk-statement word shift; everything else renders static.
//
// Section families, in order (no two adjacent sections share a composition):
//   1. left-aligned editorial hero (kicker + mk-h2-lg + lede + mono index)
//   2. asymmetric split — product visual beside spotlight copy (if visual)
//   3. technical endpoint table in mono (if endpoints — the api-docs route)
//   4. asymmetric split — heading beside .mk-rows of capabilities (tinted)
//   5. structured info grid — the shared foundations, stated once per page
//   6. quiet typography block — one page-specific statement
//   7. single .mk-cta-panel close
//
// Contract: routes pass { eyebrow, title, lede, items, visual?, spotlight? }
// exactly as before. Optional additions: visualTone ('dark' default keeps the
// night-UI wrapper; 'light' uses the mk-shot-frame), statement (the quiet
// block's line), capabilitiesHeading, and endpoints (mono API table).
export function ProductMarketingPage({
  eyebrow,
  title,
  lede,
  items,
  visual,
  spotlight,
  visualTone = 'dark',
  statement,
  capabilitiesHeading,
  endpoints,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  items: Array<{ title: string; body: string; points?: string[] }>;
  visual?: ReactNode;
  spotlight?: {
    eyebrow?: string;
    heading: string;
    body: string;
    points?: string[];
  };
  visualTone?: 'dark' | 'light';
  statement?: string;
  capabilitiesHeading?: string;
  endpoints?: Array<{ method: string; path: string; note: string }>;
}) {
  const foundations = [
    ...MARKETING.answers.slice(0, 4).map((entry) => ({ tag: 'Delivery', ...entry })),
    ...MARKETING.security.map((entry) => ({ tag: 'Security', ...entry })),
    {
      tag: 'Source',
      title: 'The source, on offer',
      body: MARKETING.openSource.line,
    },
  ];

  const statementText =
    statement ||
    'Whatever the page, the rail is the same — every destination runs as a durable workflow with a deterministic identity & honest per-network status.';

  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        {/* ---- 1 · hero: left-aligned kicker, display heading, lede ---- */}
        <section className="mk-hero">
          <div className="mk-container">
            <span className="mk-eyebrow">{eyebrow}</span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '18ch' }}>
              {title}
            </h1>
            <p className="mk-section-lede" style={{ maxWidth: '54ch' }}>
              {lede}
            </p>
            <div
              style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginTop: 34 }}
            >
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
                {MARKETING.cta.primary}
              </Link>
              <Link href="/pricing" className="mk-arrow">
                See pricing
              </Link>
            </div>
            {/* mono index of what this page covers — plain text, no pills */}
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
              {items.map((item) => (
                <span
                  key={item.title}
                  className="mk-mono"
                  style={{ color: 'var(--mk-text-3)' }}
                >
                  {item.title}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---- 2 · split: the working surface beside spotlight copy ---- */}
        {visual ? (
          <section className="mk-section" style={{ paddingTop: 48 }}>
            <div className="mk-container">
              <div className="mk-split mk-split-rev">
                <div
                  className={
                    visualTone === 'light'
                      ? 'mk-reveal mk-shot-frame'
                      : 'mk-reveal mk-dark'
                  }
                >
                  {visual}
                </div>
                <div>
                  <span className="mk-eyebrow">
                    {spotlight?.eyebrow || 'In the product'}
                  </span>
                  <h2 className="mk-h2" style={{ marginTop: 14 }}>
                    {spotlight?.heading || 'The working surface.'}
                  </h2>
                  <p
                    style={{
                      margin: '16px 0 0',
                      color: 'var(--mk-text-2)',
                      fontSize: 15.5,
                      lineHeight: 1.68,
                      maxWidth: '48ch',
                    }}
                  >
                    {spotlight?.body ||
                      'A closer look at the view this page describes — the same layout you get after connecting your first channel.'}
                  </p>
                  {spotlight?.points && spotlight.points.length > 0 ? (
                    <ul className="mk-points">
                      {spotlight.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ---- 3 · endpoint table: mono rows, api-docs only ---- */}
        {endpoints && endpoints.length > 0 ? (
          <section className="mk-section" style={visual ? undefined : { paddingTop: 48 }}>
            <div className="mk-container">
              <span className="mk-eyebrow">Surface</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                The schedule, callable.
              </h2>
              <p className="mk-section-lede">
                Everything below lives under <code style={{ fontFamily: 'var(--mk-font-mono), monospace', fontSize: '0.92em' }}>/public/v1</code>, authenticates
                with a scoped key &amp; counts against per-workspace rate
                limits.
              </p>
              <div
                style={{
                  marginTop: 40,
                  maxWidth: 880,
                  borderTop: '1px solid var(--mk-line)',
                }}
              >
                {endpoints.map((endpoint) => (
                  <div
                    key={`${endpoint.method} ${endpoint.path}`}
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      gap: '4px 20px',
                      padding: '13px 0',
                      borderBottom: '1px solid var(--mk-line)',
                    }}
                  >
                    <span
                      className="mk-mono"
                      style={{ color: 'var(--mk-blue)', width: '4.6em', flex: 'none' }}
                    >
                      {endpoint.method}
                    </span>
                    <code
                      style={{
                        fontFamily: 'var(--mk-font-mono), monospace',
                        fontSize: 13,
                        letterSpacing: '0.01em',
                        color: 'var(--mk-text)',
                      }}
                    >
                      {endpoint.path}
                    </code>
                    <span
                      style={{
                        flex: '1 1 260px',
                        minWidth: 220,
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: 'var(--mk-text-2)',
                      }}
                    >
                      {endpoint.note}
                    </span>
                  </div>
                ))}
              </div>
              <p
                className="mk-mono"
                style={{ marginTop: 18, color: 'var(--mk-text-3)' }}
              >
                Keys are shown once · scopes are deny-by-default
              </p>
            </div>
          </section>
        ) : null}

        {/* ---- 4 · capabilities: heading column beside the row index ---- */}
        <section className="mk-section mk-section-tint">
          <div className="mk-container">
            <div className="mk-split" style={{ alignItems: 'start' }}>
              <div>
                <span className="mk-eyebrow">Capabilities</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  {capabilitiesHeading || 'Built in, not bolted on.'}
                </h2>
                <p className="mk-section-lede" style={{ fontSize: 16 }}>
                  Each row describes shipping behavior — how{' '}
                  {MARKETING.brand} acts today, not a roadmap.
                </p>
              </div>
              <div className="mk-rows">
                {items.map((item) => (
                  <div className="mk-row" key={item.title}>
                    <h3>{item.title}</h3>
                    <div>
                      <p>{item.body}</p>
                      {item.points && item.points.length > 0 ? (
                        <ul className="mk-points" style={{ margin: '10px 0 0' }}>
                          {item.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- 5 · foundations: structured info grid, stated once ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <span className="mk-eyebrow">Foundations</span>
            <h2 className="mk-h2" style={{ marginTop: 14 }}>
              The same rail underneath.
            </h2>
            <p className="mk-section-lede">
              Every area of {MARKETING.brand} sits on one durable publishing
              engine, so these guarantees hold everywhere — not just on this
              page.
            </p>
            <div
              className="mk-reveal"
              style={{
                marginTop: 44,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                columnGap: 44,
                borderTop: '1px solid var(--mk-line)',
              }}
            >
              {foundations.map((cell, index) => (
                <div
                  key={cell.title}
                  style={{
                    padding: '18px 0 22px',
                    borderBottom: '1px solid var(--mk-line)',
                  }}
                >
                  <span className="mk-mono" style={{ color: 'var(--mk-blue)' }}>
                    {cell.tag} · {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 style={{ fontSize: 16.5, letterSpacing: '-0.015em', margin: '10px 0 0' }}>
                    {cell.title}
                  </h3>
                  <p
                    style={{
                      margin: '7px 0 0',
                      fontSize: 14,
                      lineHeight: 1.62,
                      color: 'var(--mk-text-2)',
                    }}
                  >
                    {cell.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- 6 · quiet typography block: one page-specific statement ---- */}
        <section className="mk-quiet" style={{ textAlign: 'left' }}>
          <div className="mk-container">
            <p className="mk-statement">
              {statementText.split(' ').map((word, index) => (
                <span className="mk-w" key={index}>
                  {word}{' '}
                </span>
              ))}
            </p>
          </div>
        </section>

        {/* ---- 7 · close: the single brand panel ---- */}
        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Connect a channel &amp; fill your first week.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Free forever plan — no credit card. 7-day trial on every paid plan.
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
