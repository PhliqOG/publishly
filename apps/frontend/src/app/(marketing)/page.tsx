import Link from 'next/link';
import { CSSProperties } from 'react';
import { MarketingFooter } from '@gitroom/frontend/components/marketing/chrome';
import { MegaNav } from '@gitroom/frontend/components/marketing/mega-nav';
import { HalftoneHeroBackground } from '@gitroom/frontend/components/marketing/halftone';
import { PlatformIcon } from '@gitroom/frontend/components/marketing/icons';
import { CalendarBoard } from '@gitroom/frontend/components/marketing/hero-cinema';
import { Tabs } from '@gitroom/frontend/components/marketing/motion';
import { ApiTerminal } from '@gitroom/frontend/components/marketing/terminal';
import { ComposerReplica } from '@gitroom/frontend/components/marketing/replicas/composer-replica';
import { PipelineDiagram } from '@gitroom/frontend/components/marketing/replicas/pipeline-diagram';
import { AnalyticsReplica } from '@gitroom/frontend/components/marketing/replicas/analytics-replica';
import { InboxReplica } from '@gitroom/frontend/components/marketing/replicas/inbox-replica';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

const NET_COLOR: Record<string, string> = {
  Instagram: 'var(--net-instagram)',
  Facebook: 'var(--net-facebook)',
  TikTok: 'var(--net-tiktok)',
  YouTube: 'var(--net-youtube)',
  X: 'var(--net-x)',
  Threads: 'var(--net-threads)',
  LinkedIn: 'var(--net-linkedin)',
  Pinterest: 'var(--net-pinterest)',
  Bluesky: 'var(--net-bluesky)',
  Mastodon: 'var(--net-mastodon)',
};

const TRIO = [
  {
    title: 'Plan',
    body: 'A week of content in one sitting. Month, week & day views with drag-and-drop rescheduling — move a slot & the pipeline moves with it.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="2.5" y="3.5" width="15" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 8h15" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 1.8v3.4M13.5 1.8v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Publish',
    body: 'Write once, tailor captions per network & let a durable workflow deliver — through each platform’s official API, never a browser trick.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M2.5 10 17 3.5 13.5 17l-4-5-7-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'Measure',
    body: 'Only numbers the platforms actually report, snapshotted into an honest history. If a network doesn’t report it, we say so.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M3.5 16.5v-6M10 16.5v-11M16.5 16.5v-8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const BENEFITS = [
  {
    title: 'One draft, every voice',
    body: 'Captions, tags & first comments adapt per network, with each platform’s real limits checked before you schedule.',
  },
  {
    title: 'Bulk import with receipts',
    body: 'Load a CSV, preview the validation, commit when it’s clean — every rejected row tells you why.',
  },
  {
    title: 'Delivery you don’t babysit',
    body: 'Every post runs as a durable workflow. Retries converge instead of double-posting; an hourly sweeper re-queues missed slots.',
  },
  {
    title: 'A workspace per client',
    body: 'Channels, media, keys & analytics stay isolated per workspace — with roles & an audit log that answers questions.',
  },
  {
    title: 'An API that does everything',
    body: 'Hashed, scoped keys you can revoke at any time. Everything the app does, your scripts can do.',
  },
];

const FAQ = [
  {
    q: 'Does Publishly use official platform APIs?',
    a: 'Yes — every connection uses the platform’s official OAuth flow & permission model. No password sharing, no browser automation, nothing that breaks when a platform changes its interface.',
  },
  {
    q: 'Which networks are supported?',
    a: 'Instagram, Facebook, TikTok, YouTube, X, Threads, LinkedIn, Pinterest, Bluesky & Mastodon first-class, plus 20+ more publishing targets inherited from the open-source engine — Reddit, Discord, Slack, Telegram, Medium, WordPress & others.',
  },
  {
    q: 'Is Publishly open source?',
    a: 'The engine is AGPL-3.0. The corresponding source of the running service is available to every user — there’s a link in the footer of every page.',
  },
  {
    q: 'Who owns my data?',
    a: 'You do. Social tokens are encrypted at rest, you can export your workspace at any time, & deletion destroys tokens immediately.',
  },
  {
    q: 'How do trials work?',
    a: 'Every paid plan starts with a 7-day trial. No card is required to create an account, & you can cancel from the billing page at any time.',
  },
  {
    q: 'Can I automate scheduling?',
    a: 'Yes — the public API covers posts, media, bulk scheduling & analytics, with hashed scoped keys & per-workspace rate limits.',
  },
];

export default function MarketingHome() {
  return (
    <>
      <MegaNav />
      <main id="mk-main">
        <header className="mk-hero mk-hero-c">
          <div className="mk-hero-bleed">
            <div className="mk-hero-panel">
              <HalftoneHeroBackground />
              <div className="mk-hero-panel-content">
                <h1 className="mk-h1" data-hero-el>
                  Plan once. Publish everywhere.
                </h1>
                <p className="mk-hero-sub" data-hero-el>
                  {MARKETING.brand} is one calendar for every channel you own
                  — captions tailored per network, delivery you don&rsquo;t
                  babysit.
                </p>
                <div className="mk-hero-ctas" data-hero-el>
                  <Link
                    href={MARKETING.authRegister}
                    className="mk-btn mk-btn-primary"
                  >
                    Create free account
                  </Link>
                  <Link href="#product" className="mk-btn mk-btn-ghost">
                    See how it works
                  </Link>
                </div>
                <p className="mk-hero-note" data-hero-el>
                  No card required. Every plan starts with a 7-day trial.
                </p>
              </div>
            </div>
          </div>
          <div className="mk-container">
            <div className="mk-shot" data-hero-el>
              <div className="mk-shot-frame">
                <CalendarBoard />
              </div>
            </div>
          </div>
        </header>

        <section className="mk-netrow" aria-label="Supported networks">
          <div className="mk-container">
            <p className="mk-netrow-note">
              Publishes through official APIs only
            </p>
            <div className="mk-netrow-items">
              {MARKETING.networks.map((n) => (
                <span key={n} className="mk-netrow-item">
                  <PlatformIcon name={n} />
                  {n}
                </span>
              ))}
              <span className="mk-netrow-item">+ 20 more</span>
            </div>
          </div>
        </section>

        <section className="mk-section mk-center" id="overview">
          <div className="mk-container">
            <div className="mk-reveal">
              <h2 className="mk-h2">
                Everything in its place.
                <span className="mk-sundot" aria-hidden />
              </h2>
              <p className="mk-section-lede">
                Three jobs, done properly — planning, publishing &
                measuring. Nothing else in the way.
              </p>
            </div>
            <div className="mk-trio">
              {TRIO.map((t, i) => (
                <div className="mk-trio-card mk-reveal" key={t.title} data-delay={i * 70}>
                  <div className="mk-trio-icon">{t.icon}</div>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint mk-center" id="product">
          <div className="mk-container">
            <div className="mk-reveal">
              <h2 className="mk-h2">A closer look.</h2>
            </div>
            <Tabs
              tabs={[
                {
                  id: 'calendar',
                  label: 'Calendar',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>The week, at a glance</h3>
                        <p>
                          Month, week & day views. Drag a post to a new slot
                          & the publishing pipeline follows — no orphaned
                          jobs, no stale queues.
                        </p>
                        <ul className="mk-points">
                          <li>Drag-and-drop rescheduling</li>
                          <li>Bulk shift or clear whole ranges</li>
                          <li>Timezone-safe slots</li>
                        </ul>
                      </div>
                      <div className="mk-shot-frame">
                        <CalendarBoard mini />
                      </div>
                    </>
                  ),
                },
                {
                  id: 'composer',
                  label: 'Composer',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Write once, tailor everywhere</h3>
                        <p>
                          The core message stays one draft. Captions, tags &
                          first comments adapt per network — with live
                          previews & real character limits.
                        </p>
                        <ul className="mk-points">
                          <li>Per-network caption variants</li>
                          <li>Media rules checked before scheduling</li>
                          <li>First comments & platform settings</li>
                        </ul>
                      </div>
                      <div className="mk-dark">
                        <ComposerReplica />
                      </div>
                    </>
                  ),
                },
                {
                  id: 'publishing',
                  label: 'Publishing',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Built like infrastructure</h3>
                        <p>
                          A durable workflow engine executes every post, so
                          crashes, rate limits & expired tokens stay boring.
                        </p>
                        <ul className="mk-points">
                          <li>Duplicate-resistant by design</li>
                          <li>Partial success, honest per-network status</li>
                          <li>Hourly sweeper re-queues missed slots</li>
                        </ul>
                      </div>
                      <div className="mk-dark">
                        <PipelineDiagram />
                      </div>
                    </>
                  ),
                },
                {
                  id: 'analytics',
                  label: 'Analytics',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Numbers with receipts</h3>
                        <p>
                          Official reporting APIs, snapshotted as they
                          refresh — an honest per-channel history, never an
                          estimate dressed up as data.
                        </p>
                        <ul className="mk-points">
                          <li>Platform-reported values only</li>
                          <li>Snapshot history per channel</li>
                          <li>API access to everything</li>
                        </ul>
                      </div>
                      <div className="mk-dark">
                        <AnalyticsReplica />
                      </div>
                    </>
                  ),
                },
                {
                  id: 'inbox',
                  label: 'Inbox',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Every conversation, one place</h3>
                        <p>
                          Comments from connected channels in one queue,
                          replies through the same official APIs. Channels
                          that don&rsquo;t support it say so.
                        </p>
                        <ul className="mk-points">
                          <li>Unified comment stream</li>
                          <li>Reply in place</li>
                          <li>Capability-gated, honestly</li>
                        </ul>
                      </div>
                      <div className="mk-dark">
                        <InboxReplica />
                      </div>
                    </>
                  ),
                },
                {
                  id: 'api',
                  label: 'API',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Schedule from anywhere</h3>
                        <p>
                          Everything the app does, your scripts can do —
                          with hashed, scoped keys you can revoke at any
                          time.
                        </p>
                        <ul className="mk-points">
                          <li>Deny-by-default scopes</li>
                          <li>Per-workspace rate limits</li>
                          <li>Posts, media, bulk & analytics</li>
                        </ul>
                      </div>
                      <ApiTerminal />
                    </>
                  ),
                },
              ]}
            />
          </div>
        </section>

        <section className="mk-section mk-center" id="benefits">
          <div className="mk-container">
            <div className="mk-reveal">
              <h2 className="mk-h2">Made for the work, not the demo.</h2>
            </div>
            <div className="mk-benefits">
              {BENEFITS.map((b, i) => (
                <div className="mk-benefit mk-reveal" key={b.title} data-delay={i * 50}>
                  <span className="mk-benefit-num">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{b.title}</h3>
                    <p>{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-quiet">
          <div className="mk-container mk-reveal">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              Boring, on purpose.
            </h2>
            <p>
              Every scheduled post runs as a durable workflow with a
              deterministic identity. Crashes, restarts & retries converge
              instead of double-posting — the dangerous step is simply not
              repeatable.
            </p>
          </div>
        </section>

        <section className="mk-section mk-center" id="pricing">
          <div className="mk-container">
            <div className="mk-reveal">
              <h2 className="mk-h2">Simple pricing.</h2>
              <p className="mk-section-lede">
                4 plans, one variable that matters: how many channels you
                run. Every plan starts with a 7-day trial.
              </p>
            </div>
            <PricingCards compact />
            <p className="mk-free-line">
              Full detail on the{' '}
              <Link href="/pricing" style={{ textDecoration: 'underline' }}>
                pricing page
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="mk-section mk-section-tint mk-center" id="faq">
          <div className="mk-container">
            <div className="mk-reveal">
              <h2 className="mk-h2">Questions, answered.</h2>
            </div>
            <div className="mk-faq mk-reveal" data-delay="80">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-ctaclose">
          <div className="mk-container mk-reveal">
            <h2 className="mk-h2" style={{ margin: '0 auto' }}>
              Start publishing properly.
            </h2>
            <p className="mk-section-lede" style={{ margin: '18px auto 0' }}>
              Connect a channel, fill the week & watch the board clear
              itself.
            </p>
            <div className="mk-hero-ctas">
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
                Create free account
              </Link>
              <Link href="/pricing" className="mk-btn mk-btn-ghost">
                See pricing
              </Link>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </>
  );
}
