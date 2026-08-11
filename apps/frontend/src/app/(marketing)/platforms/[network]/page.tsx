import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  FactLine,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import { POST_FAILURE_CATALOG } from '@gitroom/nestjs-libraries/reliability/post.failure';

// DOCS-AS-CITATION: PLATFORM_SPECS is the one record this reference is built
// from. Every field traces to a real source:
//   - posting: data/public-product-facts.json networks.posting (the 10
//     networks Publishly can publish to)
//   - analytics: data/public-product-facts.json networks.analytics +
//     analytics_excluded_note (Bluesky, Mastodon & personal LinkedIn profiles
//     do not report analytics)
//   - auth: read from each provider's generateAuthUrl() /
//     dynamicAuthenticate() under libraries/nestjs-libraries/src/integrations
//     /social/*.provider.ts. Every provider here drives a real OAuth
//     authorize redirect EXCEPT Bluesky, whose provider collects an app
//     password (bluesky.provider.ts has no OAuth dialog — Bluesky doesn't
//     offer one to third-party posting apps), so it's documented honestly as
//     an app password instead of OAuth.
// docsUrl always points at the platform's own developer documentation, never
// a number Publishly hasn't re-verified.

export type PlatformSlug =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'threads'
  | 'linkedin'
  | 'pinterest'
  | 'bluesky'
  | 'mastodon';

type PlatformSpec = {
  name: string;
  auth: string;
  posting: true;
  analytics: boolean;
  notes: string[];
  docsUrl: string;
};

export const PLATFORM_SPECS: Record<PlatformSlug, PlatformSpec> = {
  instagram: {
    name: 'Instagram',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/',
  },
  facebook: {
    name: 'Facebook',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://developers.facebook.com/',
  },
  tiktok: {
    name: 'TikTok',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://developers.tiktok.com/',
  },
  youtube: {
    name: 'YouTube',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://developers.google.com/youtube',
  },
  x: {
    name: 'X',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://docs.x.com/',
  },
  threads: {
    name: 'Threads',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://developers.facebook.com/docs/threads/',
  },
  linkedin: {
    name: 'LinkedIn',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [
      'Analytics report for LinkedIn Company Pages. Personal LinkedIn profiles do not support analytics.',
    ],
    docsUrl: 'https://learn.microsoft.com/linkedin/',
  },
  pinterest: {
    name: 'Pinterest',
    auth: 'Official OAuth',
    posting: true,
    analytics: true,
    notes: [],
    docsUrl: 'https://developers.pinterest.com/',
  },
  bluesky: {
    name: 'Bluesky',
    auth: 'App password',
    posting: true,
    analytics: false,
    notes: [
      'Bluesky connects with an app password rather than OAuth — Bluesky does not offer a third-party OAuth authorization flow for posting apps.',
      'Bluesky does not report analytics through Publishly.',
    ],
    docsUrl: 'https://docs.bsky.app/',
  },
  mastodon: {
    name: 'Mastodon',
    auth: 'Official OAuth',
    posting: true,
    analytics: false,
    notes: [
      'Mastodon is federated — authorization runs through the OAuth server on the specific instance you connect.',
      'Mastodon does not report analytics through Publishly.',
    ],
    docsUrl: 'https://docs.joinmastodon.org/',
  },
} as const;

const TOTAL_CODES = Object.keys(POST_FAILURE_CATALOG).length;
const LAST_VERIFIED = '2026-08-10';

export function generateStaticParams() {
  return (Object.keys(PLATFORM_SPECS) as PlatformSlug[]).map((network) => ({
    network,
  }));
}

export const dynamicParams = false;

function isKnownSlug(value: string): value is PlatformSlug {
  return Object.prototype.hasOwnProperty.call(PLATFORM_SPECS, value);
}

function SupportBadge({ ok }: { ok: boolean }) {
  return (
    <span
      className="mk-mono"
      style={{ color: ok ? 'var(--mk-blue)' : 'var(--mk-text-3)' }}
    >
      {ok ? 'Supported by Publishly' : 'Not yet supported'}
    </span>
  );
}

function SpecTable({ spec }: { spec: PlatformSpec }) {
  const rows: Array<[string, ReactNode]> = [
    ['Authentication', spec.auth],
    ['Posting via Publishly', <SupportBadge key="posting" ok={spec.posting} />],
    [
      'Analytics via Publishly',
      <SupportBadge key="analytics" ok={spec.analytics} />,
    ],
    [
      'Scheduling',
      'Supported — schedule from the calendar or the public API, same as every other connected account.',
    ],
    [
      'Failure codes',
      <>
        Same shared catalog as every other network —{' '}
        <Link href="/docs/errors" className="mk-arrow">
          the {TOTAL_CODES}-code reference
        </Link>
      </>,
    ],
  ];

  return (
    <div className="mk-tablewrap">
      <table className="mk-table">
        <caption className="mk-visually-hidden">
          {`What Publishly supports for ${spec.name}`}
        </caption>
        <thead>
          <tr>
            <th scope="col">Capability</th>
            <th scope="col" className="mk-table-us">
              {spec.name}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td className="mk-table-us">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PageProps = { params: Promise<{ network: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { network } = await params;
  if (!isKnownSlug(network)) {
    return { title: 'Platform — Publishly' };
  }
  const spec = PLATFORM_SPECS[network];
  return {
    title: `Post to ${spec.name} via API — what Publishly supports`,
    description: `What Publishly supports for ${spec.name}: authentication, posting, analytics & the shared failure catalog — last verified ${LAST_VERIFIED}.`,
    alternates: { canonical: `/platforms/${network}` },
  };
}

export default async function PlatformPage({ params }: PageProps) {
  const { network } = await params;
  if (!isKnownSlug(network)) {
    notFound();
  }

  const spec = PLATFORM_SPECS[network];

  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <Link
                href="/platforms"
                className="mk-eyebrow"
                style={{ display: 'block' }}
              >
                Platforms
              </Link>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '18ch' }}
              >
                Post to {spec.name}.
              </h1>
              <p className="mk-section-lede">
                What Publishly actually supports for {spec.name} today —
                authentication, posting, analytics &amp; how a failed post is
                reported. Nothing below is a roadmap item presented as
                shipped.
              </p>
              <Byline published="2026-08-10" updated="2026-08-10" />
              <p
                className="mk-mono mk-lastchecked"
                style={{ marginTop: 8 }}
              >
                Platform facts last verified: {LAST_VERIFIED}
              </p>
            </div>
          </div>
        </header>

        <section className="mk-section" style={{ paddingTop: 32 }}>
          <div className="mk-container">
            <QuickAnswer>
              Publishly connects to {spec.name} using {spec.auth}, can post
              to it today, and{' '}
              {spec.analytics
                ? 'reports analytics back through Publishly.'
                : 'does not yet report analytics for it through Publishly.'}{' '}
              Any failed {spec.name} post carries one of {TOTAL_CODES}{' '}
              documented failure codes, shared across every connected network.
            </QuickAnswer>

            <SpecTable spec={spec} />

            {spec.notes.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <ul className="mk-points" style={{ maxWidth: '70ch' }}>
                  {spec.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="mk-section mk-section-tint" aria-labelledby="platform-reqs">
          <div className="mk-container">
            <span className="mk-eyebrow">Platform requirements</span>
            <h2 id="platform-reqs" className="mk-h2" style={{ marginTop: 14 }}>
              We don&rsquo;t publish numbers we haven&rsquo;t re-verified.
            </h2>
            <p className="mk-section-lede" style={{ maxWidth: '58ch' }}>
              Media specs, character limits &amp; rate limits vary by API
              version and change without much notice from the platform.
              Rather than print numbers here that go stale, Publishly points
              you at {spec.name}&rsquo;s own developer documentation — the
              detailed per-platform specs on this page are still being
              verified against the current API.
            </p>
            <p style={{ marginTop: 20 }}>
              <Link
                href={spec.docsUrl}
                className="mk-arrow"
                target="_blank"
                rel="noopener noreferrer"
              >
                {spec.name} developer documentation
              </Link>
            </p>
            <FactLine>
              {spec.auth === 'Official OAuth'
                ? `Every post to ${spec.name} authenticates using Official OAuth — Publishly never asks for your platform password to post on your behalf.`
                : `${spec.name} authenticates with an app password rather than OAuth — Publishly only ever asks for that app-specific password, never your main account password.`}
            </FactLine>
          </div>
        </section>

        <section className="mk-ctaclose" style={{ background: 'none' }}>
          <div className="mk-container">
            <div className="mk-cta-panel">
              <h2 className="mk-h2">See every platform Publishly supports.</h2>
              <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
                Ten networks, one API, one shared failure catalog.
              </p>
              <div className="mk-hero-ctas">
                <Link href="/platforms" className="mk-btn mk-btn-primary">
                  All platforms
                </Link>
                <Link href="/docs/errors" className="mk-btn mk-btn-ghost">
                  Failure codes
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
