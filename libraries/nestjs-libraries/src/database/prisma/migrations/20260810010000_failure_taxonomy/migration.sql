-- Closed post-failure taxonomy plus append-only failure occurrences.
CREATE TYPE "PostFailureClass" AS ENUM (
  'recoverable',
  'user_action_needed',
  'data_problem'
);

CREATE TYPE "FailureWebhookState" AS ENUM (
  'PENDING',
  'NOT_CONFIGURED',
  'DELIVERED',
  'FAILED'
);

ALTER TABLE "PublishingJob"
  ADD COLUMN "failureClass" "PostFailureClass",
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureReason" TEXT;

-- Existing failed/retrying rows receive a complete compatibility taxonomy.
-- `failureCategory` remains populated with the stable code for old clients.
UPDATE "PublishingJob"
SET
  "failureCode" = CASE
    WHEN "failureCategory" = 'outcome_unknown' THEN 'outcome_unknown'
    WHEN "failureCategory" = 'queue_unavailable' THEN 'queue_unavailable'
    WHEN "failureCategory" = 'provider_transient' THEN 'provider_unavailable'
    WHEN "failureCategory" = 'rate_limit' THEN 'rate_limited'
    WHEN "failureCategory" = 'authentication' AND "state" = 'RETRYING' THEN 'token_refresh_required'
    WHEN "failureCategory" = 'authentication' THEN 'reconnect_required'
    WHEN "failureCategory" = 'provider_validation' THEN 'provider_rejected_content'
    ELSE 'internal_error'
  END,
  "failureClass" = CASE
    WHEN "failureCategory" = 'outcome_unknown' THEN 'user_action_needed'::"PostFailureClass"
    WHEN "failureCategory" = 'authentication' AND "state" <> 'RETRYING' THEN 'user_action_needed'::"PostFailureClass"
    WHEN "failureCategory" = 'provider_validation' THEN 'data_problem'::"PostFailureClass"
    ELSE 'recoverable'::"PostFailureClass"
  END,
  "failureReason" = CASE
    WHEN LOWER(BTRIM(COALESCE("lastError", ''))) IN (
      '',
      'unknown',
      'unknown error',
      'an unknown error occurred',
      'error',
      'failed',
      'failure',
      '{}',
      '[object object]'
    ) THEN 'Publishly imported this historical failure with no usable provider detail. Review the stable failure code before retrying.'
    ELSE LEFT(BTRIM("lastError"), 2000)
  END
WHERE "state" IN ('RETRYING', 'FAILED');

UPDATE "PublishingJob"
SET
  "lastError" = "failureReason",
  "failureCategory" = "failureCode"
WHERE "state" IN ('RETRYING', 'FAILED');

CREATE TABLE "PublishingFailure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "publishingJobId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "failureClass" "PostFailureClass" NOT NULL,
  "failureCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "willRetry" BOOLEAN NOT NULL DEFAULT false,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "webhookState" "FailureWebhookState" NOT NULL DEFAULT 'PENDING',
  "webhookFinishedAt" TIMESTAMP(3),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublishingFailure_pkey" PRIMARY KEY ("id")
);

-- Preserve failure history for rows that existed before the append-only ledger.
INSERT INTO "PublishingFailure" (
  "id",
  "organizationId",
  "postId",
  "publishingJobId",
  "provider",
  "failureClass",
  "failureCode",
  "reason",
  "willRetry",
  "attempt",
  "webhookState",
  "occurredAt"
)
SELECT
  'legacy:' || "id",
  "organizationId",
  "postId",
  "id",
  "provider",
  "failureClass",
  "failureCode",
  "failureReason",
  "state" = 'RETRYING',
  "attempts",
  'NOT_CONFIGURED'::"FailureWebhookState",
  "updatedAt"
FROM "PublishingJob"
WHERE "state" IN ('RETRYING', 'FAILED');

CREATE INDEX "PublishingFailure_organizationId_occurredAt_idx"
  ON "PublishingFailure"("organizationId", "occurredAt");
CREATE INDEX "PublishingFailure_postId_occurredAt_idx"
  ON "PublishingFailure"("postId", "occurredAt");
CREATE INDEX "PublishingFailure_provider_failureClass_occurredAt_idx"
  ON "PublishingFailure"("provider", "failureClass", "occurredAt");
CREATE INDEX "PublishingFailure_webhookState_occurredAt_idx"
  ON "PublishingFailure"("webhookState", "occurredAt");

ALTER TABLE "PublishingFailure"
  ADD CONSTRAINT "PublishingFailure_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishingFailure"
  ADD CONSTRAINT "PublishingFailure_failureCode_nonempty"
  CHECK (LENGTH(BTRIM("failureCode")) > 0),
  ADD CONSTRAINT "PublishingFailure_reason_nonempty"
  CHECK (LENGTH(BTRIM("reason")) > 0);

ALTER TABLE "PublishingJob"
  ADD CONSTRAINT "PublishingJob_failed_state_has_taxonomy"
  CHECK (
    "state" NOT IN ('RETRYING', 'FAILED')
    OR (
      "failureClass" IS NOT NULL
      AND LENGTH(BTRIM(COALESCE("failureCode", ''))) > 0
      AND LENGTH(BTRIM(COALESCE("failureReason", ''))) > 0
    )
  );

ALTER TABLE "PublishingFailure"
  ADD CONSTRAINT "PublishingFailure_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishingFailure"
  ADD CONSTRAINT "PublishingFailure_publishingJobId_fkey"
  FOREIGN KEY ("publishingJobId") REFERENCES "PublishingJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
