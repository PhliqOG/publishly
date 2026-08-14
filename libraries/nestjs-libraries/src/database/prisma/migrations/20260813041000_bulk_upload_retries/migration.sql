-- Upload processing retries are explicit; FAILED remains a legacy-safe value
-- but new workers use RETRYABLE_FAILURE and FINAL_FAILURE.
ALTER TYPE "BulkUploadSessionState" ADD VALUE IF NOT EXISTS 'RETRYABLE_FAILURE';
ALTER TYPE "BulkUploadSessionState" ADD VALUE IF NOT EXISTS 'FINAL_FAILURE';
