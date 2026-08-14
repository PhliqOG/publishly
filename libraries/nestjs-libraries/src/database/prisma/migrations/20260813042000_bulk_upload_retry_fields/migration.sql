ALTER TABLE "BulkUploadSession"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

ALTER TABLE "BulkUploadSession"
  DROP CONSTRAINT "BulkUploadSession_sizes",
  ADD CONSTRAINT "BulkUploadSession_sizes" CHECK (
    "expectedByteLength" BETWEEN 1 AND 1073741824 AND
    "chunkSize" BETWEEN 1 AND 8388608 AND
    "totalParts" BETWEEN 1 AND 128 AND
    "receivedParts" BETWEEN 0 AND "totalParts" AND
    "receivedBytes" BETWEEN 0 AND "expectedByteLength" AND
    "position" >= 0 AND "revision" > 0 AND "attemptCount" >= 0
  );

ALTER TABLE "BulkUploadSession"
  DROP CONSTRAINT "BulkUploadSession_terminal_classified",
  ADD CONSTRAINT "BulkUploadSession_terminal_classified" CHECK (
    "state" NOT IN (
      'QUARANTINED', 'FAILED', 'RETRYABLE_FAILURE', 'FINAL_FAILURE',
      'ABORTED', 'EXPIRED'
    ) OR
    ("failureClass" IS NOT NULL AND length(btrim("failureCode")) > 0 AND length(btrim("failureReason")) > 0)
  );

CREATE INDEX "BulkUploadSession_retry_idx"
  ON "BulkUploadSession"("state", "nextAttemptAt", "leaseExpiresAt", "createdAt", "id");
