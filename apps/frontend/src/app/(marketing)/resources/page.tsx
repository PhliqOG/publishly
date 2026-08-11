import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import { Byline, QuickAnswer } from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'Resources for multi-brand social posting',
  description:
    'Guides for teams comparing social posting tools: the best posting APIs for multi-brand operators, the best Ayrshare alternatives, and the best flat-pricing options — every number sourced from an official pricing page and dated.',
  keywords: [
    'social media posting api resources',
    'social media scheduler comparison guides',
    'multi-brand posting tools',
  ],
  alternates: { canonical: '/resources' },
};

const ARTICLES = [
  {
    href: '/resources/best-social-posting-apis-2026',
    name: 'Best social media posting APIs for multi-brand operators (2026)',
    sub: 'Publishly, Ayrshare, Upload-Post, Buffer & Metricool — pricing, account caps and failure handling, side by side.',
  },
  {
    href: '/resources/best-ayrshare-alternatives-2026',
    name: 'Best Ayrshare alternatives (2026)',
    sub: 'Four alternatives to Ayrshare’s per-profile billing, each with an honest fit note on who it’s actually for.',
  },
  {
    href: '/resources/best-flat-pricing-posting-apis',
    name: 'Best flat-pricing & unlimited-account posting APIs (2026)',
    sub: 'Tools that stop billing per account — plus the honest caveat about where flat pricing isn’t the cheapest.',
  },
  {
    href: '/methodology/api-comparisons',
    name: 'How we compare',
    sub: 'Every competitor number on this site traces to an official pricing page, dated, re-verified after 30 days.',
  },
];

export default function ResourcesPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Resources
            </span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '22ch' }}>
              Resources for multi-brand operators.
            </h1>
            <p className="mk-section-lede">
              Guides for teams choosing a social posting tool for a growing
              roster of brands, clients, or locations — written from official
              pricing pages, not vendor claims, with a retrieval date on every
              number.
            </p>
            <QuickAnswer>
              Three guides live here: the best posting APIs overall, the best
              Ayrshare alternatives, and the best flat-pricing, unlimited-account
              options. Every competitor number traces to an official pricing
              page and a documented retrieval date — see how we compare for the
              full methodology.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="res-articles">
          <div className="mk-container">
            <h2 id="res-articles" className="mk-h2">
              Pick a guide.
            </h2>
            <p className="mk-section-lede">
              Each guide uses the same sourcing rules: official pricing pages
              only, a dated retrieval, and strengths-first entries for every
              tool — including the ones that aren’t Publishly.
            </p>
            <div className="mk-cards">
              {ARTICLES.map((a, i) => (
                <Link key={a.href} href={a.href} className="mk-card">
                  <span className="mk-card-num">0{i + 1}</span>
                  <h3>{a.name}</h3>
                  <p>{a.sub}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">Read the numbers, then run your own.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Plans are sized by how much you post, not how many brands,
                clients, or locations you run.
              </p>
              <div className="mk-hero-ctas">
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-primary"
                >
                  {MARKETING.cta.primary}
                </Link>
                <Link href="/compare" className="mk-btn mk-btn-ghost">
                  See all comparisons
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
