import {
  Global,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';

@Injectable()
export class InfiniteWorkflowRegister implements OnModuleInit {
  private readonly logger = new Logger(InfiniteWorkflowRegister.name);
  constructor(private _temporalService: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.RUN_CRON === 'true') {
      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('missingPostWorkflow', {
            workflowId: 'missing-post-workflow',
            taskQueue: 'main',
          });
      } catch (err) {
        this.logger.warn({
          event: 'missing_post_workflow_start_skipped',
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('bulkCampaignMaterializerWorkflowV101', {
            workflowId: 'bulk-campaign-materializer-v101',
            taskQueue: 'main',
            workflowIdConflictPolicy: 'USE_EXISTING',
          });
      } catch (err) {
        this.logger.warn({
          event: 'bulk_campaign_materializer_start_skipped',
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('platformTruthSweepWorkflowV101', {
            workflowId: 'platform-truth-sweep-v101',
            taskQueue: 'main',
          });
      } catch (err) {
        this.logger.warn({
          event: 'platform_truth_sweep_start_skipped',
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('publishingRetrySweepWorkflowV101', {
            workflowId: 'publishing-retry-sweep-v101',
            taskQueue: 'main',
          });
      } catch (err) {
        this.logger.warn({
          event: 'publishing_retry_sweep_start_skipped',
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('connectionHealthSweepWorkflowV101', {
            workflowId: 'connection-health-sweep-v101',
            taskQueue: 'main',
          });
      } catch (err) {
        this.logger.warn({
          event: 'connection_health_sweep_start_skipped',
          reason: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        await this._temporalService.client
          ?.getRawClient()
          ?.workflow?.start('accountQueueReconciliationWorkflowV101', {
            workflowId: 'account-queue-reconciliation-v101',
            taskQueue: 'main',
          });
      } catch (err) {
        this.logger.warn({
          event: 'account_queue_reconciliation_start_skipped',
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [InfiniteWorkflowRegister],
  get exports() {
    return this.providers;
  },
})
export class InfiniteWorkflowRegisterModule {}
