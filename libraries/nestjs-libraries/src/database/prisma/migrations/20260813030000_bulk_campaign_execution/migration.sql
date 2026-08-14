-- Stage 6 is additive. Campaign jobs are the database source of truth; queue
-- messages and Temporal histories are transports only.
CREATE TYPE "BulkCampaignJobState" AS ENUM (
  'PLANNED',
  'RESERVING',
  'RESERVED',
  'CLAIMED',
  'MATERIALIZING',
  'SCHEDULED',
  'DISPATCHING',
  'PUBLISHED',
  'PAUSED',
  'CANCELLING',
  'CANCELLED',
  'RETRYABLE_FAILURE',
  'FINAL_FAILURE',
  'NEEDS_REVIEW',
  'CONFLICTED',
  'OVERFLOW',
  'QUARANTINED',
  'BLOCKED'
);

CREATE TYPE "PublishingAttemptPhase" AS ENUM (
  'MUTATION',
  'RECONCILIATION',
  'VERIFICATION'
);

CREATE TYPE "PublishingAttemptState" AS ENUM (
  'STARTED',
  'ACCEPTED',
  'CONFIRMED',
  'ABSENT',
  'AMBIGUOUS',
  'FAILED',
  'NEEDS_REVIEW'
);

CREATE TABLE "BulkCampaignJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "intentRevision" INTEGER NOT NULL,
  "assetId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "capabilityTupleId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "destinationOrdinal" INTEGER NOT NULL,
  "state" "BulkCampaignJobState" NOT NULL DEFAULT 'PLANNED',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "localScheduledAt" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "utcOffsetMinutes" INTEGER NOT NULL,
  "dstFold" INTEGER,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "reservationId" TEXT,
  "postId" TEXT,
  "publishingJobId" TEXT,
  "claimTokenHash" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "outcomeClass" "BulkCampaignIssueClass",
  "outcomeCode" TEXT NOT NULL,
  "outcomeReason" TEXT NOT NULL,
  "materializedAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BulkCampaignJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkCampaignJob_positive_numbers" CHECK (
    "intentRevision" > 0 AND "ordinal" >= 0 AND
    "destinationOrdinal" >= 0 AND "revision" > 0 AND "attemptCount" >= 0
  ),
  CONSTRAINT "BulkCampaignJob_local_intent" CHECK (
    length(btrim("localScheduledAt")) > 0 AND
    length(btrim("timezone")) > 0 AND
    "utcOffsetMinutes" BETWEEN -840 AND 840 AND
    ("dstFold" IS NULL OR "dstFold" IN (0, 1))
  ),
  CONSTRAINT "BulkCampaignJob_outcome_nonempty" CHECK (
    length(btrim("capabilityTupleId")) > 0 AND
    length(btrim("outcomeCode")) > 0 AND
    length(btrim("outcomeReason")) > 0
  ),
  CONSTRAINT "BulkCampaignJob_failure_classified" CHECK (
    "state" NOT IN (
      'RETRYABLE_FAILURE', 'FINAL_FAILURE', 'NEEDS_REVIEW', 'CONFLICTED',
      'OVERFLOW', 'QUARANTINED', 'BLOCKED'
    ) OR "outcomeClass" IS NOT NULL
  ),
  CONSTRAINT "BulkCampaignJob_claim_pair" CHECK (
    ("claimTokenHash" IS NULL) = ("leaseExpiresAt" IS NULL)
  ),
  CONSTRAINT "BulkCampaignJob_active_claim" CHECK (
    "state" NOT IN ('CLAIMED', 'MATERIALIZING') OR
    ("claimTokenHash" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)
  ),
  CONSTRAINT "BulkCampaignJob_link_order" CHECK (
    "publishingJobId" IS NULL OR "postId" IS NOT NULL
  ),
  CONSTRAINT "BulkCampaignJob_terminal_times" CHECK (
    ("state" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL) AND
    ("state" <> 'CANCELLED' OR "cancelledAt" IS NOT NULL)
  )
);

CREATE TABLE "PublishingAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "publishingJobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "phase" "PublishingAttemptPhase" NOT NULL,
  "state" "PublishingAttemptState" NOT NULL DEFAULT 'STARTED',
  "activityKey" TEXT NOT NULL,
  "mutationFingerprint" TEXT NOT NULL,
  "mutationInvoked" BOOLEAN NOT NULL DEFAULT false,
  "providerPostId" TEXT,
  "providerUrl" TEXT,
  "failureClass" "PostFailureClass",
  "failureCode" TEXT,
  "failureReason" TEXT,
  "evidence" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PublishingAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublishingAttempt_positive_attempt" CHECK ("attemptNumber" > 0),
  CONSTRAINT "PublishingAttempt_keys_nonempty" CHECK (
    length(btrim("activityKey")) > 0 AND
    length(btrim("mutationFingerprint")) > 0
  ),
  CONSTRAINT "PublishingAttempt_failure_triple" CHECK (
    ("failureClass" IS NULL AND "failureCode" IS NULL AND "failureReason" IS NULL) OR
    ("failureClass" IS NOT NULL AND length(btrim("failureCode")) > 0 AND length(btrim("failureReason")) > 0)
  ),
  CONSTRAINT "PublishingAttempt_terminal_classified" CHECK (
    "state" NOT IN ('AMBIGUOUS', 'FAILED', 'NEEDS_REVIEW') OR
    ("failureClass" IS NOT NULL AND length(btrim("failureCode")) > 0 AND length(btrim("failureReason")) > 0)
  ),
  CONSTRAINT "PublishingAttempt_completion" CHECK (
    ("state" = 'STARTED' AND "completedAt" IS NULL) OR
    ("state" <> 'STARTED' AND "completedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "BulkCampaignJob_id_org_key"
  ON "BulkCampaignJob"("id", "organizationId");
CREATE UNIQUE INDEX "BulkCampaignJob_campaign_ordinal_key"
  ON "BulkCampaignJob"("organizationId", "campaignId", "intentRevision", "ordinal");
CREATE UNIQUE INDEX "BulkCampaignJob_asset_destination_key"
  ON "BulkCampaignJob"("organizationId", "campaignId", "intentRevision", "assetId", "integrationId");
CREATE UNIQUE INDEX "BulkCampaignJob_reservation_key" ON "BulkCampaignJob"("reservationId");
CREATE UNIQUE INDEX "BulkCampaignJob_reservation_org_key" ON "BulkCampaignJob"("reservationId", "organizationId");
CREATE UNIQUE INDEX "BulkCampaignJob_post_key" ON "BulkCampaignJob"("postId");
CREATE UNIQUE INDEX "BulkCampaignJob_post_org_key" ON "BulkCampaignJob"("postId", "organizationId");
CREATE UNIQUE INDEX "BulkCampaignJob_publishing_key" ON "BulkCampaignJob"("publishingJobId");
CREATE UNIQUE INDEX "BulkCampaignJob_publishing_org_key" ON "BulkCampaignJob"("publishingJobId", "organizationId");
CREATE INDEX "BulkCampaignJob_campaign_state_idx"
  ON "BulkCampaignJob"("organizationId", "campaignId", "state", "scheduledAt", "id");
CREATE INDEX "BulkCampaignJob_claim_idx"
  ON "BulkCampaignJob"("state", "scheduledAt", "leaseExpiresAt", "id");
CREATE INDEX "BulkCampaignJob_integration_time_idx"
  ON "BulkCampaignJob"("organizationId", "integrationId", "scheduledAt");
CREATE INDEX "BulkCampaignJob_tuple_state_idx"
  ON "BulkCampaignJob"("organizationId", "capabilityTupleId", "state");

CREATE UNIQUE INDEX "PublishingAttempt_id_org_key"
  ON "PublishingAttempt"("id", "organizationId");
CREATE UNIQUE INDEX "PublishingAttempt_activity_key"
  ON "PublishingAttempt"("organizationId", "publishingJobId", "activityKey");
CREATE UNIQUE INDEX "PublishingAttempt_phase_key"
  ON "PublishingAttempt"("organizationId", "publishingJobId", "attemptNumber", "phase");
CREATE INDEX "PublishingAttempt_job_time_idx"
  ON "PublishingAttempt"("organizationId", "publishingJobId", "startedAt", "id");
CREATE INDEX "PublishingAttempt_state_time_idx" ON "PublishingAttempt"("state", "startedAt");
CREATE INDEX "PublishingAttempt_failure_time_idx" ON "PublishingAttempt"("failureCode", "startedAt");

ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_campaign_org_fkey"
  FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_asset_org_fkey"
  FOREIGN KEY ("assetId", "organizationId") REFERENCES "BulkAsset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_integration_org_fkey"
  FOREIGN KEY ("integrationId", "organizationId") REFERENCES "Integration"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_reservation_org_fkey"
  FOREIGN KEY ("reservationId", "organizationId") REFERENCES "CalendarReservation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_post_org_fkey"
  FOREIGN KEY ("postId", "organizationId") REFERENCES "Post"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_publishing_org_fkey"
  FOREIGN KEY ("publishingJobId", "organizationId") REFERENCES "PublishingJob"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublishingAttempt"
  ADD CONSTRAINT "PublishingAttempt_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishingAttempt"
  ADD CONSTRAINT "PublishingAttempt_job_org_fkey"
  FOREIGN KEY ("publishingJobId", "organizationId") REFERENCES "PublishingJob"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
