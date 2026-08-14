import { proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { retryDuePublishingQueuesV108 } = proxyActivities<PostActivity>({
  startToCloseTimeout: '5 minutes',
  retry: {
    backoffCoefficient: 2,
    initialInterval: '5 seconds',
    maximumInterval: '1 minute',
  },
});

/** Durable recovery for posts whose initial Temporal start could not be queued. */
export async function publishingRetrySweepWorkflowV101() {
  while (true) {
    await retryDuePublishingQueuesV108();
    await sleep('1 minute');
  }
}
