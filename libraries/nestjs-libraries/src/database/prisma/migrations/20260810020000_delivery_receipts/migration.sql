-- Append-only, per-platform post delivery lifecycle.
CREATE TYPE "DeliveryReceiptStage" AS ENUM (
  'queued',
  'uploading',
  'sent',
  'confirmed_live',
  'failed'
);

ALTER TABLE "PublishingJob"
  ADD COLUMN "deliveryStage" "DeliveryReceiptStage",
  ADD COLUMN "stageUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "confirmedLiveAt" TIMESTAMP(3);

CREATE TABLE "PublishingReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "publishingJobId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "stage" "DeliveryReceiptStage" NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "providerPostId" TEXT,
  "providerUrl" TEXT,
  "confirmationMethod" TEXT,
  "evidence" JSONB,
  "failureId" TEXT,
  "webhookState" "FailureWebhookState" NOT NULL DEFAULT 'PENDING',
  "webhookFinishedAt" TIMESTAMP(3),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublishingReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishingReceipt_confirmed_has_method" CHECK (
    "stage" <> 'confirmed_live'
    OR LENGTH(BTRIM(COALESCE("confirmationMethod", ''))) > 0
  ),
  CONSTRAINT "PublishingReceipt_failed_has_failure" CHECK (
    "stage" <> 'failed' OR "failureId" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "PublishingReceipt_failureId_key"
  ON "PublishingReceipt"("failureId");
CREATE INDEX "PublishingReceipt_organizationId_occurredAt_idx"
  ON "PublishingReceipt"("organizationId", "occurredAt");
CREATE INDEX "PublishingReceipt_postId_occurredAt_idx"
  ON "PublishingReceipt"("postId", "occurredAt");
CREATE INDEX "PublishingReceipt_provider_stage_occurredAt_idx"
  ON "PublishingReceipt"("provider", "stage", "occurredAt");
CREATE INDEX "PublishingReceipt_webhookState_occurredAt_idx"
  ON "PublishingReceipt"("webhookState", "occurredAt");

ALTER TABLE "PublishingReceipt"
  ADD CONSTRAINT "PublishingReceipt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingReceipt"
  ADD CONSTRAINT "PublishingReceipt_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingReceipt"
  ADD CONSTRAINT "PublishingReceipt_publishingJobId_fkey"
  FOREIGN KEY ("publishingJobId") REFERENCES "PublishingJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingReceipt"
  ADD CONSTRAINT "PublishingReceipt_failureId_fkey"
  FOREIGN KEY ("failureId") REFERENCES "PublishingFailure"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Historical successes are deliberately backfilled only through `sent`: the
-- old create response did not independently prove that the object was live.
INSERT INTO "PublishingReceipt" (
  "id", "organizationId", "postId", "publishingJobId", "provider",
  "stage", "attempt", "webhookState", "occurredAt"
)
SELECT
  'legacy_receipt:' || "id" || ':queued',
  "organizationId", "postId", "id", "provider", 'queued', "attempts",
  'NOT_CONFIGURED', "createdAt"
FROM "PublishingJob"
WHERE "state" IN ('QUEUED', 'PROCESSING', 'PUBLISHED', 'PARTIAL_SUCCESS');

INSERT INTO "PublishingReceipt" (
  "id", "organizationId", "postId", "publishingJobId", "provider",
  "stage", "attempt", "webhookState", "occurredAt"
)
SELECT
  'legacy_receipt:' || "id" || ':uploading',
  "organizationId", "postId", "id", "provider", 'uploading', "attempts",
  'NOT_CONFIGURED', COALESCE("startedAt", "updatedAt")
FROM "PublishingJob"
WHERE "state" IN ('PROCESSING', 'PUBLISHED', 'PARTIAL_SUCCESS');

INSERT INTO "PublishingReceipt" (
  "id", "organizationId", "postId", "publishingJobId", "provider",
  "stage", "attempt", "providerPostId", "providerUrl", "webhookState", "occurredAt"
)
SELECT
  'legacy_receipt:' || "id" || ':sent',
  "organizationId", "postId", "id", "provider", 'sent', "attempts",
  "providerPostId", "providerUrl", 'NOT_CONFIGURED', COALESCE("completedAt", "updatedAt")
FROM "PublishingJob"
WHERE "state" IN ('PUBLISHED', 'PARTIAL_SUCCESS');

INSERT INTO "PublishingReceipt" (
  "id", "organizationId", "postId", "publishingJobId", "provider",
  "stage", "attempt", "failureId", "webhookState", "occurredAt"
)
SELECT
  'legacy_receipt:' || pf."id" || ':failed',
  pf."organizationId", pf."postId", pf."publishingJobId", pf."provider",
  'failed', pf."attempt", pf."id", 'NOT_CONFIGURED', pf."occurredAt"
FROM "PublishingFailure" pf;

UPDATE "PublishingJob" pj
SET
  "deliveryStage" = CASE
    WHEN pf."id" IS NOT NULL THEN 'failed'::"DeliveryReceiptStage"
    WHEN pj."state" IN ('PUBLISHED', 'PARTIAL_SUCCESS') THEN 'sent'::"DeliveryReceiptStage"
    WHEN pj."state" = 'PROCESSING' THEN 'uploading'::"DeliveryReceiptStage"
    WHEN pj."state" = 'QUEUED' THEN 'queued'::"DeliveryReceiptStage"
    ELSE NULL
  END,
  "stageUpdatedAt" = CASE
    WHEN pf."id" IS NOT NULL THEN pf."occurredAt"
    WHEN pj."state" IN ('QUEUED', 'PROCESSING', 'PUBLISHED', 'PARTIAL_SUCCESS') THEN pj."updatedAt"
    ELSE NULL
  END,
  "sentAt" = CASE
    WHEN pj."state" IN ('PUBLISHED', 'PARTIAL_SUCCESS') THEN COALESCE(pj."completedAt", pj."updatedAt")
    ELSE NULL
  END,
  "confirmedLiveAt" = NULL
FROM (
  SELECT DISTINCT ON ("publishingJobId")
    "id", "publishingJobId", "occurredAt"
  FROM "PublishingFailure"
  ORDER BY "publishingJobId", "occurredAt" DESC, "id" DESC
) pf
WHERE pf."publishingJobId" = pj."id";

-- Jobs without a failure row are not returned by the LATERAL update above.
UPDATE "PublishingJob"
SET
  "deliveryStage" = CASE
    WHEN "state" IN ('PUBLISHED', 'PARTIAL_SUCCESS') THEN 'sent'::"DeliveryReceiptStage"
    WHEN "state" = 'PROCESSING' THEN 'uploading'::"DeliveryReceiptStage"
    WHEN "state" = 'QUEUED' THEN 'queued'::"DeliveryReceiptStage"
    ELSE NULL
  END,
  "stageUpdatedAt" = CASE
    WHEN "state" IN ('QUEUED', 'PROCESSING', 'PUBLISHED', 'PARTIAL_SUCCESS') THEN "updatedAt"
    ELSE NULL
  END,
  "sentAt" = CASE
    WHEN "state" IN ('PUBLISHED', 'PARTIAL_SUCCESS') THEN COALESCE("completedAt", "updatedAt")
    ELSE NULL
  END
WHERE "deliveryStage" IS NULL;
