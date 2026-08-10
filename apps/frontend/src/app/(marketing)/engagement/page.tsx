import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { InboxReplica } from '@gitroom/frontend/components/marketing/replicas/inbox-replica';

export const metadata: Metadata = { title: 'Engagement' };

export default function EngagementPage() {
  return (
    <ProductMarketingPage
      eyebrow="Engagement"
      title="Comments where the official API permits them."
      lede="Bring supported account comments into one workspace & reply as the same authorized account — without pretending every network offers the same controls."
      visual={<InboxReplica />}
      spotlight={{
        eyebrow: 'Inbox',
        heading: 'Reply as the account that was addressed.',
        body: 'Comments from supported channels arrive in one workspace-scoped feed. Replies leave through the same authorized connection — Facebook & Instagram today, through their official Graph API permissions.',
        points: [
          'Workspace-scoped comment feed',
          'Replies through official permissions',
          'Unsupported networks say so',
        ],
      }}
      statement="No scraped inboxes, no ghost sessions. Where a network offers no comments API, the inbox says so instead of faking a control."
      items={[
        {
          title: 'Unified feed',
          body: 'Filter supported comments by connected account & platform in one workspace-scoped inbox.',
        },
        {
          title: 'Authorized replies',
          body: 'Facebook & Instagram adapters send replies through their official Graph API permissions — the same authorization that connected the account.',
        },
        {
          title: 'Capability-gated',
          body: 'Networks without an implemented comments API read as unavailable rather than showing a control that cannot work.',
        },
      ]}
    />
  );
}
