import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';

const { materializeDueBulkCampaignJobsV101 } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '10 seconds',
    backoffCoefficient: 2,
  },
});

export async function bulkCampaignMaterializerWorkflowV101(
  iterations = 0
): Promise<void> {
  while (iterations < 1_000) {
    await materializeDueBulkCampaignJobsV101();
    iterations += 1;
    await sleep('30 seconds');
  }
  return continueAsNew<typeof bulkCampaignMaterializerWorkflowV101>(0);
}
