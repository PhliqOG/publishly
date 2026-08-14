/** Shared hard limits consumed by planner, API error contracts, and UI preview. */
export const MAX_BULK_CAMPAIGN_JOBS = 100_000;

export function bulkCampaignExpandedJobCount(input: {
  assetCount: number;
  destinationCount: number;
  distributionMode: 'cross_post' | 'distribute';
}) {
  return input.distributionMode === 'cross_post'
    ? input.assetCount * input.destinationCount
    : input.assetCount;
}
