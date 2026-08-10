import Link from 'next/link';
import { ReactNode } from 'react';
import { MarketingFooter, MarketingNav } from './chrome';
import { MARKETING } from './marketing.config';

// Shared Night Rail template for the six product routes (/publishing
// /calendar /analytics /engagement /api-docs /agencies). Server component —
// scroll reveals are activated by MotionRuntime in the marketing layout,
// hero entrances by the pure-CSS mk-enter keyframes (both carry
// prefers-reduced-motion variants in marketing.css).
//
// Contract: routes pass { eyebrow, title, lede, items, visual? }. Two
// optional extensions let a route go denser without breaking the others:
// items[].points (extra bullet rows inside a tile) and spotlight (copy
// column rendered beside the visual instead of a full-width visual).
export function ProductMarketingPage({
  eyebrow,
  title,
  lede,
  items,
  visual,
  spotlight,
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
}) {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        {/* ---- hero: eyebrow, h2-scale heading, lede, CTAs, mono fact rail ---- */}
        <section className="mk-hero">
          <div className="mk-container" style={{ position: 'relative' }}>
            <div className="mk-enter mk-enter-1">
              <span className="mk-eyebrow">{eyebrow}</span>
            </div>
            <h1
              className="mk-h2 mk-enter mk-enter-2"
              style={{ marginTop: 16, maxWidth: '26ch' }}
            >
              {title}
            </h1>
            <p className="mk-section-lede mk-enter mk-enter-3">{lede}</p>
            <div className="mk-hero-ctas mk-enter mk-enter-4">
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
            <div className="mk-hero-facts mk-enter mk-enter-5">
              {items.map((item) => (
                <span className="mk-hero-fact" key={item.title}>
                  {item.title}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---- visual: spotlight two-column when copy is supplied ---- */}
        {visual ? (
          <section className="mk-section">
            <div className="mk-container">
              {spotlight ? (
                <div className="mk-tabpanel" style={{ paddingTop: 0 }}>
                  <div className="mk-tabpanel-copy mk-reveal">
                    <span className="mk-eyebrow">
                      {spotlight.eyebrow || 'In the product'}
                    </span>
                    <h2 className="mk-h2" style={{ marginTop: 14 }}>
                      {spotlight.heading}
                    </h2>
                    <p>{spotlight.body}</p>
                    {spotlight.points && spotlight.points.length > 0 ? (
                      <ul className="mk-points">
                        {spotlight.points.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="mk-reveal" data-delay="120">
                    {visual}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mk-reveal">
                    <span className="mk-eyebrow">In the product</span>
                  </div>
                  <div
                    className="mk-reveal"
                    data-delay="80"
                    style={{ marginTop: 18 }}
                  >
                    {visual}
                  </div>
                </>
              )}
            </div>
          </section>
        ) : null}

        {/* ---- capabilities: bento of feature tiles ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Capabilities</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Built in, not bolted on.
              </h2>
            </div>
            <div className="mk-bento">
              {items.map((item, index) => (
                <article
                  className="mk-tile mk-reveal"
                  key={item.title}
                  data-delay={index * 80}
                >
                  <span className="mk-tile-label">
                    {eyebrow} {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  {item.points && item.points.length > 0 ? (
                    <ul className="mk-points" style={{ margin: '4px 0 0' }}>
                      {item.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---- foundations: the shared rail, stated once per page ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Foundations</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                The same rail underneath.
              </h2>
              <p className="mk-section-lede">
                Each area of {MARKETING.brand} sits on the same durable
                publishing engine, so these guarantees hold everywhere — not
                just on this page.
              </p>
            </div>
            <div className="mk-duo">
              <div className="mk-duo-cell mk-reveal">
                <h3>Delivery stays boring</h3>
                <p>
                  Every destination runs as a durable workflow with a
                  deterministic identity &amp; honest per-network status.
                </p>
                <ul className="mk-points" style={{ margin: 0 }}>
                  {MARKETING.reliability.map((entry) => (
                    <li key={entry.title}>{entry.title}</li>
                  ))}
                </ul>
              </div>
              <div className="mk-duo-cell mk-reveal" data-delay="120">
                <h3>Security by default</h3>
                <p>
                  Official OAuth connections, tokens encrypted at rest &amp;
                  scoped keys you can revoke at any time.
                </p>
                <ul className="mk-points" style={{ margin: 0 }}>
                  {MARKETING.security.map((entry) => (
                    <li key={entry.title}>{entry.title}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ---- closing band CTA ---- */}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-band mk-reveal">
              <div>
                <span className="mk-eyebrow">Get started</span>
                <h2
                  style={{
                    fontSize: 'clamp(1.45rem, 2.4vw, 1.9rem)',
                    marginTop: 10,
                  }}
                >
                  Connect a channel &amp; fill your first week.
                </h2>
                <p>Free plan included — no card required to start.</p>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                  flex: 'none',
                }}
              >
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
