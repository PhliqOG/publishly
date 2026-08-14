-- A pre-materialization POST hold may terminate without ever creating a Post.
-- COMMITTED remains the only state that requires the tenant-qualified Post FK.
ALTER TABLE "CalendarReservation"
  DROP CONSTRAINT "CalendarReservation_owner_link";

ALTER TABLE "CalendarReservation"
  ADD CONSTRAINT "CalendarReservation_owner_link" CHECK (
    (
      "ownerType" = 'POST' AND
      "campaignId" IS NULL AND
      ("postId" IS NULL OR "ownerId" = "postId") AND
      ("state" <> 'COMMITTED' OR "postId" IS NOT NULL)
    ) OR
    ("ownerType" = 'BULK_CAMPAIGN_SLOT' AND "campaignId" IS NOT NULL)
  );
