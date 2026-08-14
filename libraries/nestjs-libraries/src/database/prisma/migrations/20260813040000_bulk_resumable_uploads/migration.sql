-- Native folder and multi-video ingestion remains private and database-owned.
CREATE TYPE "BulkUploadSessionState" AS ENUM (
  'INITIATED',
  'UPLOADING',
  'ASSEMBLING',
  'VALIDATING',
  'NORMALIZING',
  'READY',
  'QUARANTINED',
  'FAILED',
  'ABORTED',
  'EXPIRED'
);

ALTER TABLE "BulkAsset"
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "durationSeconds" DOUBLE PRECISION,
  ADD COLUMN "videoCodec" TEXT,
  ADD COLUMN "audioCodec" TEXT,
  ADD COLUMN "thumbnailStorageKey" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "normalized" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "BulkUploadSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "clientUploadId" TEXT NOT NULL,
  "batchKeyHash" TEXT NOT NULL,
  "batchRequestHash" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "declaredMimeType" TEXT,
  "expectedByteLength" INTEGER NOT NULL,
  "chunkSize" INTEGER NOT NULL,
  "totalParts" INTEGER NOT NULL,
  "receivedParts" INTEGER NOT NULL DEFAULT 0,
  "receivedBytes" INTEGER NOT NULL DEFAULT 0,
  "position" INTEGER NOT NULL,
  "state" "BulkUploadSessionState" NOT NULL DEFAULT 'INITIATED',
  "storagePrefix" TEXT NOT NULL,
  "assetId" TEXT,
  "sha256" TEXT,
  "metadata" JSONB,
  "thumbnailStorageKey" TEXT,
  "normalizationApplied" BOOLEAN NOT NULL DEFAULT false,
  "failureClass" "PostFailureClass",
  "failureCode" TEXT,
  "failureReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "claimTokenHash" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "quarantinedAt" TIMESTAMP(3),
  "abortedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BulkUploadSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BulkUploadSession_sizes" CHECK (
    "expectedByteLength" BETWEEN 1 AND 1073741824 AND
    "chunkSize" BETWEEN 1 AND 8388608 AND
    "totalParts" BETWEEN 1 AND 128 AND
    "receivedParts" BETWEEN 0 AND "totalParts" AND
    "receivedBytes" BETWEEN 0 AND "expectedByteLength" AND
    "position" >= 0 AND "revision" > 0
  ),
  CONSTRAINT "BulkUploadSession_strings" CHECK (
    length(btrim("clientUploadId")) BETWEEN 8 AND 200 AND
    length(btrim("batchKeyHash")) = 64 AND
    length(btrim("batchRequestHash")) = 64 AND
    length(btrim("originalName")) BETWEEN 1 AND 255 AND
    length(btrim("relativePath")) BETWEEN 1 AND 500 AND
    length(btrim("storagePrefix")) BETWEEN 1 AND 500
  ),
  CONSTRAINT "BulkUploadSession_failure_triple" CHECK (
    ("failureClass" IS NULL AND "failureCode" IS NULL AND "failureReason" IS NULL) OR
    ("failureClass" IS NOT NULL AND length(btrim("failureCode")) > 0 AND length(btrim("failureReason")) > 0)
  ),
  CONSTRAINT "BulkUploadSession_terminal_classified" CHECK (
    "state" NOT IN ('QUARANTINED', 'FAILED', 'ABORTED', 'EXPIRED') OR
    ("failureClass" IS NOT NULL AND length(btrim("failureCode")) > 0 AND length(btrim("failureReason")) > 0)
  ),
  CONSTRAINT "BulkUploadSession_ready_asset" CHECK (
    "state" <> 'READY' OR
    ("assetId" IS NOT NULL AND length(btrim("sha256")) = 64 AND "completedAt" IS NOT NULL AND "failureClass" IS NULL)
  ),
  CONSTRAINT "BulkUploadSession_claim_pair" CHECK (
    ("claimTokenHash" IS NULL) = ("leaseExpiresAt" IS NULL)
  )
);

CREATE TABLE "BulkUploadPart" (
  "organizationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "partNumber" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BulkUploadPart_pkey" PRIMARY KEY ("sessionId", "partNumber"),
  CONSTRAINT "BulkUploadPart_values" CHECK (
    "partNumber" >= 0 AND "byteLength" BETWEEN 1 AND 8388608 AND
    length(btrim("storageKey")) BETWEEN 1 AND 500 AND length(btrim("sha256")) = 64
  )
);

CREATE UNIQUE INDEX "BulkUploadSession_id_org_key"
  ON "BulkUploadSession"("id", "organizationId");
CREATE UNIQUE INDEX "BulkUploadSession_client_key"
  ON "BulkUploadSession"("organizationId", "campaignId", "clientUploadId");
CREATE UNIQUE INDEX "BulkUploadSession_position_key"
  ON "BulkUploadSession"("organizationId", "campaignId", "position");
CREATE UNIQUE INDEX "BulkUploadSession_asset_org_key"
  ON "BulkUploadSession"("assetId", "organizationId");
CREATE INDEX "BulkUploadSession_campaign_state_idx"
  ON "BulkUploadSession"("organizationId", "campaignId", "state", "createdAt", "id");
CREATE INDEX "BulkUploadSession_claim_idx"
  ON "BulkUploadSession"("state", "leaseExpiresAt", "createdAt", "id");
CREATE INDEX "BulkUploadSession_batch_idx"
  ON "BulkUploadSession"("organizationId", "batchKeyHash", "position");
CREATE INDEX "BulkUploadSession_expiry_idx"
  ON "BulkUploadSession"("expiresAt", "state");
CREATE UNIQUE INDEX "BulkUploadPart_storage_key" ON "BulkUploadPart"("storageKey");
CREATE INDEX "BulkUploadPart_session_idx"
  ON "BulkUploadPart"("organizationId", "sessionId", "partNumber");

ALTER TABLE "BulkUploadSession"
  ADD CONSTRAINT "BulkUploadSession_org_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkUploadSession"
  ADD CONSTRAINT "BulkUploadSession_campaign_org_fkey"
  FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BulkUploadSession"
  ADD CONSTRAINT "BulkUploadSession_asset_org_fkey"
  FOREIGN KEY ("assetId", "organizationId") REFERENCES "BulkAsset"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BulkUploadPart"
  ADD CONSTRAINT "BulkUploadPart_session_org_fkey"
  FOREIGN KEY ("sessionId", "organizationId") REFERENCES "BulkUploadSession"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
