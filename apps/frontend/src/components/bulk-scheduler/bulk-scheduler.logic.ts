import {
  bulkCampaignExpandedJobCount,
  MAX_BULK_CAMPAIGN_JOBS,
} from '@gitroom/helpers/bulk-scheduler/limits.contract';

export type SchedulerDestination = {
  integrationId: string;
  capabilityTupleId: string;
};

export function bulkExpansionMath(input: {
  assetCount: number;
  destinationCount: number;
  distributionMode: 'cross_post' | 'distribute';
}) {
  const expandedJobCount = bulkCampaignExpandedJobCount(input);
  return {
    assetCount: input.assetCount,
    destinationCount: input.destinationCount,
    expandedJobCount,
    maximumExpandedJobs: MAX_BULK_CAMPAIGN_JOBS,
    overLimit: expandedJobCount > MAX_BULK_CAMPAIGN_JOBS,
    formula:
      input.distributionMode === 'cross_post'
        ? `${input.assetCount} assets × ${input.destinationCount} destinations = ${expandedJobCount} jobs`
        : `${input.assetCount} assets distributed across ${input.destinationCount} destinations = ${expandedJobCount} jobs`,
  };
}

export function clientUploadId(file: {
  name: string;
  size: number;
  lastModified: number;
  relativePath?: string;
}) {
  const source = `${file.relativePath || file.name}:${file.size}:${file.lastModified}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `browser-file-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function selectedDestinationAvailability(input: {
  integrations: Array<{ id: string; identifier: string; disabled?: boolean }>;
  tuples: Array<{
    id: string;
    provider: string;
    integrationDecisions?: Array<{
      integrationId: string;
      eligible: boolean;
      code: string;
      reason: string;
    }>;
  }>;
}) {
  return input.integrations.flatMap((integration) =>
    input.tuples
      .filter((tuple) => tuple.provider === integration.identifier)
      .map((tuple) => {
        const decision = tuple.integrationDecisions?.find(
          (item) => item.integrationId === integration.id
        );
        return {
          integrationId: integration.id,
          capabilityTupleId: tuple.id,
          eligible: !integration.disabled && decision?.eligible === true,
          code: integration.disabled
            ? 'connection_disconnected'
            : decision?.code || 'capability_tuple_disabled',
          reason: integration.disabled
            ? 'Reconnect this account before scheduling.'
            : decision?.reason || 'This exact combination is disabled.',
        };
      })
  );
}
