-- Private Bulk Scheduler assets and job-scoped provider media transport.
CREATE TYPE "BulkAssetState" AS ENUM ('READY', 'QUARANTINED', 'DELETED');
CREATE TYPE "ProviderMediaFetchMethod" AS ENUM ('HEAD', 'GET');
CREATE TYPE "ProviderMediaFetchState" AS ENUM ('AUTHORIZED', 'SERVED', 'REJECTED', 'FAILED');

-- Composite tenant references are added without rewriting PublishingJob rows.
CREATE UNIQUE INDEX "PublishingJob_id_organizationId_key"
  ON "PublishingJob"("id", "organizationId");

CREATE TABLE "BulkAsset" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "state" "BulkAssetState" NOT NULL DEFAULT 'READY',
  "quarantinedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkAsset_storage_key_nonempty" CHECK (length(btrim("storageKey")) BETWEEN 1 AND 500),
  CONSTRAINT "BulkAsset_original_name_nonempty" CHECK (length(btrim("originalName")) BETWEEN 1 AND 500),
  CONSTRAINT "BulkAsset_video_mime" CHECK ("mimeType" = 'video/mp4'),
  CONSTRAINT "BulkAsset_size_valid" CHECK ("byteLength" BETWEEN 1 AND 1073741824),
  CONSTRAINT "BulkAsset_sha256_valid" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "BulkAsset_state_timestamps" CHECK (
    ("state" = 'READY' AND "quarantinedAt" IS NULL AND "deletedAt" IS NULL) OR
    ("state" = 'QUARANTINED' AND "quarantinedAt" IS NOT NULL AND "deletedAt" IS NULL) OR
    ("state" = 'DELETED' AND "deletedAt" IS NOT NULL)
  )
);

CREATE TABLE "BulkCampaignAsset" (
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BulkCampaignAsset_pkey" PRIMARY KEY ("campaignId", "assetId"),
  CONSTRAINT "BulkCampaignAsset_position_nonnegative" CHECK ("position" >= 0)
);

CREATE TABLE "BulkPublishingJobAsset" (
  "organizationId" TEXT NOT NULL,
  "publishingJobId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BulkPublishingJobAsset_pkey" PRIMARY KEY ("publishingJobId", "assetId"),
  CONSTRAINT "BulkPublishingJobAsset_ordinal_nonnegative" CHECK ("ordinal" >= 0)
);

CREATE TABLE "ProviderMediaGrant" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "publishingJobId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "capabilityTupleId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "maxFetches" INTEGER,
  "fetchCount" INTEGER NOT NULL DEFAULT 0,
  "lastFetchedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revocationCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderMediaGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderMediaGrant_tuple_nonempty" CHECK (length(btrim("capabilityTupleId")) BETWEEN 1 AND 200),
  CONSTRAINT "ProviderMediaGrant_token_hash" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "ProviderMediaGrant_expiry_valid" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "ProviderMediaGrant_fetches_valid" CHECK (
    "fetchCount" >= 0 AND ("maxFetches" IS NULL OR "maxFetches" >= 1)
  ),
  CONSTRAINT "ProviderMediaGrant_revocation_coherent" CHECK (
    ("revokedAt" IS NULL AND "revocationCode" IS NULL) OR
    ("revokedAt" IS NOT NULL AND length(btrim("revocationCode")) BETWEEN 1 AND 120)
  )
);

CREATE TABLE "ProviderMediaFetchEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "method" "ProviderMediaFetchMethod" NOT NULL,
  "requestedRange" TEXT,
  "state" "ProviderMediaFetchState" NOT NULL DEFAULT 'AUTHORIZED',
  "statusCode" INTEGER,
  "bytesServed" INTEGER,
  "code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ProviderMediaFetchEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderMediaFetchEvent_range_bounded" CHECK ("requestedRange" IS NULL OR length("requestedRange") BETWEEN 1 AND 100),
  CONSTRAINT "ProviderMediaFetchEvent_status_valid" CHECK ("statusCode" IS NULL OR "statusCode" BETWEEN 100 AND 599),
  CONSTRAINT "ProviderMediaFetchEvent_bytes_valid" CHECK ("bytesServed" IS NULL OR "bytesServed" >= 0),
  CONSTRAINT "ProviderMediaFetchEvent_code_nonempty" CHECK (length(btrim("code")) BETWEEN 1 AND 120),
  CONSTRAINT "ProviderMediaFetchEvent_reason_nonempty" CHECK (length(btrim("reason")) BETWEEN 1 AND 1000),
  CONSTRAINT "ProviderMediaFetchEvent_completion_coherent" CHECK (
    ("state" = 'AUTHORIZED' AND "completedAt" IS NULL) OR
    ("state" IN ('SERVED', 'REJECTED', 'FAILED') AND "completedAt" IS NOT NULL AND "statusCode" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "BulkAsset_storageKey_key" ON "BulkAsset"("storageKey");
CREATE UNIQUE INDEX "BulkAsset_id_organizationId_key" ON "BulkAsset"("id", "organizationId");
CREATE INDEX "BulkAsset_organizationId_sha256_createdAt_idx" ON "BulkAsset"("organizationId", "sha256", "createdAt");
CREATE INDEX "BulkAsset_organizationId_state_createdAt_idx" ON "BulkAsset"("organizationId", "state", "createdAt");

CREATE UNIQUE INDEX "BulkCampaignAsset_organizationId_campaignId_position_key"
  ON "BulkCampaignAsset"("organizationId", "campaignId", "position");
CREATE INDEX "BulkCampaignAsset_organizationId_assetId_idx" ON "BulkCampaignAsset"("organizationId", "assetId");

CREATE UNIQUE INDEX "BulkPublishingJobAsset_publishingJobId_assetId_organizationId_key"
  ON "BulkPublishingJobAsset"("publishingJobId", "assetId", "organizationId");
CREATE UNIQUE INDEX "BulkPublishingJobAsset_organizationId_publishingJobId_ordinal_key"
  ON "BulkPublishingJobAsset"("organizationId", "publishingJobId", "ordinal");
CREATE INDEX "BulkPublishingJobAsset_organizationId_assetId_idx"
  ON "BulkPublishingJobAsset"("organizationId", "assetId");

CREATE UNIQUE INDEX "ProviderMediaGrant_tokenHash_key" ON "ProviderMediaGrant"("tokenHash");
CREATE UNIQUE INDEX "ProviderMediaGrant_id_organizationId_key" ON "ProviderMediaGrant"("id", "organizationId");
CREATE INDEX "ProviderMediaGrant_organizationId_publishingJobId_expiresAt_idx"
  ON "ProviderMediaGrant"("organizationId", "publishingJobId", "expiresAt");
CREATE INDEX "ProviderMediaGrant_expiresAt_revokedAt_idx" ON "ProviderMediaGrant"("expiresAt", "revokedAt");

CREATE INDEX "ProviderMediaFetchEvent_organizationId_grantId_occurredAt_idx"
  ON "ProviderMediaFetchEvent"("organizationId", "grantId", "occurredAt");
CREATE INDEX "ProviderMediaFetchEvent_state_occurredAt_idx" ON "ProviderMediaFetchEvent"("state", "occurredAt");
CREATE INDEX "ProviderMediaFetchEvent_code_occurredAt_idx" ON "ProviderMediaFetchEvent"("code", "occurredAt");

ALTER TABLE "BulkAsset" ADD CONSTRAINT "BulkAsset_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignAsset" ADD CONSTRAINT "BulkCampaignAsset_campaignId_organizationId_fkey"
  FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkCampaignAsset" ADD CONSTRAINT "BulkCampaignAsset_assetId_organizationId_fkey"
  FOREIGN KEY ("assetId", "organizationId") REFERENCES "BulkAsset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkPublishingJobAsset" ADD CONSTRAINT "BulkPublishingJobAsset_publishingJobId_organizationId_fkey"
  FOREIGN KEY ("publishingJobId", "organizationId") REFERENCES "PublishingJob"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkPublishingJobAsset" ADD CONSTRAINT "BulkPublishingJobAsset_assetId_organizationId_fkey"
  FOREIGN KEY ("assetId", "organizationId") REFERENCES "BulkAsset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderMediaGrant" ADD CONSTRAINT "ProviderMediaGrant_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderMediaGrant" ADD CONSTRAINT "ProviderMediaGrant_job_asset_fkey"
  FOREIGN KEY ("publishingJobId", "assetId", "organizationId")
  REFERENCES "BulkPublishingJobAsset"("publishingJobId", "assetId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderMediaFetchEvent" ADD CONSTRAINT "ProviderMediaFetchEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderMediaFetchEvent" ADD CONSTRAINT "ProviderMediaFetchEvent_grantId_organizationId_fkey"
  FOREIGN KEY ("grantId", "organizationId") REFERENCES "ProviderMediaGrant"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
