-- Generic tenant-scoped calendar reservation ledger and restartable shadow backfill.
CREATE TYPE "CalendarReservationOwnerType" AS ENUM ('POST', 'BULK_CAMPAIGN_SLOT');
CREATE TYPE "CalendarReservationMode" AS ENUM ('SHADOW', 'AUTHORITATIVE');
CREATE TYPE "CalendarReservationState" AS ENUM ('HELD', 'COMMITTED', 'RELEASED', 'CANCELLED', 'CONFLICTED');
CREATE TYPE "CalendarReservationBackfillState" AS ENUM ('PENDING', 'RUNNING', 'VERIFYING', 'VERIFIED', 'FAILED');

-- Composite tenant references are additive and do not rewrite either table.
CREATE UNIQUE INDEX "Integration_id_organizationId_key"
  ON "Integration"("id", "organizationId");
CREATE UNIQUE INDEX "Post_id_organizationId_key"
  ON "Post"("id", "organizationId");

CREATE TABLE "CalendarReservation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "ownerType" "CalendarReservationOwnerType" NOT NULL,
  "ownerId" TEXT NOT NULL,
  "postId" TEXT,
  "campaignId" TEXT,
  "source" TEXT NOT NULL,
  "writer" TEXT NOT NULL,
  "mode" "CalendarReservationMode" NOT NULL DEFAULT 'SHADOW',
  "state" "CalendarReservationState" NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "localScheduledAt" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "utcOffsetMinutes" INTEGER NOT NULL,
  "dstFold" INTEGER,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "outcomeClass" "BulkCampaignIssueClass",
  "outcomeCode" TEXT NOT NULL,
  "outcomeReason" TEXT NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarReservation_owner_nonempty" CHECK (
    length(btrim("ownerId")) BETWEEN 1 AND 240
  ),
  CONSTRAINT "CalendarReservation_owner_link" CHECK (
    ("ownerType" = 'POST' AND "postId" IS NOT NULL AND "campaignId" IS NULL AND "ownerId" = "postId") OR
    ("ownerType" = 'BULK_CAMPAIGN_SLOT' AND "campaignId" IS NOT NULL)
  ),
  CONSTRAINT "CalendarReservation_source_nonempty" CHECK (
    length(btrim("source")) BETWEEN 1 AND 120 AND length(btrim("writer")) BETWEEN 1 AND 120
  ),
  CONSTRAINT "CalendarReservation_local_intent_valid" CHECK (
    length(btrim("localScheduledAt")) BETWEEN 19 AND 40 AND
    length(btrim("timezone")) BETWEEN 1 AND 100 AND
    "utcOffsetMinutes" BETWEEN -840 AND 840 AND
    ("dstFold" IS NULL OR "dstFold" IN (0, 1))
  ),
  CONSTRAINT "CalendarReservation_revision_positive" CHECK ("revision" >= 1),
  CONSTRAINT "CalendarReservation_idempotency_nonempty" CHECK (
    length(btrim("idempotencyKey")) BETWEEN 1 AND 240
  ),
  CONSTRAINT "CalendarReservation_request_hash" CHECK (
    "requestHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "CalendarReservation_outcome_nonempty" CHECK (
    length(btrim("outcomeCode")) BETWEEN 1 AND 120 AND
    length(btrim("outcomeReason")) BETWEEN 1 AND 1000
  ),
  CONSTRAINT "CalendarReservation_shadow_not_held" CHECK (
    "mode" = 'AUTHORITATIVE' OR "state" <> 'HELD'
  ),
  CONSTRAINT "CalendarReservation_state_timestamps" CHECK (
    ("state" = 'HELD' AND "leaseExpiresAt" IS NOT NULL AND "releasedAt" IS NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'COMMITTED' AND "leaseExpiresAt" IS NULL AND "releasedAt" IS NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'RELEASED' AND "leaseExpiresAt" IS NULL AND "releasedAt" IS NOT NULL AND "cancelledAt" IS NULL) OR
    ("state" = 'CANCELLED' AND "leaseExpiresAt" IS NULL AND "releasedAt" IS NULL AND "cancelledAt" IS NOT NULL) OR
    ("state" = 'CONFLICTED' AND "leaseExpiresAt" IS NULL AND "releasedAt" IS NULL AND "cancelledAt" IS NULL AND "outcomeClass" = 'conflicted')
  )
);

CREATE TABLE "CalendarReservationBackfill" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "state" "CalendarReservationBackfillState" NOT NULL DEFAULT 'PENDING',
  "sourceHighWatermarkAt" TIMESTAMP(3),
  "sourceHighWatermarkId" TEXT,
  "cursorCreatedAt" TIMESTAMP(3),
  "cursorId" TEXT,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "insertedCount" INTEGER NOT NULL DEFAULT 0,
  "replayedCount" INTEGER NOT NULL DEFAULT 0,
  "conflictCount" INTEGER NOT NULL DEFAULT 0,
  "mismatchCount" INTEGER NOT NULL DEFAULT 0,
  "outcomeCode" TEXT NOT NULL,
  "outcomeReason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarReservationBackfill_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CalendarReservationBackfill_source_nonempty" CHECK (
    length(btrim("source")) BETWEEN 1 AND 120
  ),
  CONSTRAINT "CalendarReservationBackfill_watermark_pair" CHECK (
    ("sourceHighWatermarkAt" IS NULL) = ("sourceHighWatermarkId" IS NULL)
  ),
  CONSTRAINT "CalendarReservationBackfill_cursor_pair" CHECK (
    ("cursorCreatedAt" IS NULL) = ("cursorId" IS NULL)
  ),
  CONSTRAINT "CalendarReservationBackfill_counts_valid" CHECK (
    "scannedCount" >= 0 AND "insertedCount" >= 0 AND "replayedCount" >= 0 AND
    "conflictCount" >= 0 AND "mismatchCount" >= 0 AND
    "insertedCount" + "replayedCount" <= "scannedCount"
  ),
  CONSTRAINT "CalendarReservationBackfill_outcome_nonempty" CHECK (
    length(btrim("outcomeCode")) BETWEEN 1 AND 120 AND
    length(btrim("outcomeReason")) BETWEEN 1 AND 1000
  ),
  CONSTRAINT "CalendarReservationBackfill_state_timestamps" CHECK (
    ("state" = 'PENDING' AND "startedAt" IS NULL AND "completedAt" IS NULL AND "verifiedAt" IS NULL) OR
    ("state" = 'RUNNING' AND "startedAt" IS NOT NULL AND "completedAt" IS NULL AND "verifiedAt" IS NULL) OR
    ("state" = 'VERIFYING' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "verifiedAt" IS NULL) OR
    ("state" = 'VERIFIED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "verifiedAt" IS NOT NULL) OR
    ("state" = 'FAILED' AND "startedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "verifiedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "CalendarReservation_id_organizationId_key"
  ON "CalendarReservation"("id", "organizationId");
CREATE UNIQUE INDEX "CalendarReservation_organizationId_idempotencyKey_key"
  ON "CalendarReservation"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "CalendarReservation_organizationId_ownerType_ownerId_revision_key"
  ON "CalendarReservation"("organizationId", "ownerType", "ownerId", "revision");
CREATE INDEX "CalendarReservation_organizationId_integrationId_scheduledAt_mode_state_idx"
  ON "CalendarReservation"("organizationId", "integrationId", "scheduledAt", "mode", "state");
CREATE INDEX "CalendarReservation_organizationId_ownerType_ownerId_revision_idx"
  ON "CalendarReservation"("organizationId", "ownerType", "ownerId", "revision");
CREATE INDEX "CalendarReservation_organizationId_state_scheduledAt_id_idx"
  ON "CalendarReservation"("organizationId", "state", "scheduledAt", "id");
CREATE INDEX "CalendarReservation_organizationId_campaignId_scheduledAt_idx"
  ON "CalendarReservation"("organizationId", "campaignId", "scheduledAt");
CREATE INDEX "CalendarReservation_organizationId_postId_idx"
  ON "CalendarReservation"("organizationId", "postId");

-- Shadow rows deliberately do not participate so existing conflicts cannot
-- break the additive migration. This index is the authoritative slot gate.
CREATE UNIQUE INDEX "CalendarReservation_authoritative_active_slot_key"
  ON "CalendarReservation"("organizationId", "integrationId", "scheduledAt")
  WHERE "mode" = 'AUTHORITATIVE' AND "state" IN ('HELD', 'COMMITTED');

CREATE UNIQUE INDEX "CalendarReservationBackfill_organizationId_source_key"
  ON "CalendarReservationBackfill"("organizationId", "source");
CREATE INDEX "CalendarReservationBackfill_state_updatedAt_idx"
  ON "CalendarReservationBackfill"("state", "updatedAt");
CREATE INDEX "CalendarReservationBackfill_organizationId_state_idx"
  ON "CalendarReservationBackfill"("organizationId", "state");

ALTER TABLE "CalendarReservation" ADD CONSTRAINT "CalendarReservation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarReservation" ADD CONSTRAINT "CalendarReservation_integrationId_organizationId_fkey"
  FOREIGN KEY ("integrationId", "organizationId") REFERENCES "Integration"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarReservation" ADD CONSTRAINT "CalendarReservation_postId_organizationId_fkey"
  FOREIGN KEY ("postId", "organizationId") REFERENCES "Post"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarReservation" ADD CONSTRAINT "CalendarReservation_campaignId_organizationId_fkey"
  FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarReservationBackfill" ADD CONSTRAINT "CalendarReservationBackfill_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
