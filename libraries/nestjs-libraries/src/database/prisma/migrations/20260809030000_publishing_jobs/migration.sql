-- Durable per-destination publishing state. Post remains the content record;
-- PublishingJob is the operational ledger used by workers and operators.
CREATE TYPE "PublishingJobState" AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'QUEUED',
    'PROCESSING',
    'PUBLISHED',
    'PARTIAL_SUCCESS',
    'RETRYING',
    'FAILED',
    'CANCELLED'
);

CREATE TABLE "PublishingJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "state" "PublishingJobState" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "failureCategory" TEXT,
    "providerPostId" TEXT,
    "providerUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishingJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublishingJob_postId_key" ON "PublishingJob"("postId");
CREATE UNIQUE INDEX "PublishingJob_idempotencyKey_key" ON "PublishingJob"("idempotencyKey");
CREATE INDEX "PublishingJob_organizationId_state_idx" ON "PublishingJob"("organizationId", "state");
CREATE INDEX "PublishingJob_provider_state_idx" ON "PublishingJob"("provider", "state");
CREATE INDEX "PublishingJob_nextAttemptAt_idx" ON "PublishingJob"("nextAttemptAt");
CREATE INDEX "PublishingJob_updatedAt_idx" ON "PublishingJob"("updatedAt");

ALTER TABLE "PublishingJob"
    ADD CONSTRAINT "PublishingJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingJob"
    ADD CONSTRAINT "PublishingJob_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing scheduled content receives an operational ledger entry without
-- changing its content state or re-triggering a workflow.
INSERT INTO "PublishingJob" (
    "id",
    "organizationId",
    "postId",
    "provider",
    "state",
    "idempotencyKey",
    "attempts",
    "completedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'job_' || md5(p."id"),
    p."organizationId",
    p."id",
    split_part(i."providerIdentifier", '-', 1),
    CASE p."state"::text
        WHEN 'DRAFT' THEN 'DRAFT'::"PublishingJobState"
        WHEN 'PUBLISHED' THEN 'PUBLISHED'::"PublishingJobState"
        WHEN 'ERROR' THEN 'FAILED'::"PublishingJobState"
        ELSE 'SCHEDULED'::"PublishingJobState"
    END,
    'publish:' || p."id",
    0,
    CASE
        WHEN p."state"::text IN ('PUBLISHED', 'ERROR') THEN p."updatedAt"
        ELSE NULL
    END,
    p."createdAt",
    p."updatedAt"
FROM "Post" p
JOIN "Integration" i ON i."id" = p."integrationId";
