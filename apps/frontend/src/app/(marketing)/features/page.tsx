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
      'Durable workflow per post - survives restarts and deploys',
      'Exactly-once delivery by construction, not by luck',
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
      'Daily snapshots build history beyond each platform’s lookback window',
      'Metrics a platform does not expose are labelled unavailable - never estimated',
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
      <section className="mk-section">
        <div className="mk-container">
          <h1 className="mk-h2">Features</h1>
          <p className="mk-section-lede">
            Everything here ships in the product today. If a network limits a
            feature, the interface says so instead of pretending.
          </p>
          <div className="mk-cards" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            {GROUPS.map((group) => (
              <div className="mk-card" key={group.title}>
                <h3>{group.title}</h3>
                <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--mk-ink-soft)', fontSize: 15.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40 }}>
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
