import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import {
  Byline,
  FactLine,
  LastChecked,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';

export const metadata: Metadata = {
  title: 'How we compare — comparison methodology',
  description:
    'How Publishly builds its API and pricing comparisons: seven weighted criteria, every competitor number from an official pricing page with a retrieval date, a 30-day stale policy, and a standing commitment to say when a competitor is the better choice.',
  keywords: [
    'publishly comparison methodology',
    'how we compare social media apis',
  ],
  alternates: { canonical: '/methodology/api-comparisons' },
};

// Every source row below is hardcoded from data/claim-provenance.json,
// matching the sourcing approach already used on the /compare pages (no
// runtime JSON import in a server component — the file is the source of
// truth, this table is a rendered copy of it). Re-sync if that file changes.
const CHECKED = '2026-08-10';

const CRITERIA: Array<{ h: string; p: string }> = [
  {
    h: 'Price at fleet scale',
    p: 'Not the entry price — what the bill looks like at 100 connected accounts, computed from each vendor’s own published rate card.',
  },
  {
    h: 'Account scalability',
    p: 'Is there a hard cap? Does the price scale per account, or is there an unlimited-accounts tier — and at what price does it start?',
  },
  {
    h: 'Failure visibility',
    p: 'When a post fails, does the vendor publish that it tells you — a reason, a class, anything beyond a status icon?',
  },
  {
    h: 'Retry safety',
    p: 'Are failed posts retried automatically, and is double-posting on retry a published non-issue or simply unaddressed?',
  },
  {
    h: 'Token health',
    p: 'Does the vendor publish anything about detecting or alerting on an expired or revoked connection before more posts are lost?',
  },
  {
    h: 'API surface',
    p: 'Is the product API-first, or is the API a secondary surface bolted onto a dashboard-first product?',
  },
  {
    h: 'Docs quality',
    p: 'Are pricing, limits, and API behavior published clearly enough to verify a claim without contacting sales?',
  },
];

const SOURCES: Array<{
  competitor: string;
  claim: string;
  url: string;
  publisher: string;
  retrieved: string;
}> = [
  {
    competitor: 'Ayrshare',
    claim: 'Business plan pricing at 100 profiles',
    url: 'https://www.ayrshare.com/pricing',
    publisher: 'Ayrshare (official pricing page)',
    retrieved: '2026-08-10',
  },
  {
    competitor: 'Buffer',
    claim: 'Team plan per-channel rate',
    url: 'https://buffer.com/pricing',
    publisher: 'Buffer (official pricing page)',
    retrieved: '2026-08-10',
  },
  {
    competitor: 'Hootsuite',
    claim: 'Entry plan & Professional plan pricing',
    url: 'https://www.hootsuite.com/plans',
    publisher: 'Hootsuite (official plans page)',
    retrieved: '2026-08-10',
  },
  {
    competitor: 'bundle.social',
    claim: 'PRO tier & free tier limits',
    url: 'https://bundle.social',
    publisher: 'bundle.social (official site)',
    retrieved: '2026-08-10',
  },
  {
    competitor: 'Metricool',
    claim: 'Tiered plans & 50-brand cap',
    url: 'https://metricool.com/pricing',
    publisher: 'Metricool (official pricing page)',
    retrieved: '2026-08-10',
  },
  {
    competitor: 'Upload-Post',
    claim: 'Profile-count tier pricing',
    url: 'https://upload-post.com',
    publisher: 'Upload-Post (vendor llms-full.txt)',
    retrieved: '2026-08-10',
  },
  {
    competitor: 'Meta / LinkedIn / TikTok',
    claim: 'Access & refresh token expiry',
    url: 'https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived',
    publisher: 'Meta / LinkedIn / TikTok developer docs',
    retrieved: '2026-08-10',
  },
];

export default function ApiComparisonsMethodologyPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Methodology
            </span>
            <h1 className="mk-h2-lg" style={{ marginTop: 18, maxWidth: '22ch' }}>
              How we compare.
            </h1>
            <p className="mk-section-lede">
              Every comparison page on this site follows the same rule set:
              seven weighted criteria, official sources only, dated retrieval,
              and an honest answer when a competitor is the better fit.
            </p>
            <QuickAnswer>
              Publishly’s comparison pages weigh seven criteria — price at
              fleet scale, account scalability, failure visibility, retry
              safety, token health, API surface, and docs quality. Every
              competitor number is pulled from that vendor’s official pricing
              page, dated at retrieval, and re-verified every 30 days. When a
              competitor is the better choice for a use case, the page says
              so.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
          </div>
        </header>

        <section className="mk-section" aria-labelledby="mth-criteria">
          <div className="mk-container">
            <h2 id="mth-criteria" className="mk-h2">
              What we weigh.
            </h2>
            <p className="mk-section-lede">
              These seven criteria are the same set on every comparison page —
              nothing is added or dropped to flatter a particular matchup.
            </p>
            <div className="mk-rows" style={{ marginTop: 32 }}>
              {CRITERIA.map((c) => (
                <div className="mk-row" key={c.h}>
                  <h3>{c.h}</h3>
                  <p>{c.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="mth-sources">
          <div className="mk-container">
            <h2 id="mth-sources" className="mk-h2">
              Every number, sourced and dated.
            </h2>
            <p className="mk-section-lede">
              This is the full source list behind every competitor claim
              published on the site — the same list any comparison page draws
              from.
            </p>
            <FactLine>
              Every competitor number traces to an official pricing page,
              retrieved and dated — not a review site, a forum post, or an
              estimate.
            </FactLine>
            <div className="mk-tablewrap" style={{ marginTop: 28 }}>
              <table className="mk-table">
                <caption className="mk-visually-hidden">
                  Source URL, publisher and retrieval date for every
                  competitor claim
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Competitor</th>
                    <th scope="col">Claim</th>
                    <th scope="col">Source</th>
                    <th scope="col">Publisher</th>
                    <th scope="col">Retrieved</th>
                  </tr>
                </thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr key={s.url + s.claim}>
                      <th scope="row">{s.competitor}</th>
                      <td>{s.claim}</td>
                      <td>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--mk-blue)',
                            textDecoration: 'underline',
                            textUnderlineOffset: 3,
                          }}
                        >
                          {s.url.replace(/^https?:\/\//, '')}
                        </a>
                      </td>
                      <td>{s.publisher}</td>
                      <td className="mk-mono" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {s.retrieved}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <LastChecked date={CHECKED} />
          </div>
        </section>

        <section className="mk-section" aria-labelledby="mth-stale">
          <div className="mk-container">
            <h2 id="mth-stale" className="mk-h2">
              Numbers go stale. We re-check them.
            </h2>
            <p className="mk-section-lede">
              Pricing pages change without notice, so every claim carries an
              expiry, not just a retrieval date.
            </p>
            <FactLine>
              Competitor pricing is re-verified every 30 days; general
              platform facts (like token-expiry windows) are re-verified every
              90 days. A page whose claims pass their window gets re-checked
              before the next rebuild.
            </FactLine>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              The commitment.
            </h2>
            <p>
              When a competitor is the better choice for a use case, we say so
              on the page. Every comparison names what the other tool is
              genuinely good at — enterprise governance, a broader network
              list, a polished consumer app, a lower price at a small scale —
              before making the case for where Publishly fits instead.
            </p>
          </div>
        </section>

        <section style={{ padding: '8px 0 112px' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">See the comparisons this builds.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Every page follows this same methodology — pricing, caps, and
                failure visibility, side by side.
              </p>
              <div className="mk-hero-ctas">
                <Link href="/compare" className="mk-btn mk-btn-primary">
                  All comparisons
                </Link>
                <Link
                  href={MARKETING.authRegister}
                  className="mk-btn mk-btn-ghost"
                >
                  {MARKETING.cta.primary}
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
