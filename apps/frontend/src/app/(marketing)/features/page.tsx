import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Features' };

const GROUPS = [
  {
    title: 'Composer',
    items: [
      'One draft, tailored captions per network',
      'Live previews in each platform’s shape',
      'Character and media limits enforced before scheduling',
      'First-comment publishing where platforms allow it',
      'Drafts, tags, saved channel sets, and signatures',
    ],
  },
  {
    title: 'Calendar',
    items: [
      'Month, week, and day views',
      'Drag-and-drop rescheduling',
      'Timezone-aware slots',
      'Bulk CSV import with a validation preview and per-row error report',
      'Bulk shift and bulk delete for selected posts',
    ],
  },
  {
    title: 'Publishing pipeline',
    items: [
      'Durable workflow per post — survives restarts and deploys',
      'Duplicate-resistant execution with deterministic workflow identities',
      'Per-network partial success: only failed destinations retry',
      'Automatic token refresh, honest error reporting per channel',
      'Hourly sweeper re-queues anything that missed its slot',
    ],
  },
  {
    title: 'Team & workspace',
    items: [
      'Workspaces with roles and invitations',
      'Internal comments on scheduled posts',
      'Audit log of security-relevant actions',
      'Customer grouping for agency-style setups',
    ],
  },
  {
    title: 'Analytics',
    items: [
      'Platform-reported metrics via official APIs',
      'Historical snapshots are captured whenever analytics refresh',
      'Metrics a platform does not expose are labelled unavailable — never estimated',
    ],
  },
  {
    title: 'Developers',
    items: [
      'Public API with hashed, scope-limited keys',
      'Outgoing webhooks on publishing events',
      'Self-hostable: the engine is open source (AGPL-3.0)',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <MarketingNav />

      <section style={{ padding: '96px 0 88px' }}>
        <div className="mk-container">
          <div className="mk-reveal">
            <span className="mk-eyebrow" style={{ display: 'block' }}>
              Features
            </span>
            <h1
              className="mk-h1"
              style={{
                fontSize: 'clamp(2.7rem, 5.6vw, 4.4rem)',
                marginTop: 20,
                maxWidth: '16ch',
              }}
            >
              Every feature, listed.
            </h1>
            <p className="mk-section-lede">
              Everything here ships in the product today. If a network limits a
              feature, the interface says so instead of pretending.
            </p>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">01</span>
            <span className="mk-num-label">Inventory</span>
          </div>
          <div className="mk-cards mk-reveal" data-delay="120">
            {GROUPS.map((group, i) => (
              <div className="mk-card" key={group.title}>
                <div className="mk-card-num">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3>{group.title}</h3>
                <ul className="mk-feature-points" style={{ marginTop: 16 }}>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-feature-head">
            <span className="mk-num">02</span>
            <span className="mk-num-label">Start</span>
          </div>
          <div className="mk-band mk-reveal">
            <div>
              <h2 style={{ fontSize: 'clamp(1.7rem, 3.2vw, 2.4rem)' }}>
                See the board clear itself.
              </h2>
              <p>Create the workspace before choosing a paid plan.</p>
            </div>
            <Link href={MARKETING.authRegister} className="mk-btn mk-btn-primary">
              {MARKETING.cta.primary}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
