import { log, proxyActivities, sleep } from '@temporalio/workflow';
import { AutopostActivity } from '@gitroom/orchestrator/activities/autopost.activity';

const { autoPost } = proxyActivities<AutopostActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 1,
    initialInterval: '2 minutes',
  },
});

export async function autoPostWorkflow({
  id,
  immediately,
}: {
  id: string;
  immediately: boolean;
}) {
  while (true) {
    try {
      if (immediately) {
        await autoPost(id);
      }
    } catch (error) {
      log.error('Autopost generation failed after activity retries.', {
        code: 'autopost_generation_failed',
        reason:
          error instanceof Error && error.message
            ? error.message
            : 'The autopost activity failed without a provider reason.',
        autopostId: id,
        retryAt: 'next_hourly_cycle',
      });
    }
    immediately = true;
    await sleep(3600000);
  }
}
