import { proxyActivities, sleep } from '@temporalio/workflow';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';

const { evaluatePlatformTruthFleetV101 } =
  proxyActivities<IntegrationsActivity>({
    startToCloseTimeout: '30 minutes',
    retry: {
      backoffCoefficient: 2,
      initialInterval: '10 seconds',
      maximumInterval: '10 minutes',
    },
  });

export async function platformTruthSweepWorkflowV101() {
  while (true) {
    await evaluatePlatformTruthFleetV101();
    await sleep('6 hours');
  }
}
