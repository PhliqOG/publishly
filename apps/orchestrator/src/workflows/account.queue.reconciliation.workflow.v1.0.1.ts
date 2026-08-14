import { proxyActivities, sleep } from '@temporalio/workflow';
import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';

const { reconcileAccountPublishingQueuesV109 } = proxyActivities<PostActivity>({
  startToCloseTimeout: '10 minutes',
  retry: {
    backoffCoefficient: 2,
    initialInterval: '10 seconds',
    maximumInterval: '5 minutes',
  },
});

export async function accountQueueReconciliationWorkflowV101() {
  while (true) {
    await reconcileAccountPublishingQueuesV109();
    await sleep('15 minutes');
  }
}
