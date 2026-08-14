import { proxyActivities } from '@temporalio/workflow';
import { BulkImportActivity } from '@gitroom/orchestrator/activities/bulk-import.activity';

const { processBulkImportBatch } = proxyActivities<BulkImportActivity>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '2 minutes',
    maximumAttempts: 8,
  },
});

export async function bulkImportWorkflowV101(input: {
  organizationId: string;
  importId: string;
}) {
  while (true) {
    const result = await processBulkImportBatch(
      input.organizationId,
      input.importId
    );
    if (result.done) {
      return result;
    }
  }
}
