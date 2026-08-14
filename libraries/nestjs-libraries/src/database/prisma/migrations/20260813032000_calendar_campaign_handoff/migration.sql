-- A Bulk Scheduler slot is transferred to its deterministic Post immediately
-- before Post materialization. The campaign link remains for audit/history;
-- ordinary POST acquisitions still omit campaignId at the service boundary.
ALTER TABLE "CalendarReservation"
  DROP CONSTRAINT "CalendarReservation_owner_link";

ALTER TABLE "CalendarReservation"
  ADD CONSTRAINT "CalendarReservation_owner_link" CHECK (
    (
      "ownerType" = 'POST' AND
      ("postId" IS NULL OR "ownerId" = "postId") AND
      ("state" <> 'COMMITTED' OR "postId" IS NOT NULL)
    ) OR
    ("ownerType" = 'BULK_CAMPAIGN_SLOT' AND "campaignId" IS NOT NULL)
  );
