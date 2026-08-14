import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import {
  Byline,
  QuickAnswer,
} from '@gitroom/frontend/components/marketing/geo';
import { StatusLivePanel } from './status-live-panel';

export const metadata: Metadata = {
  title: {
    absolute: 'Publishly status — live uptime and posting success',
  },
  description:
    'Live Publishly service health and confirmed posting-success rates by social platform, calculated from real finished posts.',
  alternates: { canonical: '/status' },
};

export default function StatusPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <section className="mk-hero">
          <div className="mk-container">
            <span className="mk-eyebrow">Public status</span>
            <h1
              className="mk-h2-lg"
              style={{ marginTop: 18, maxWidth: '14ch' }}
            >
              Reliability, with the numbers attached.
            </h1>
            <p className="mk-section-lede" style={{ maxWidth: '62ch' }}>
              Current service health, rolling component uptime, and posting
              success by platform. These figures come from automatic service
              checks and confirmed post results—not a manually colored badge.
            </p>
            <QuickAnswer>
              Missing service checks count against uptime. Posting success only
              counts a destination after Publishly confirms the post exists on
              the social platform. Posts still waiting or retrying are left out.
            </QuickAnswer>
            <Byline published="2026-08-10" updated="2026-08-10" />
            <StatusLivePanel />
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
