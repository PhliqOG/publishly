import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class PublicStatusHeartbeatRegistrar implements OnApplicationBootstrap {
  private readonly logger = new Logger(PublicStatusHeartbeatRegistrar.name);

  constructor(private readonly _temporal: TemporalService) {}

  async onApplicationBootstrap() {
    const workflow = this._temporal.client.getRawClient()?.workflow;
    if (!workflow) {
      this.logger.error({
        event: 'publishing_engine_heartbeat_registration_failed',
        code: 'temporal_client_unavailable',
        reason:
          'The orchestrator has no Temporal client for its publishing-engine heartbeat.',
      });
      return;
    }

    try {
      await workflow.start('publicStatusHeartbeatWorkflowV101', {
        workflowId: 'public-status-heartbeat-v101',
        taskQueue: 'main',
        workflowIdConflictPolicy: 'USE_EXISTING',
      });
      this.logger.log({
        event: 'publishing_engine_heartbeat_registered',
        code: 'heartbeat_workflow_registered',
        reason:
          'The durable publishing-engine heartbeat workflow is registered.',
      });
    } catch (error) {
      this.logger.error({
        event: 'publishing_engine_heartbeat_registration_failed',
        code: 'heartbeat_workflow_registration_failed',
        reason:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Temporal rejected the publishing-engine heartbeat workflow without usable detail.',
      });
    }
  }
}
