CREATE TABLE "SuccessfulPostUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SuccessfulPostUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuccessfulPostUsage_postId_key"
  ON "SuccessfulPostUsage"("postId");

CREATE UNIQUE INDEX "SuccessfulPostUsage_receiptId_key"
  ON "SuccessfulPostUsage"("receiptId");

CREATE INDEX "SuccessfulPostUsage_organizationId_confirmedAt_idx"
  ON "SuccessfulPostUsage"("organizationId", "confirmedAt");

CREATE INDEX "SuccessfulPostUsage_provider_confirmedAt_idx"
  ON "SuccessfulPostUsage"("provider", "confirmedAt");

ALTER TABLE "SuccessfulPostUsage"
  ADD CONSTRAINT "SuccessfulPostUsage_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Paid account counts are no longer commercial entitlements. Normalize old
-- finite rows to the signed Int compatibility sentinel used for "unlimited".
UPDATE "Subscription"
SET "totalChannels" = 2147483647
WHERE "subscriptionTier" IN ('STANDARD', 'TEAM', 'PRO', 'ULTIMATE');
