-- Overflow/quarantine/block rows represent an expanded item for which no
-- calendar instant exists. Keeping a fabricated timestamp would be a silent
-- scheduling lie, so the three resolved-slot fields become atomically nullable.
ALTER TABLE "BulkCampaignJob"
  DROP CONSTRAINT "BulkCampaignJob_local_intent";

ALTER TABLE "BulkCampaignJob"
  ALTER COLUMN "scheduledAt" DROP NOT NULL,
  ALTER COLUMN "localScheduledAt" DROP NOT NULL,
  ALTER COLUMN "utcOffsetMinutes" DROP NOT NULL;

ALTER TABLE "BulkCampaignJob"
  ADD CONSTRAINT "BulkCampaignJob_slot_tuple" CHECK (
    (
      "scheduledAt" IS NULL AND
      "localScheduledAt" IS NULL AND
      "utcOffsetMinutes" IS NULL AND
      "dstFold" IS NULL
    ) OR (
      "scheduledAt" IS NOT NULL AND
      length(btrim("localScheduledAt")) > 0 AND
      length(btrim("timezone")) > 0 AND
      "utcOffsetMinutes" BETWEEN -840 AND 840 AND
      ("dstFold" IS NULL OR "dstFold" IN (0, 1))
    )
  ),
  ADD CONSTRAINT "BulkCampaignJob_active_has_slot" CHECK (
    "state" IN ('OVERFLOW', 'QUARANTINED', 'BLOCKED') OR
    "scheduledAt" IS NOT NULL
  );
