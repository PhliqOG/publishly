import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Compose once, schedule the week & let a durable workflow deliver. Every capability listed here ships in the product today.',
  alternates: { canonical: '/features' },
};

// The page follows the actual job: compose → schedule → deliver, then the
// structure around the posts. Rows & splits, no card grids.

const COMPOSE = [
  {
    h: 'Per-network variants',
    p: 'Write the core message once, then tailor the caption, tags & first comment for each destination. The variant travels with the post — nothing gets retyped.',
  },
  {
    h: 'Live previews',
    p: 'See the post in each platform’s shape while you write it, not after it publishes.',
  },
  {
    h: 'Limits, checked early',
    p: 'Character counts & media rules are validated before you schedule, so a post never fails for a reason the composer could see coming.',
  },
  {
    h: 'First comments',
    p: 'Publish the first comment together with the post on networks that support it. Where a network doesn’t, the option isn’t shown.',
  },
  {
    h: 'Repeat work, shortened',
    p: 'Drafts, tags, saved channel sets & signatures keep the second week faster than the first.',
  },
];

const SCHEDULE = [
  {
    h: '3 altitudes, one schedule',
    p: 'Month for the plan, week for the rhythm, day for the detail — the same posts at 3 zoom levels.',
  },
  {
    h: 'Drag & drop',
    p: 'Reschedule by dragging a post to its new slot. The publishing pipeline follows — no orphaned jobs, no stale queues.',
  },
  {
    h: 'Timezone-aware slots',
    p: 'Every slot is stored with its timezone, so the calendar means what it says wherever your team signs in.',
  },
  {
    h: 'CSV import, with receipts',
    p: 'Load a CSV, preview the validation, commit when it’s clean. Every rejected row tells you why before anything is written.',
  },
  {
    h: 'Bulk edits',
    p: 'Shift a whole range of posts or clear it in one action instead of fifty.',
  },
];

const DELIVER = [
  {
    h: 'Durable workflows',
    p: 'Each destination runs as its own durable workflow. It survives crashes, restarts & deploys — mid-publish included.',
  },
  {
    h: 'No double posts',
    p: 'Deterministic workflow identities make retries converge instead of repeating. The dangerous step simply isn’t repeatable.',
  },
  {
    h: 'Partial success',
    p: 'A post to 6 networks is 6 deliveries. If one fails, the other 5 stay published & only the failed one retries.',
  },
  {
    h: 'Failures you can see',
    p: 'A failed post gets a red ring on the calendar and the platform’s own error on hover, plus an in-app alert and email. Full state history and attempt count live on the delivery receipt via the API.',
  },
  {
    h: 'The sweeper',
    p: 'An hourly sweeper re-queues posts missed in the last two days on healthy channels. If a channel needs reconnecting, its posts stop and tell you why instead of piling up silently.',
  },
];

const AROUND = [
  {
    h: '10 networks, first-class',
    p: 'Instagram, Facebook, TikTok, YouTube, X, Threads, LinkedIn, Pinterest, Bluesky & Mastodon — all through official APIs, plus 20+ more publishing targets from the engine.',
  },
  {
    h: 'Workspaces & roles',
    p: 'Channels, media, keys & analytics stay isolated per workspace, with roles & invitations deciding who can do what.',
  },
  {
    h: 'Audit log',
    p: 'Team invitations, channel changes, key management & bulk operations are recorded per workspace — who, what, when, from where.',
  },
  {
    h: 'Analytics with receipts',
    p: 'Platform-reported metrics only, snapshotted as they refresh. Anything a network doesn’t expose is labelled unavailable — never estimated.',
  },
  {
    h: 'A capability-gated inbox',
    p: 'Comments from connected channels in one queue, replies through the same official APIs. Channels that can’t support it say so.',
  },
  {
    h: 'Scoped API keys',
    p: 'Hashed, scope-limited keys you can revoke at any time. Scheduling, media, integrations and analytics — all scriptable with the same scoped keys.',
  },
  {
    h: 'Webhooks',
    p: 'Outgoing webhooks fire on publishing events, so your own systems stay in the loop.',
  },
  {
    h: 'Open source',
    p: 'The engine is AGPL-3.0 & the corresponding source of the running service is available to every user.',
  },
];

const Rows = ({ items }: { items: Array<{ h: string; p: string }> }) => (
  <div className="mk-rows">
    {items.map((item) => (
      <div className="mk-row" key={item.h}>
        <h3>{item.h}</h3>
        <p>{item.p}</p>
      </div>
    ))}
  </div>
);

export default function FeaturesPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ display: 'block' }}>
                Features
              </span>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '13ch' }}
              >
                Compose. Schedule. Deliver.
              </h1>
              <p className="mk-section-lede">
                The whole job in 3 moves. Everything on this page ships in
                the product today — where a network limits a feature, the
                interface says so instead of pretending.
              </p>
            </div>
          </div>
        </header>

        <section className="mk-section" aria-labelledby="ft-compose">
          <div className="mk-container">
            <div className="mk-split">
              <div>
                <span className="mk-num" aria-hidden>
                  01
                </span>
                <h2 id="ft-compose" className="mk-h2" style={{ marginTop: 12 }}>
                  Compose once, in every voice.
                </h2>
                <p className="mk-section-lede">
                  One draft carries the message. Captions, tags & first
                  comments adapt per network — checked against each
                  platform&rsquo;s real limits before you schedule.
                </p>
              </div>
              <Rows items={COMPOSE} />
            </div>
          </div>
        </section>

        <section
          className="mk-section mk-section-tint"
          aria-labelledby="ft-schedule"
        >
          <div className="mk-container">
            <div className="mk-split mk-split-rev">
              <div style={{ maxWidth: '46ch' }}>
                <span className="mk-num" aria-hidden>
                  02
                </span>
                <h2
                  id="ft-schedule"
                  className="mk-h2"
                  style={{ marginTop: 12 }}
                >
                  Schedule the week in one sitting.
                </h2>
                <p className="mk-section-lede">
                  Month, week & day views over one calendar. Move a slot &
                  the pipeline moves with it.
                </p>
              </div>
              <Rows items={SCHEDULE} />
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="ft-deliver">
          <div className="mk-container">
            <div style={{ maxWidth: '58ch' }}>
              <span className="mk-num" aria-hidden>
                03
              </span>
              <h2 id="ft-deliver" className="mk-h2" style={{ marginTop: 12 }}>
                Delivery you don&rsquo;t babysit.
              </h2>
              <p className="mk-section-lede">
                Publishing runs on a durable workflow engine, so crashes, rate
                limits & expired tokens stay boring.
              </p>
            </div>
            <div style={{ marginTop: 44 }}>
              <Rows items={DELIVER} />
            </div>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="ft-around">
          <div className="mk-container">
            <div style={{ maxWidth: '58ch' }}>
              <span className="mk-num" aria-hidden>
                04
              </span>
              <h2 id="ft-around" className="mk-h2" style={{ marginTop: 12 }}>
                Around the posts.
              </h2>
              <p className="mk-section-lede">
                The structure that keeps a shared calendar honest — for one
                brand or forty.
              </p>
            </div>
            <div
              className="mk-reveal"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                columnGap: 56,
                marginTop: 48,
              }}
            >
              {AROUND.map((item) => (
                <div
                  key={item.h}
                  style={{
                    borderTop: '1px solid var(--mk-line)',
                    padding: '20px 0 26px',
                  }}
                >
                  <h3 style={{ fontSize: 17, letterSpacing: '-0.015em' }}>
                    {item.h}
                  </h3>
                  <p
                    style={{
                      color: 'var(--mk-text-2)',
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      margin: '8px 0 0',
                    }}
                  >
                    {item.p}
                    {item.h === 'Open source' && (
                      <>
                        {' '}
                        <Link
                          href="/source"
                          style={{
                            color: 'var(--mk-blue)',
                            textDecoration: 'underline',
                            textUnderlineOffset: 3,
                          }}
                        >
                          {MARKETING.openSource.linkLabel}
                        </Link>
                        .
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: '0 0 104px' }}>
          <div className="mk-container">
            <div className="mk-band">
              <div>
                <h2 style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)' }}>
                  See the board clear itself.
                </h2>
                <p>
                  Create the workspace first — choose a plan when a channel is
                  ready to go live.
                </p>
              </div>
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                {MARKETING.cta.primary}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
