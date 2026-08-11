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
import { POST_FAILURE_CATALOG } from '@gitroom/nestjs-libraries/reliability/post.failure';

// DOCS-AS-CITATION: this hub lists the same 10 networks as
// data/public-product-facts.json networks.posting, in the same order as
// MARKETING.networks. Analytics support mirrors networks.analytics +
// analytics_excluded_note (Bluesky, Mastodon & personal LinkedIn profiles do
// not report analytics). Per-platform detail — auth mechanism, failure
// codes, developer docs — lives on each /platforms/[network] page, built
// from the real provider files under libraries/nestjs-libraries/src/
// integrations/social/.

export const metadata: Metadata = {
  title: 'Platforms',
  description:
    'What Publishly actually supports on each of the 10 networks it connects to — authentication, posting, analytics & the shared failure catalog.',
  alternates: { canonical: '/platforms' },
};

const NETWORKS: Array<{
  slug: string;
  name: string;
  analytics: boolean;
  color: string;
}> = [
  { slug: 'instagram', name: 'Instagram', analytics: true, color: 'var(--net-instagram)' },
  { slug: 'facebook', name: 'Facebook', analytics: true, color: 'var(--net-facebook)' },
  { slug: 'tiktok', name: 'TikTok', analytics: true, color: 'var(--net-tiktok)' },
  { slug: 'youtube', name: 'YouTube', analytics: true, color: 'var(--net-youtube)' },
  { slug: 'x', name: 'X', analytics: true, color: 'var(--net-x)' },
  { slug: 'threads', name: 'Threads', analytics: true, color: 'var(--net-threads)' },
  { slug: 'linkedin', name: 'LinkedIn', analytics: true, color: 'var(--net-linkedin)' },
  { slug: 'pinterest', name: 'Pinterest', analytics: true, color: 'var(--net-pinterest)' },
  { slug: 'bluesky', name: 'Bluesky', analytics: false, color: 'var(--net-bluesky)' },
  { slug: 'mastodon', name: 'Mastodon', analytics: false, color: 'var(--net-mastodon)' },
];

const ANALYTICS_COUNT = NETWORKS.filter((n) => n.analytics).length;
const TOTAL_CODES = Object.keys(POST_FAILURE_CATALOG).length;

const CARD_DOT: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: '50%',
  display: 'inline-block',
  flex: 'none',
};

export default function PlatformsHubPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ display: 'block' }}>
                Platforms
              </span>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '18ch' }}
              >
                Ten networks. One honest list.
              </h1>
              <p className="mk-section-lede">
                Publishly posts to 10 networks through each platform&rsquo;s
                own official connection method. This page is the index —
                every network links through to exactly what Publishly
                supports for it today, nothing implied.
              </p>
              <Byline published="2026-08-10" />
            </div>
          </div>
        </header>

        <section className="mk-section" style={{ paddingTop: 32 }}>
          <div className="mk-container">
            <QuickAnswer>
              Publishly can post to all 10 connected networks — Instagram,
              Facebook, TikTok, YouTube, X, Threads, LinkedIn, Pinterest,
              Bluesky &amp; Mastodon. {ANALYTICS_COUNT} of the 10 also report
              analytics back through Publishly; Bluesky and Mastodon don&rsquo;t
              publish analytics APIs, and LinkedIn analytics cover Company
              Pages, not personal profiles. Every failed post on any network
              carries the same shared failure catalog.
            </QuickAnswer>

            <div className="mk-cards" style={{ marginTop: 56 }}>
              {NETWORKS.map((network) => (
                <Link
                  key={network.slug}
                  href={`/platforms/${network.slug}`}
                  className="mk-card"
                  style={{ display: 'block' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 4,
                    }}
                  >
                    <i
                      style={{ ...CARD_DOT, background: network.color }}
                      aria-hidden="true"
                    />
                    <span className="mk-card-num">Posting supported</span>
                  </div>
                  <h3>{network.name}</h3>
                  <p>
                    {network.analytics
                      ? 'Posting & analytics via Publishly.'
                      : 'Posting via Publishly. Analytics not reported for this network.'}
                  </p>
                  <p style={{ marginTop: 14 }}>
                    <span className="mk-arrow">See {network.name} details</span>
                  </p>
                </Link>
              ))}
            </div>

            <p
              style={{
                marginTop: 44,
                color: 'var(--mk-text-3)',
                fontSize: 14,
                maxWidth: '62ch',
              }}
            >
              Auth mechanism, exact analytics scope &amp; a link to each
              platform&rsquo;s own developer documentation live on the
              individual platform page — this hub only claims what&rsquo;s
              true across all ten: posting works, and every failure is
              classified the same way.
            </p>
          </div>
        </section>

        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">One failure catalog, every platform.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                See the {TOTAL_CODES}-code reference every network shares.
              </p>
              <div className="mk-hero-ctas">
                <Link href="/docs/errors" className="mk-btn mk-btn-primary">
                  Failure codes
                </Link>
                <Link href="/reliability" className="mk-btn mk-btn-ghost">
                  The reliability layer
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
