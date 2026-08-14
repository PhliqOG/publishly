import { proxyActivities, sleep } from '@temporalio/workflow';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';

const { evaluateConnectionHealthFleetV101 } =
  proxyActivities<IntegrationsActivity>({
    startToCloseTimeout: '30 minutes',
    retry: {
      backoffCoefficient: 2,
      initialInterval: '10 seconds',
      maximumInterval: '10 minutes',
    },
  });

export async function connectionHealthSweepWorkflowV101() {
  while (true) {
    await evaluateConnectionHealthFleetV101();
    await sleep('6 hours');
  }
}
