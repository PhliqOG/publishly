-- A durable, redacted projection of what a connected platform can actually do.
CREATE TYPE "PlatformTruthState" AS ENUM (
  'NOT_APPLICABLE',
  'READY',
  'LIMITED',
  'INVALID',
  'UNKNOWN'
);

CREATE TYPE "PlatformPublishingMode" AS ENUM (
  'NOT_APPLICABLE',
  'PUBLIC_CAPABLE',
  'ACCOUNT_RESTRICTED',
  'SELF_ONLY',
  'UNKNOWN'
);

CREATE TYPE "PlatformAuditState" AS ENUM (
  'NOT_APPLICABLE',
  'AUDITED',
  'UNAUDITED',
  'UNKNOWN'
);

ALTER TYPE "ConnectionHealthEventType" ADD VALUE IF NOT EXISTS 'PLATFORM_READY';
ALTER TYPE "ConnectionHealthEventType" ADD VALUE IF NOT EXISTS 'PLATFORM_LIMITATION';
ALTER TYPE "ConnectionHealthEventType" ADD VALUE IF NOT EXISTS 'PLATFORM_INVALID';
ALTER TYPE "ConnectionHealthEventType" ADD VALUE IF NOT EXISTS 'PLATFORM_TRUTH_UNKNOWN';

ALTER TABLE "Integration"
  ADD COLUMN "platformTruthState" "PlatformTruthState" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "platformPublishingMode" "PlatformPublishingMode" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "platformAuditState" "PlatformAuditState" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "platformTruthCode" TEXT,
  ADD COLUMN "platformTruthReason" TEXT,
  ADD COLUMN "platformTruthCheckedAt" TIMESTAMP(3),
  ADD COLUMN "platformTruthChangedAt" TIMESTAMP(3),
  ADD COLUMN "platformAccountType" TEXT,
  ADD COLUMN "platformLinkedResourceId" TEXT,
  ADD COLUMN "platformTruthMetadata" JSONB;

-- Existing platform-sensitive connections are unknown until a provider read
-- proves their current state. Never infer an audit or Page link from secrets.
UPDATE "Integration"
SET
  "platformTruthState" = 'UNKNOWN',
  "platformPublishingMode" = 'UNKNOWN',
  "platformAuditState" = CASE
    WHEN LOWER("providerIdentifier") = 'tiktok' THEN 'UNKNOWN'::"PlatformAuditState"
    ELSE 'NOT_APPLICABLE'::"PlatformAuditState"
  END,
  "platformTruthCode" = CASE
    WHEN LOWER("providerIdentifier") = 'tiktok' THEN 'tiktok_truth_not_checked'
    ELSE 'instagram_requirements_not_checked'
  END,
  "platformTruthReason" = CASE
    WHEN LOWER("providerIdentifier") = 'tiktok'
      THEN 'Publishly has not yet queried TikTok creator visibility for this connection.'
    ELSE 'Publishly has not yet verified the Instagram account type and Facebook Page link for this connection.'
  END
WHERE "deletedAt" IS NULL
  AND LOWER("providerIdentifier") IN ('tiktok', 'instagram');

CREATE INDEX "Integration_platformTruthState_providerIdentifier_idx"
  ON "Integration"("platformTruthState", "providerIdentifier");
