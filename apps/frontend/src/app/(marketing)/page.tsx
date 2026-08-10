import Link from 'next/link';
import { MarketingFooter } from '@gitroom/frontend/components/marketing/chrome';
import { MegaNav } from '@gitroom/frontend/components/marketing/mega-nav';
import { LavaCanvas } from '@gitroom/frontend/components/marketing/lava';
import { PlatformScroller } from '@gitroom/frontend/components/marketing/scroller';
import { CalendarBoard } from '@gitroom/frontend/components/marketing/hero-cinema';
import { ApiTerminal } from '@gitroom/frontend/components/marketing/terminal';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

const GoogleG = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

const PILLARS = [
  {
    wide: true,
    slot: 'composer',
    title: 'Compose once, publish everywhere',
    body: 'Write the core message one time, tailor captions per network, & schedule the lot — with each platform’s real limits enforced before anything ships.',
    href: '/features',
    cta: 'Explore the composer',
  },
  {
    slot: 'calendar',
    title: 'A calendar that runs the week',
    body: 'Month, week & day views with drag-and-drop rescheduling. Move a slot & the pipeline moves with it.',
    href: '/calendar',
    cta: 'See the calendar',
  },
  {
    slot: 'publishing',
    title: 'Delivery built like infrastructure',
    body: 'Every post runs as a durable workflow with a deterministic identity — retries converge instead of double-posting.',
    href: '/publishing',
    cta: 'How publishing works',
  },
  {
    slot: 'bulk',
    title: 'Bulk import with receipts',
    body: 'Load a CSV, get a full validation preview, commit when it’s clean. Every rejected row tells you why.',
    href: '/publishing',
    cta: 'Bulk scheduling',
  },
  {
    slot: 'analytics',
    title: 'Numbers with receipts',
    body: 'Platform-reported analytics, snapshotted as they refresh. If a network doesn’t report it, we say so.',
    href: '/analytics',
    cta: 'View analytics',
  },
];

const STORIES = [
  {
    slot: 'story-agencies',
    title: 'Agencies',
    body: 'Run every client in an isolated workspace — separate channels, media, keys & analytics, with an audit log that answers questions.',
    products: 'Workspaces · Audit log · API',
    href: '/agencies',
  },
  {
    slot: 'story-creators',
    title: 'Creators',
    body: 'One draft becomes ten native posts. Fill a week in one sitting & let the pipeline carry it while you make the next thing.',
    products: 'Composer · Calendar · Analytics',
    href: '/features',
  },
  {
    slot: 'story-teams',
    title: 'Teams',
    body: 'Share one calendar with clear roles. Every invitation, channel change & bulk operation stays on the record.',
    products: 'Roles · Calendar · Inbox',
    href: '/features',
  },
];

const NEWS = [
  {
    tag: 'Shipped',
    title: 'CSV bulk import with validation previews',
    body: 'Validate, preview & commit whole weeks of content — per-row error reports included.',
  },
  {
    tag: 'Shipped',
    title: 'Unified inbox framework',
    body: 'Comments from connected channels in one queue, replies through official APIs, capability-gated honestly.',
  },
  {
    tag: 'Shipped',
    title: 'Analytics snapshots',
    body: 'Platform-reported metrics captured as they refresh, building an honest per-channel history.',
  },
  {
    tag: 'Shipped',
    title: 'Scoped API keys & audit log',
    body: 'Hashed keys with deny-by-default scopes, shown once — and a workspace audit trail for every change.',
  },
];

export default function MarketingHome() {
  return (
    <>
      <MegaNav />
      <main id="mk-main">
        <header className="mk-hero mk-hero-lava">
          <div className="mk-hero-bg">
            <div className="mk-lava-fallback" />
            <LavaCanvas />
            <div className="mk-hero-scrim" />
          </div>
          <div className="mk-container mk-hero-content">
            <span className="mk-hero-fact">
              10 networks · official APIs · open source
            </span>
            <h1 className="mk-h1">
              Publishing infrastructure for every channel you own.
            </h1>
            <p className="mk-hero-sub">{MARKETING.sub}</p>
            <div className="mk-hero-ctas">
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                Start now
              </Link>
              <Link href={MARKETING.authRegister} className="mk-btn mk-btn-google">
                <GoogleG />
                Sign up with Google
              </Link>
            </div>
            <p className="mk-hero-note">
              No card required to start. Every plan begins with a 7-day trial.
            </p>
          </div>
        </header>

        <div className="mk-container mk-hero-shot">
          <div className="mk-dark mk-shot-frame">
            <CalendarBoard />
          </div>
        </div>

        <PlatformScroller />

        <section className="mk-section" id="platform">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Platform</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Flexible publishing for every kind of team.
              </h2>
              <p className="mk-section-lede">
                Grow your channels with a complete set of scheduling &
                delivery tools — from the first post to the full pipeline.
              </p>
            </div>
            <div className="mk-pillars">
              {PILLARS.map((p, i) => (
                <div
                  key={p.title}
                  className={`mk-pillar ${p.wide ? 'mk-pillar-wide' : ''} mk-reveal`}
                  data-delay={i * 60}
                >
                  <div className="mk-pillar-media">
                    <div className="mk-imgslot" data-label={`publishly · ${p.slot}`} />
                  </div>
                  <div className="mk-pillar-body">
                    <h3>{p.title}</h3>
                    <p>{p.body}</p>
                    <Link href={p.href} className="mk-arrow">
                      {p.cta}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" id="backbone">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">The backbone</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                The backbone of your publishing.
              </h2>
              <p className="mk-section-lede">
                Real capabilities, stated plainly — no invented volume, no
                borrowed logos, no imaginary users.
              </p>
            </div>
            <div className="mk-metrics">
              <div className="mk-metric mk-reveal">
                <div className="mk-metric-value">10</div>
                <div className="mk-metric-label">
                  first-class networks with official-API connections
                </div>
              </div>
              <div className="mk-metric mk-reveal" data-delay="60">
                <div className="mk-metric-value">30+</div>
                <div className="mk-metric-label">
                  publishing targets inherited from the open-source engine
                </div>
              </div>
              <div className="mk-metric mk-reveal" data-delay="120">
                <div className="mk-metric-value">4</div>
                <div className="mk-metric-label">
                  plans, each starting with a 7-day trial — & a free plan
                </div>
              </div>
              <div className="mk-metric mk-reveal" data-delay="180">
                <div className="mk-metric-value">AGPL</div>
                <div className="mk-metric-label">
                  open-source engine — the running service offers its source
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" id="solutions">
          <div className="mk-container">
            <div className="mk-section-head-row mk-reveal">
              <div>
                <span className="mk-eyebrow">Solutions</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  Built for the way you publish.
                </h2>
              </div>
              <Link href="/agencies" className="mk-arrow">
                For agencies
              </Link>
            </div>
            <div className="mk-stories">
              {STORIES.map((s, i) => (
                <div key={s.title} className="mk-story mk-reveal" data-delay={i * 80}>
                  <div className="mk-story-media">
                    <div className="mk-imgslot" data-label={`publishly · ${s.slot}`} />
                  </div>
                  <div className="mk-story-body">
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                    <div className="mk-story-products">{s.products}</div>
                    <Link href={s.href} className="mk-arrow">
                      Learn more
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-devband mk-dark" id="developers">
          <div className="mk-container">
            <div className="mk-devband-grid">
              <div className="mk-reveal">
                <span className="mk-eyebrow">Developers</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  Reliable, extensible publishing for every stack.
                </h2>
                <p className="mk-section-lede">
                  Everything the app does, your scripts can do — with hashed,
                  scoped keys you can revoke at any time.
                </p>
                <div className="mk-hero-ctas" style={{ marginTop: 28 }}>
                  <Link href="/api-docs" className="mk-btn mk-btn-amber">
                    View API docs
                  </Link>
                  <Link href="/source" className="mk-btn mk-btn-ghost">
                    Get the source
                  </Link>
                </div>
                <div className="mk-devfacts">
                  <div className="mk-devfact">
                    <div className="mk-devfact-value">Scoped</div>
                    <div className="mk-devfact-label">
                      deny-by-default API keys
                    </div>
                  </div>
                  <div className="mk-devfact">
                    <div className="mk-devfact-value">Limited</div>
                    <div className="mk-devfact-label">
                      per-workspace rate limits
                    </div>
                  </div>
                  <div className="mk-devfact">
                    <div className="mk-devfact-value">REST</div>
                    <div className="mk-devfact-label">
                      posts, media, bulk & analytics
                    </div>
                  </div>
                </div>
              </div>
              <div className="mk-reveal" data-delay="120">
                <ApiTerminal />
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" id="shipping">
          <div className="mk-container">
            <div className="mk-section-head-row mk-reveal">
              <div>
                <span className="mk-eyebrow">What&rsquo;s shipping</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  See the latest from {MARKETING.brand}.
                </h2>
              </div>
              <Link href="/about" className="mk-arrow">
                About the project
              </Link>
            </div>
            <div className="mk-news">
              {NEWS.map((n, i) => (
                <div key={n.title} className="mk-news-card mk-reveal" data-delay={i * 60}>
                  <span className="mk-news-tag">{n.tag}</span>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section mk-section-tint" id="pricing">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Pricing</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Pricing that reads like a timetable.
              </h2>
              <p className="mk-section-lede">
                4 plans, one variable that matters: how many channels you run.
              </p>
            </div>
            <PricingCards compact />
            <p className="mk-free-line">
              Creating an account is free & every plan starts with a 7-day
              trial. Full detail on the{' '}
              <Link href="/pricing" style={{ textDecoration: 'underline' }}>
                pricing page
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="mk-ctaclose">
          <div className="mk-container mk-ctaclose-grid">
            <div className="mk-reveal">
              <h2 className="mk-h2">Ready to get started?</h2>
              <p className="mk-section-lede">
                Create an account instantly & schedule your first post today —
                or read how the pipeline works first.
              </p>
              <div className="mk-hero-ctas" style={{ marginTop: 28 }}>
                <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
                  Start now
                </Link>
                <Link href="/contact" className="mk-btn mk-btn-ghost">
                  Contact
                </Link>
              </div>
            </div>
            <div className="mk-cta-cards mk-reveal" data-delay="100">
              <div className="mk-cta-card">
                <h3>See what you&rsquo;ll pay</h3>
                <p>
                  Transparent plans from the same config billing enforces —
                  the page can never drift from reality.
                </p>
                <Link href="/pricing" className="mk-arrow">
                  Pricing
                </Link>
              </div>
              <div className="mk-cta-card">
                <h3>Start building</h3>
                <p>
                  Scoped keys, REST endpoints & bulk scheduling — everything
                  the app does, from your stack.
                </p>
                <Link href="/api-docs" className="mk-arrow">
                  API docs
                </Link>
              </div>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </>
  );
}
