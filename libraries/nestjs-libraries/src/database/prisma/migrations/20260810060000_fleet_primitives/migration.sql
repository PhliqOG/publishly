-- Account tags are archived instead of being hard-deleted so fleet filters and
-- historical assignments remain explainable.
ALTER TABLE "AccountTag" ADD COLUMN "deletedAt" TIMESTAMP(3);
DROP INDEX "AccountTag_organizationId_name_idx";
CREATE INDEX "AccountTag_organizationId_deletedAt_name_idx"
  ON "AccountTag"("organizationId", "deletedAt", "name");

-- Canonical many-to-many account groups replace the legacy one-customer-per-
-- integration grouping without invalidating existing fleet organization.
CREATE TABLE "AccountGroup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#3B82F6',
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationAccountGroup" (
  "integrationId" TEXT NOT NULL,
  "accountGroupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationAccountGroup_pkey" PRIMARY KEY ("integrationId", "accountGroupId")
);

WITH normalized_customers AS (
  SELECT
    customer.*,
    lower(regexp_replace(trim(customer."name"), '\s+', ' ', 'g')) AS base_normalized,
    row_number() OVER (
      PARTITION BY customer."orgId", lower(regexp_replace(trim(customer."name"), '\s+', ' ', 'g'))
      ORDER BY customer."createdAt", customer."id"
    ) AS duplicate_rank
  FROM "Customer" AS customer
  WHERE customer."deletedAt" IS NULL
)
INSERT INTO "AccountGroup" (
  "id",
  "organizationId",
  "name",
  "normalizedName",
  "createdAt",
  "updatedAt"
)
SELECT
  customer."id",
  customer."orgId",
  customer."name",
  CASE
    WHEN customer.duplicate_rank = 1 THEN customer.base_normalized
    ELSE customer.base_normalized || ' ' || customer."id"
  END,
  customer."createdAt",
  customer."updatedAt"
FROM normalized_customers AS customer;

INSERT INTO "IntegrationAccountGroup" ("integrationId", "accountGroupId", "createdAt")
SELECT integration."id", integration."customerId", integration."createdAt"
FROM "Integration" AS integration
INNER JOIN "AccountGroup" AS account_group ON account_group."id" = integration."customerId"
WHERE integration."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "AccountGroup_organizationId_normalizedName_key"
  ON "AccountGroup"("organizationId", "normalizedName");
CREATE INDEX "AccountGroup_organizationId_deletedAt_name_idx"
  ON "AccountGroup"("organizationId", "deletedAt", "name");
CREATE INDEX "IntegrationAccountGroup_accountGroupId_integrationId_idx"
  ON "IntegrationAccountGroup"("accountGroupId", "integrationId");

ALTER TABLE "AccountGroup"
  ADD CONSTRAINT "AccountGroup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAccountGroup"
  ADD CONSTRAINT "IntegrationAccountGroup_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationAccountGroup"
  ADD CONSTRAINT "IntegrationAccountGroup_accountGroupId_fkey"
  FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Persisted per-destination FIFO queues ensure two posts can never mutate the
-- same provider account simultaneously, even across worker restarts.
CREATE TYPE "AccountQueueItemStatus" AS ENUM (
  'WAITING',
  'COMPLETED',
  'FAILED',
  'AMBIGUOUS',
  'CANCELLED'
);

CREATE TABLE "AccountPublishingQueueState" (
  "integrationId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leasePostId" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "cooldownReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountPublishingQueueState_pkey" PRIMARY KEY ("integrationId")
);

CREATE TABLE "AccountPublishingQueueItem" (
  "postId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "AccountQueueItemStatus" NOT NULL DEFAULT 'WAITING',
  "terminalCode" TEXT,
  "terminalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "AccountPublishingQueueItem_pkey" PRIMARY KEY ("postId")
);

CREATE INDEX "AccountPublishingQueueState_organizationId_leaseUntil_idx"
  ON "AccountPublishingQueueState"("organizationId", "leaseUntil");
CREATE INDEX "AccountPublishingQueueState_leaseUntil_idx"
  ON "AccountPublishingQueueState"("leaseUntil");
CREATE INDEX "AccountQueue_fifo_idx"
  ON "AccountPublishingQueueItem"("organizationId", "integrationId", "status", "scheduledAt", "createdAt");
CREATE INDEX "AccountPublishingQueueItem_status_updatedAt_idx"
  ON "AccountPublishingQueueItem"("status", "updatedAt");

ALTER TABLE "AccountPublishingQueueState"
  ADD CONSTRAINT "AccountPublishingQueueState_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPublishingQueueState"
  ADD CONSTRAINT "AccountPublishingQueueState_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPublishingQueueItem"
  ADD CONSTRAINT "AccountPublishingQueueItem_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPublishingQueueItem"
  ADD CONSTRAINT "AccountPublishingQueueItem_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountPublishingQueueItem"
  ADD CONSTRAINT "AccountPublishingQueueItem_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The distribution ledger is written before child posts and is safe to resume
-- after any infrastructure interruption without allocating different posts.
CREATE TYPE "FleetDistributionState" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE "FleetDistributionItemStatus" AS ENUM ('ALLOCATED', 'CREATED');

CREATE TABLE "FleetDistribution" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountGroupId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "state" "FleetDistributionState" NOT NULL DEFAULT 'IN_PROGRESS',
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "minimumSpacingSec" INTEGER NOT NULL,
  "lastFailureClass" "PostFailureClass",
  "lastFailureCode" TEXT,
  "lastFailureReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FleetDistribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FleetDistributionItem" (
  "id" TEXT NOT NULL,
  "distributionId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "postGroup" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" "FleetDistributionItemStatus" NOT NULL DEFAULT 'ALLOCATED',
  "failureClass" "PostFailureClass",
  "failureCode" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FleetDistributionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FleetDistribution_organizationId_keyHash_key"
  ON "FleetDistribution"("organizationId", "keyHash");
CREATE INDEX "FleetDistribution_organizationId_state_updatedAt_idx"
  ON "FleetDistribution"("organizationId", "state", "updatedAt");
CREATE INDEX "FleetDistribution_accountGroupId_createdAt_idx"
  ON "FleetDistribution"("accountGroupId", "createdAt");
CREATE UNIQUE INDEX "FleetDistributionItem_postId_key"
  ON "FleetDistributionItem"("postId");
CREATE UNIQUE INDEX "FleetDistributionItem_distributionId_integrationId_key"
  ON "FleetDistributionItem"("distributionId", "integrationId");
CREATE INDEX "FleetDistributionItem_distributionId_status_scheduledAt_idx"
  ON "FleetDistributionItem"("distributionId", "status", "scheduledAt");
CREATE INDEX "FleetDistributionItem_integrationId_scheduledAt_idx"
  ON "FleetDistributionItem"("integrationId", "scheduledAt");

ALTER TABLE "FleetDistribution"
  ADD CONSTRAINT "FleetDistribution_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FleetDistribution"
  ADD CONSTRAINT "FleetDistribution_accountGroupId_fkey"
  FOREIGN KEY ("accountGroupId") REFERENCES "AccountGroup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FleetDistributionItem"
  ADD CONSTRAINT "FleetDistributionItem_distributionId_fkey"
  FOREIGN KEY ("distributionId") REFERENCES "FleetDistribution"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FleetDistributionItem"
  ADD CONSTRAINT "FleetDistributionItem_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
