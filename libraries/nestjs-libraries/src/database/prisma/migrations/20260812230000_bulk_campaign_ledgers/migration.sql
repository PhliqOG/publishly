-- Bulk Scheduler campaign intent and issue ledgers. These tables are additive;
-- no existing Post or publishing row is rewritten by this migration.
CREATE TYPE "BulkCampaignState" AS ENUM (
  'DRAFT',
  'UPLOADING',
  'VALIDATING',
  'NORMALIZING',
  'PLANNING',
  'RESERVING',
  'SCHEDULED',
  'DISPATCHING',
  'PAUSED',
  'CANCELLING',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'NEEDS_REVIEW'
);

CREATE TYPE "BulkCampaignIssueClass" AS ENUM (
  'blocked',
  'failed',
  'conflicted',
  'quarantined',
  'overflow'
);

CREATE TYPE "BulkCampaignIssueState" AS ENUM ('open', 'resolved');

CREATE TYPE "BulkCampaignSubjectType" AS ENUM (
  'campaign',
  'upload',
  'asset',
  'campaign_asset',
  'destination',
  'schedule_slot',
  'publish_job'
);

CREATE TABLE "BulkCampaign" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "state" "BulkCampaignState" NOT NULL DEFAULT 'DRAFT',
  "idempotencyKeyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "currentRevision" INTEGER NOT NULL DEFAULT 1,
  "issueCount" INTEGER NOT NULL DEFAULT 0,
  "openIssueCount" INTEGER NOT NULL DEFAULT 0,
  "pausedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkCampaign_name_nonempty" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "BulkCampaign_revision_positive" CHECK ("currentRevision" >= 1),
  CONSTRAINT "BulkCampaign_issue_counts_valid" CHECK (
    "issueCount" >= 0 AND "openIssueCount" >= 0 AND "openIssueCount" <= "issueCount"
  )
);

CREATE TABLE "BulkCampaignIntent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "intent" JSONB NOT NULL,
  "intentHash" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BulkCampaignIntent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkCampaignIntent_revision_positive" CHECK ("revision" >= 1),
  CONSTRAINT "BulkCampaignIntent_schema_version_positive" CHECK ("schemaVersion" >= 1),
  CONSTRAINT "BulkCampaignIntent_object" CHECK (jsonb_typeof("intent") = 'object'),
  CONSTRAINT "BulkCampaignIntent_hash_nonempty" CHECK (length(btrim("intentHash")) = 64)
);

CREATE TABLE "BulkCampaignIssue" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "issueClass" "BulkCampaignIssueClass" NOT NULL,
  "failureClass" "PostFailureClass" NOT NULL,
  "code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "subjectType" "BulkCampaignSubjectType",
  "subjectId" TEXT,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "details" JSONB,
  "state" "BulkCampaignIssueState" NOT NULL DEFAULT 'open',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolutionCode" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkCampaignIssue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkCampaignIssue_event_key_nonempty" CHECK (length(btrim("eventKey")) BETWEEN 1 AND 240),
  CONSTRAINT "BulkCampaignIssue_code_nonempty" CHECK (length(btrim("code")) BETWEEN 1 AND 120),
  CONSTRAINT "BulkCampaignIssue_reason_nonempty" CHECK (length(btrim("reason")) BETWEEN 1 AND 2000),
  CONSTRAINT "BulkCampaignIssue_subject_pair" CHECK (
    ("subjectType" IS NULL AND "subjectId" IS NULL) OR
    ("subjectType" IS NOT NULL AND length(btrim("subjectId")) BETWEEN 1 AND 240)
  ),
  CONSTRAINT "BulkCampaignIssue_resolution_coherent" CHECK (
    ("state" = 'open' AND "resolvedAt" IS NULL AND "resolutionCode" IS NULL) OR
    ("state" = 'resolved' AND "resolvedAt" IS NOT NULL AND length(btrim("resolutionCode")) BETWEEN 1 AND 120)
  )
);

CREATE UNIQUE INDEX "BulkCampaign_id_organizationId_key"
  ON "BulkCampaign"("id", "organizationId");
CREATE UNIQUE INDEX "BulkCampaign_organizationId_idempotencyKeyHash_key"
  ON "BulkCampaign"("organizationId", "idempotencyKeyHash");
CREATE INDEX "BulkCampaign_organizationId_state_updatedAt_id_idx"
  ON "BulkCampaign"("organizationId", "state", "updatedAt", "id");

CREATE UNIQUE INDEX "BulkCampaignIntent_organizationId_campaignId_revision_key"
  ON "BulkCampaignIntent"("organizationId", "campaignId", "revision");
CREATE INDEX "BulkCampaignIntent_organizationId_campaignId_createdAt_id_idx"
  ON "BulkCampaignIntent"("organizationId", "campaignId", "createdAt", "id");
CREATE INDEX "BulkCampaignIntent_intentHash_idx"
  ON "BulkCampaignIntent"("intentHash");

CREATE UNIQUE INDEX "BulkCampaignIssue_organizationId_campaignId_eventKey_key"
  ON "BulkCampaignIssue"("organizationId", "campaignId", "eventKey");
CREATE INDEX "BulkCampaignIssue_organizationId_campaignId_state_occurredAt_id_idx"
  ON "BulkCampaignIssue"("organizationId", "campaignId", "state", "occurredAt", "id");
CREATE INDEX "BulkCampaignIssue_organizationId_issueClass_occurredAt_id_idx"
  ON "BulkCampaignIssue"("organizationId", "issueClass", "occurredAt", "id");
CREATE INDEX "BulkCampaignIssue_code_occurredAt_idx"
  ON "BulkCampaignIssue"("code", "occurredAt");

ALTER TABLE "BulkCampaign"
  ADD CONSTRAINT "BulkCampaign_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BulkCampaignIntent"
  ADD CONSTRAINT "BulkCampaignIntent_campaignId_organizationId_fkey"
  FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BulkCampaignIssue"
  ADD CONSTRAINT "BulkCampaignIssue_campaignId_organizationId_fkey"
  FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
