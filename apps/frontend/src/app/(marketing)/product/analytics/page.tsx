import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';
import { AnalyticsReplica } from '@gitroom/frontend/components/marketing/replicas/analytics-replica';

export const metadata: Metadata = {
  title: 'Social media analytics across brands and accounts',
  description:
    'Compare posts, platforms, and authorized brand or client accounts using only numbers the social networks actually provide.',
  alternates: { canonical: '/product/analytics' },
};

export default function AnalyticsMarketingPage() {
  return (
    <ProductMarketingPage
      eyebrow="Analytics"
      title="Real platform numbers. No invented gaps."
      lede="Compare brand and client accounts using numbers the social networks actually provide. If a metric is unavailable, Publishly says so instead of estimating it."
      visual={<AnalyticsReplica />}
      spotlight={{
        eyebrow: 'Dashboards',
        heading: 'Numbers with their sources attached.',
        body: 'Every metric comes from an account you authorized. Publishly saves regular snapshots so useful history can outlast a platform’s short reporting window. Where a network reports nothing, the chart says so.',
        points: [
          'Platform-reported values only',
          'Snapshot history per channel',
          'Gaps labelled, not filled in',
        ],
      }}
      statement="If a platform does not report a number, the dashboard does not invent one. Missing stays missing — labelled, never estimated."
      items={[
        {
          title: 'Comparisons the data can support',
          body: 'Compare date ranges, platforms, accounts & best posts wherever provider data allows the comparison.',
        },
        {
          title: 'History beyond platform lookback windows',
          body: 'Refresh-time snapshots preserve history beyond short API lookback windows, where platform terms permit storage.',
        },
        {
          title: 'When a number is missing, it says so',
          body: 'Reach, saves, follower trends & other metrics read as unavailable when a connected platform doesn’t expose them.',
        },
      ]}
    />
  );
}
