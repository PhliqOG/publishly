import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import { IntegrationsActivity } from '@gitroom/orchestrator/activities/integrations.activity';

const { recordPublishingEngineHeartbeatV101 } =
  proxyActivities<IntegrationsActivity>({
    startToCloseTimeout: '30 seconds',
    retry: {
      backoffCoefficient: 2,
      initialInterval: '5 seconds',
      maximumInterval: '30 seconds',
    },
  });

export async function publicStatusHeartbeatWorkflowV101() {
  // Keep histories comfortably below Temporal's warning/error thresholds. A
  // continued run preserves the stable workflow id while starting fresh
  // history, so Docker/VPS recovery never has to replay months of heartbeats.
  for (let heartbeat = 0; heartbeat < 500; heartbeat++) {
    await recordPublishingEngineHeartbeatV101();
    await sleep('1 minute');
  }
  await continueAsNew<typeof publicStatusHeartbeatWorkflowV101>();
}
