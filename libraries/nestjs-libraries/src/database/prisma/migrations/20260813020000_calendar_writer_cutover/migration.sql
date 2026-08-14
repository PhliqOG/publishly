-- Stage 5 calendar-writer cutover state and pre-materialization POST holds.
-- A held POST reservation owns the future stable Post ID before the Post row
-- exists. It must be attached before it can become COMMITTED.
ALTER TABLE "CalendarReservation"
  DROP CONSTRAINT "CalendarReservation_owner_link";

ALTER TABLE "CalendarReservation"
  ADD CONSTRAINT "CalendarReservation_owner_link" CHECK (
    (
      "ownerType" = 'POST' AND
      "campaignId" IS NULL AND
      "ownerId" = COALESCE("postId", "ownerId") AND
      ("postId" IS NOT NULL OR "state" IN ('HELD', 'CONFLICTED'))
    ) OR
    ("ownerType" = 'BULK_CAMPAIGN_SLOT' AND "campaignId" IS NOT NULL)
  );

-- Separate immutable owner intent ordering from optimistic row versioning.
-- Stage 4 initially used `revision` for both, which would make releasing an
-- older row collide with a newly inserted revision for the same owner.
ALTER TABLE "CalendarReservation"
  ADD COLUMN "ownerRevision" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "CalendarReservation_organizationId_ownerType_ownerId_revision_key";
DROP INDEX "CalendarReservation_organizationId_ownerType_ownerId_revision_idx";

CREATE UNIQUE INDEX "CalendarReservation_owner_revision_key"
  ON "CalendarReservation"("organizationId", "ownerType", "ownerId", "ownerRevision");
CREATE INDEX "CalendarReservation_owner_revision_idx"
  ON "CalendarReservation"("organizationId", "ownerType", "ownerId", "ownerRevision");

ALTER TABLE "CalendarReservation"
  ADD CONSTRAINT "CalendarReservation_owner_revision_positive" CHECK (
    "ownerRevision" >= 1
  );

ALTER TABLE "CalendarReservationBackfill"
  ADD COLUMN "authorityCursorCreatedAt" TIMESTAMP(3),
  ADD COLUMN "authorityCursorId" TEXT,
  ADD COLUMN "authorityPromotedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "authorityActivatedAt" TIMESTAMP(3);

ALTER TABLE "CalendarReservationBackfill"
  ADD CONSTRAINT "CalendarReservationBackfill_authority_cursor_pair" CHECK (
    ("authorityCursorCreatedAt" IS NULL) = ("authorityCursorId" IS NULL)
  ),
  ADD CONSTRAINT "CalendarReservationBackfill_authority_count_valid" CHECK (
    "authorityPromotedCount" >= 0
  );

CREATE INDEX "CalendarReservationBackfill_authorityActivatedAt_idx"
  ON "CalendarReservationBackfill"("authorityActivatedAt");
