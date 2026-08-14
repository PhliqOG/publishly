-- Preserve the exact resumable state. PAUSED is an operational gate, not a
-- lossy replacement for the campaign lifecycle position.
ALTER TABLE "BulkCampaign"
  ADD COLUMN "pausedFromState" "BulkCampaignState";

ALTER TABLE "BulkCampaign"
  ADD CONSTRAINT "BulkCampaign_pause_origin" CHECK (
    ("state" = 'PAUSED' AND "pausedAt" IS NOT NULL AND "pausedFromState" IS NOT NULL) OR
    ("state" <> 'PAUSED' AND "pausedFromState" IS NULL)
  );
