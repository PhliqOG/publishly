import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { AnalyticsReplica } from '@gitroom/frontend/components/marketing/replicas/analytics-replica';

export const metadata: Metadata = { title: 'Analytics' };

export default function AnalyticsMarketingPage() {
  return (
    <ProductMarketingPage
      eyebrow="Analytics"
      title="Platform numbers, with their limits intact."
      lede="Compare accounts and posts using metrics returned by authorized provider APIs. Missing metrics stay missing—not estimated."
      visual={<AnalyticsReplica />}
      items={[
        { title: 'Comparable views', body: 'Use date ranges, platform comparisons, account comparisons, and best-post views where provider data allows them.' },
        { title: 'Historical snapshots', body: 'Refresh-time snapshots preserve useful history beyond short API lookback windows where platform terms permit storage.' },
        { title: 'Honest availability', body: 'Reach, saves, follower trends, and other metrics are labelled unavailable when a connected platform does not expose them.' },
      ]}
    />
  );
}
