-- Denormalize the tenant-owned destination onto publishing jobs so fleet
-- aggregates can use bounded groupBy queries instead of loading raw histories.
ALTER TABLE "PublishingJob" ADD COLUMN "integrationId" TEXT;

UPDATE "PublishingJob" AS job
SET "integrationId" = post."integrationId"
FROM "Post" AS post
WHERE post."id" = job."postId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "PublishingJob" WHERE "integrationId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill PublishingJob.integrationId from Post';
  END IF;
END $$;

ALTER TABLE "PublishingJob" ALTER COLUMN "integrationId" SET NOT NULL;

CREATE INDEX "PublishingJob_organizationId_integrationId_completedAt_idx"
  ON "PublishingJob"("organizationId", "integrationId", "completedAt");
CREATE INDEX "PublishingJob_integrationId_state_deliveryStage_idx"
  ON "PublishingJob"("integrationId", "state", "deliveryStage");

ALTER TABLE "PublishingJob"
  ADD CONSTRAINT "PublishingJob_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AccountTag" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#8C66FF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationAccountTag" (
  "integrationId" TEXT NOT NULL,
  "accountTagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationAccountTag_pkey" PRIMARY KEY ("integrationId", "accountTagId")
);

CREATE UNIQUE INDEX "AccountTag_organizationId_normalizedName_key"
  ON "AccountTag"("organizationId", "normalizedName");
CREATE INDEX "AccountTag_organizationId_name_idx"
  ON "AccountTag"("organizationId", "name");
CREATE INDEX "IntegrationAccountTag_accountTagId_integrationId_idx"
  ON "IntegrationAccountTag"("accountTagId", "integrationId");

ALTER TABLE "AccountTag"
  ADD CONSTRAINT "AccountTag_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAccountTag"
  ADD CONSTRAINT "IntegrationAccountTag_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAccountTag"
  ADD CONSTRAINT "IntegrationAccountTag_accountTagId_fkey"
  FOREIGN KEY ("accountTagId") REFERENCES "AccountTag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
