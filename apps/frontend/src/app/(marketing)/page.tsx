import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
  NetworkMarquee,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  CalendarBoard,
  HeroCinema,
} from '@gitroom/frontend/components/marketing/hero-cinema';
import { ComposerReplica } from '@gitroom/frontend/components/marketing/replicas/composer-replica';
import { PipelineDiagram } from '@gitroom/frontend/components/marketing/replicas/pipeline-diagram';
import { AnalyticsReplica } from '@gitroom/frontend/components/marketing/replicas/analytics-replica';
import { InboxReplica } from '@gitroom/frontend/components/marketing/replicas/inbox-replica';
import { PricingCards } from '@gitroom/frontend/components/marketing/pricing-cards';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

const Feature = ({
  num,
  label,
  id,
  flip,
  title,
  lede,
  points,
  stage,
}: {
  num: string;
  label: string;
  id: string;
  flip?: boolean;
  title: string;
  lede: string;
  points: string[];
  stage: React.ReactNode;
}) => (
  <section className={`mk-feature ${flip ? 'mk-feature-flip' : ''}`} id={id}>
    <div className="mk-container">
      <div className="mk-feature-head">
        <span className="mk-num">{num}</span>
        <span className="mk-num-label">{label}</span>
      </div>
      <div className="mk-feature-grid">
        <div className="mk-feature-copy mk-reveal">
          <h2 className="mk-h2">{title}</h2>
          <p>{lede}</p>
          <ul className="mk-feature-points">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="mk-feature-stage mk-reveal" data-delay="120">
          {stage}
        </div>
      </div>
    </div>
  </section>
);

export default function MarketingHome() {
  return (
    <>
      <MarketingNav />
      <HeroCinema />
      <NetworkMarquee />

      <Feature
        num="01"
        label="Compose"
        id="compose"
        title="One draft, every voice."
        lede="Write the core message once, then tailor captions, tags, and first comments per network — with each platform's real limits enforced before you hit schedule."
        points={[
          'Per-network captions from a single draft',
          'Character limits and media rules checked live',
          'First comments, tags, and per-platform settings',
        ]}
        stage={<ComposerReplica />}
      />

      <Feature
        num="02"
        label="Schedule"
        id="schedule"
        flip
        title="The week, at a glance."
        lede="Month, week, and day views with drag-and-drop rescheduling. Move a slot and the publishing pipeline moves with it — no orphaned jobs, no stale queues."
        points={[
          'Drag a post; the workflow follows',
          'CSV bulk import with a full validation preview',
          'Shift or clear whole ranges in one operation',
        ]}
        stage={
          <div className="mk-static-board">
            <CalendarBoard mini />
          </div>
        }
      />

      <Feature
        num="03"
        label="Deliver"
        id="deliver"
        title="Publishing is infrastructure."
        lede="Every scheduled destination runs as a durable workflow with a deterministic identity. Provider-aware status checks and conservative retry rules keep ambiguous failures from becoming blind duplicate attempts."
        points={[
          'Duplicate-resistant, idempotent execution',
          'Partial success: five networks stay up while one retries',
          'An hourly sweeper re-queues anything that missed its slot',
        ]}
        stage={<PipelineDiagram />}
      />

      <Feature
        num="04"
        label="Measure"
        id="measure"
        flip
        title="Numbers with receipts."
        lede="Analytics come from each platform's official reporting APIs and are snapshotted whenever they refresh. If a platform doesn't report a metric, we show you that — never an estimate dressed up as data."
        points={[
          'Platform-reported values only, never interpolated',
          'Refresh-time snapshots build an honest history',
          'Per-channel drill-down and API access',
        ]}
        stage={<AnalyticsReplica />}
      />

      <Feature
        num="05"
        label="Reply"
        id="reply"
        title="Every conversation, one inbox."
        lede="Comments from your connected channels, in one queue, with replies that post through the same official APIs. Channels that don't support it say so — honestly."
        points={[
          'Unified comment stream per workspace',
          'Reply in place, through official APIs',
          'Capability-gated: no faked features',
        ]}
        stage={<InboxReplica />}
      />

      <section className="mk-section" id="open">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">06</span>
            <span className="mk-num-label">Open</span>
          </div>
          <div className="mk-reveal">
            <h2 className="mk-h2">Ten networks. Official APIs only.</h2>
            <p className="mk-section-lede">
              Connections use each platform&apos;s official OAuth and
              permission model. No password sharing, no browser puppets,
              nothing that breaks when a platform sneezes.
            </p>
            <div className="mk-networks">
              {MARKETING.networks.map((n) => (
                <span className="mk-network-chip" key={n}>
                  {n}
                </span>
              ))}
            </div>
            <p className="mk-networks-note">
              Plus twenty more communities and publishing targets inherited
              from the open-source engine underneath.{' '}
              <Link href="/source" style={{ textDecoration: 'underline' }}>
                {MARKETING.openSource.linkLabel}
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="mk-section" id="collaboration">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">07</span>
            <span className="mk-num-label">Collaborate</span>
          </div>
          <h2 className="mk-h2">One workspace, clear ownership.</h2>
          <p className="mk-section-lede">
            Invite teammates, separate client workspaces, leave internal notes,
            and keep security-relevant actions in an operator-readable audit log.
          </p>
          <div className="mk-cards">
            <div className="mk-card">
              <h3>Roles that make sense</h3>
              <p>Owner, admin, and member responsibilities stay visible in the interface.</p>
            </div>
            <div className="mk-card">
              <h3>Agency-ready separation</h3>
              <p>Connections, posts, media, keys, and analytics remain scoped to their workspace.</p>
            </div>
            <div className="mk-card">
              <h3>Traceable changes</h3>
              <p>Invitations, channel changes, keys, and bulk operations leave an audit record.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-section" id="developers">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">08</span>
            <span className="mk-num-label">Develop</span>
          </div>
          <h2 className="mk-h2">A real API, not an afterthought.</h2>
          <p className="mk-section-lede">
            Create one-time-visible, hashed API keys with narrow scopes for
            accounts, media, schedules, posts, and status automation.
          </p>
          <Link href="/api-docs" className="mk-btn mk-btn-ghost">
            Explore the API
          </Link>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="stories-title">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">09</span>
            <span className="mk-num-label">Customer stories</span>
          </div>
          <h2 className="mk-h2" id="stories-title">Proof belongs to customers.</h2>
          <p className="mk-section-lede">
            No testimonials are published yet. This space is intentionally
            reserved for verified customer stories after launch.
          </p>
        </div>
      </section>

      <section className="mk-section" id="faq">
        <div className="mk-container mk-prose">
          <div className="mk-feature-head">
            <span className="mk-num">10</span>
            <span className="mk-num-label">FAQ</span>
          </div>
          <h2 className="mk-h2">Before you connect.</h2>
          <h3>Does Publishly use official APIs?</h3>
          <p>Yes for the ten featured networks. Each connection still depends on that platform granting the required app permissions.</p>
          <h3>Will every feature work on every network?</h3>
          <p>No. The composer and inbox read the provider capability registry and hide or label unsupported controls.</p>
          <h3>What happens during a provider outage?</h3>
          <p>Durable jobs retain their state, classify the failure, and retry only when the provider operation is safe to repeat.</p>
        </div>
      </section>

      <section className="mk-section" id="pricing">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">11</span>
            <span className="mk-num-label">Fare</span>
          </div>
          <div className="mk-reveal">
            <h2 className="mk-h2">Pricing that reads like a timetable.</h2>
            <p className="mk-section-lede">
              Four plans, one variable that matters: how much you publish.
              Every plan starts with a 7-day trial.
            </p>
          </div>
          <PricingCards compact />
          <p className="mk-free-line">
            Create an account and inspect the workspace before selecting a
            paid plan; a live channel requires an entitlement. Full detail on the{' '}
            <Link href="/pricing" style={{ textDecoration: 'underline' }}>
              pricing page
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="mk-finale mk-on-ink">
        <div className="mk-container">
          <h2 className="mk-finale-head mk-reveal">
            Monday, planned by Friday.
          </h2>
          <p className="mk-finale-sub mk-reveal" data-delay="100">
            Connect a channel, fill the week, and watch the board clear
            itself. Create your workspace before selecting a paid plan.
          </p>
          <div className="mk-finale-ctas mk-reveal" data-delay="180">
            <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
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
    </>
  );
}
