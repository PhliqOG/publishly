import Link from 'next/link';
import { CSSProperties } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { HeroDeck } from '@gitroom/frontend/components/marketing/hero-deck';
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

export default function MarketingHome() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <HeroDeck />

        <section className="mk-section" id="api">
          <div className="mk-container">
            <div className="mk-tabpanel" style={{ paddingTop: 0 }}>
              <div className="mk-tabpanel-copy mk-reveal">
                <span className="mk-eyebrow">Public API</span>
                <h2 className="mk-h2" style={{ marginTop: 14 }}>
                  Schedule from anywhere.
                </h2>
                <p>
                  Everything the app does, your scripts can do. Hashed, scoped
                  API keys you can revoke at any time — shown once, never
                  stored in recoverable form.
                </p>
                <ul className="mk-points">
                  <li>Scoped keys with deny-by-default permissions</li>
                  <li>Rate limits that protect your workspace</li>
                  <li>Bulk scheduling &amp; status reads</li>
                </ul>
              </div>
              <div className="mk-reveal" data-delay="120">
                <ApiTerminal />
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" id="platform">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Platform</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Everything a publishing team runs on.
              </h2>
            </div>
            <div className="mk-bento">
              <div className="mk-tile mk-tile-wide mk-reveal">
                <span className="mk-tile-label">Composer</span>
                <h3>One draft, every voice</h3>
                <p>
                  Write once, tailor captions per network — with each
                  platform&rsquo;s real limits enforced before you hit
                  schedule.
                </p>
                <div className="mk-tile-chiprow">
                  {MARKETING.networks.slice(0, 6).map((n) => (
                    <span
                      className="mk-minichip"
                      key={n}
                      style={{ '--net': NET_COLOR[n] } as CSSProperties}
                    >
                      <i />
                      {n}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mk-tile mk-reveal" data-delay="80">
                <span className="mk-tile-label">Networks</span>
                <div className="mk-tile-stat">
                  10<span> networks</span>
                </div>
                <p>Official OAuth &amp; permission models only. No password
                  sharing, no browser puppets.</p>
              </div>
              <div className="mk-tile mk-reveal" data-delay="60">
                <span className="mk-tile-label">Bulk</span>
                <h3>CSV import with receipts</h3>
                <p>
                  Validate, preview, then commit — every rejected row tells
                  you why before anything is scheduled.
                </p>
              </div>
              <div className="mk-tile mk-reveal" data-delay="120">
                <span className="mk-tile-label">Delivery</span>
                <h3>Duplicate-resistant by design</h3>
                <p>
                  Each post runs as a durable workflow with a deterministic
                  identity — retries converge instead of double-posting.
                </p>
              </div>
              <div className="mk-tile mk-reveal" data-delay="180">
                <span className="mk-tile-label">Analytics</span>
                <h3>No estimated metrics</h3>
                <p>
                  Platform-reported values only. If a network doesn&rsquo;t
                  report it, we say so instead of inventing it.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" id="pillars">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">The work</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Compose. Schedule. Deliver.
              </h2>
            </div>
            <Tabs
              tabs={[
                {
                  id: 'compose',
                  label: 'Compose',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Write once, tailor everywhere</h3>
                        <p>
                          The core message stays one draft. Captions, tags,
                          and first comments adapt per network — with live
                          previews &amp; real character limits.
                        </p>
                        <ul className="mk-points">
                          <li>Per-network caption variants</li>
                          <li>Media rules checked before scheduling</li>
                          <li>First comments &amp; platform settings</li>
                        </ul>
                      </div>
                      <ComposerReplica />
                    </>
                  ),
                },
                {
                  id: 'schedule',
                  label: 'Schedule',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>The week, at a glance</h3>
                        <p>
                          Month, week &amp; day views with drag-and-drop
                          rescheduling. Move a slot and the pipeline moves
                          with it.
                        </p>
                        <ul className="mk-points">
                          <li>Drag a post; the workflow follows</li>
                          <li>Bulk shift or clear whole ranges</li>
                          <li>Timezone-safe slots</li>
                        </ul>
                      </div>
                      <CalendarBoard mini />
                    </>
                  ),
                },
                {
                  id: 'deliver',
                  label: 'Deliver',
                  content: (
                    <>
                      <div className="mk-tabpanel-copy">
                        <h3>Publishing is infrastructure</h3>
                        <p>
                          A durable workflow engine executes every post, so
                          crashes, rate limits &amp; expired tokens stay
                          boring.
                        </p>
                        <ul className="mk-points">
                          <li>Partial success, honest per-network status</li>
                          <li>An hourly sweeper re-queues missed slots</li>
                          <li>Conservative retries, never blind re-posts</li>
                        </ul>
                      </div>
                      <PipelineDiagram />
                    </>
                  ),
                },
              ]}
            />
          </div>
        </section>

        <section className="mk-band-cream" id="reliability">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ color: 'var(--mk-olive)' }}>
                Reliability
              </span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Built like rail, not like a cron job.
              </h2>
              <p className="mk-section-lede">
                Most schedulers are a cron job with a nice calendar.{' '}
                {MARKETING.brand} treats publishing like infrastructure — the
                worst moments stay boring.
              </p>
            </div>
            <div className="mk-cards">
              {MARKETING.reliability.map((card, i) => (
                <div
                  className="mk-card mk-reveal"
                  key={card.title}
                  data-delay={i * 80}
                >
                  <span className="mk-card-num">
                    RAIL {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mk-section" id="measure-reply">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Signals</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Measure &amp; reply, one place.
              </h2>
            </div>
            <div className="mk-duo">
              <div className="mk-duo-cell mk-reveal">
                <h3>Numbers with receipts</h3>
                <p>
                  Official reporting APIs, snapshotted as they refresh — an
                  honest history you can drill into per channel.
                </p>
                <AnalyticsReplica />
              </div>
              <div className="mk-duo-cell mk-reveal" data-delay="120">
                <h3>Every conversation, one inbox</h3>
                <p>
                  Comments from connected channels in one queue, replies
                  through the same official APIs. Unsupported channels say so.
                </p>
                <InboxReplica />
              </div>
            </div>
          </div>
        </section>

        <section className="mk-section" id="networks">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Connections</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                10 networks. Official APIs only.
              </h2>
              <p className="mk-section-lede">
                Connections use each platform&rsquo;s official OAuth &amp;
                permission model — nothing that breaks when a platform
                sneezes.
              </p>
            </div>
            <div className="mk-networks">
              {MARKETING.networks.map((n, i) => (
                <span
                  className="mk-network-chip mk-reveal"
                  key={n}
                  data-delay={i * 40}
                  style={{ '--net': NET_COLOR[n] } as CSSProperties}
                >
                  {n}
                </span>
              ))}
            </div>
            <p className="mk-networks-note">
              Plus 20 more communities &amp; publishing targets inherited from
              the open-source engine underneath.{' '}
              <Link href="/source" style={{ textDecoration: 'underline' }}>
                {MARKETING.openSource.linkLabel}
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="mk-section" id="pricing">
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow">Pricing</span>
              <h2 className="mk-h2" style={{ marginTop: 14 }}>
                Pricing that reads like a timetable.
              </h2>
              <p className="mk-section-lede">
                4 plans, one variable that matters: how much you publish.
                Every plan starts with a 7-day trial.
              </p>
            </div>
            <PricingCards compact />
            <p className="mk-free-line">
              There&rsquo;s also a free plan for trying the composer &amp;
              calendar — upgrade when a channel goes live. Full detail on the{' '}
              <Link href="/pricing" style={{ textDecoration: 'underline' }}>
                pricing page
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="mk-finale">
          <div className="mk-container">
            <h2 className="mk-finale-head mk-reveal">
              Monday, planned by Friday.
            </h2>
            <p className="mk-finale-sub mk-reveal" data-delay="100">
              Connect a channel, fill the week &amp; watch the board clear
              itself. Free plan included — no card required to start.
            </p>
            <div className="mk-finale-ctas mk-reveal" data-delay="180">
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
            <hr className="mk-finale-rule" />
          </div>
          <MarketingFooter />
        </section>
      </main>
    </>
  );
}
