import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { InboxReplica } from '@gitroom/frontend/components/marketing/replicas/inbox-replica';

export const metadata: Metadata = { title: 'Engagement' };

export default function EngagementPage() {
  return (
    <ProductMarketingPage
      eyebrow="Engagement"
      title="Comments where the official API permits them."
      lede="Bring supported account comments into one workspace and reply with the same authorized account—without pretending every network offers the same controls."
      visual={<InboxReplica />}
      items={[
        { title: 'Unified feed', body: 'Filter supported comments by connected account and platform in a workspace-scoped inbox.' },
        { title: 'Authorized replies', body: 'Facebook and Instagram adapters send replies through their official Graph API permissions.' },
        { title: 'Capability-gated', body: 'Networks without an implemented comments API are clearly unavailable rather than showing a control that cannot work.' },
      ]}
    />
  );
}
