import Link from 'next/link';
import { ReactNode } from 'react';
import { MarketingFooter, MarketingNav } from './chrome';
import { MARKETING } from './marketing.config';

export function ProductMarketingPage({
  eyebrow,
  title,
  lede,
  items,
  visual,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  items: Array<{ title: string; body: string }>;
  visual?: ReactNode;
}) {
  return (
    <>
      <MarketingNav />
      <main>
        <section style={{ padding: '96px 0 70px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow">{eyebrow}</span>
            <h1 className="mk-h1" style={{ marginTop: 20, maxWidth: '18ch' }}>
              {title}
            </h1>
            <p className="mk-section-lede">{lede}</p>
          </div>
        </section>
        {visual ? (
          <section className="mk-section">
            <div className="mk-container mk-feature-stage">{visual}</div>
          </section>
        ) : null}
        <section className="mk-section">
          <div className="mk-container">
            <div className="mk-cards">
              {items.map((item, index) => (
                <article className="mk-card" key={item.title}>
                  <div className="mk-card-num">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
            <div style={{ marginTop: 42, display: 'flex', gap: 14 }}>
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
                {MARKETING.cta.primary}
              </Link>
              <Link href="/pricing" className="mk-btn mk-btn-ghost">
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
