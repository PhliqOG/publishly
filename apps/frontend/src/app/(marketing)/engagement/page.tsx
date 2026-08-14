import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { InboxReplica } from '@gitroom/frontend/components/marketing/replicas/inbox-replica';

export const metadata: Metadata = {
  title: 'Unified social media comments for supported accounts',
  description:
    'Read and reply to supported Facebook and Instagram comments from one place using the account you authorized.',
  alternates: { canonical: '/engagement' },
};

export default function EngagementPage() {
  return (
    <ProductMarketingPage
      eyebrow="Engagement"
      title="Reply from one place where the network allows it."
      lede="Bring supported Facebook and Instagram comments into one place and reply as the account you authorized. Unsupported networks say so clearly."
      visual={<InboxReplica />}
      spotlight={{
        eyebrow: 'Inbox',
        heading: 'Reply as the account that was addressed.',
        body: 'Comments from supported accounts arrive in one feed. Replies leave through the same authorized Facebook or Instagram connection.',
        points: [
          'Comments kept inside the right workspace',
          'Replies through official permissions',
          'Unsupported networks say so',
        ],
      }}
      statement="No scraped inboxes, no ghost sessions. Where a network offers no comments API, the inbox says so instead of faking a control."
      items={[
        {
          title: 'Every supported comment in one feed',
          body: 'Filter supported comments by connected account and platform in one inbox.',
        },
        {
          title: 'Replies leave as the authorized account',
          body: 'Facebook & Instagram adapters send replies through their official Graph API permissions — the same authorization that connected the account.',
        },
        {
          title: 'Only real controls, per network',
          body: 'Networks without an implemented comments API read as unavailable rather than showing a control that cannot work.',
        },
      ]}
    />
  );
}
