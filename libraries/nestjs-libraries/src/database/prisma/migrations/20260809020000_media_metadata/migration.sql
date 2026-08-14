-- Additive media metadata used for destination validation, duplicate
-- detection, quota accounting, and generated previews.
ALTER TABLE "Media"
    ADD COLUMN "thumbnailFileSize" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "mimeType" TEXT,
    ADD COLUMN "width" INTEGER,
    ADD COLUMN "height" INTEGER,
    ADD COLUMN "durationSeconds" DOUBLE PRECISION,
    ADD COLUMN "sha256" TEXT,
    ADD COLUMN "metadataStatus" TEXT NOT NULL DEFAULT 'PENDING';

CREATE INDEX "Media_organizationId_sha256_idx"
    ON "Media"("organizationId", "sha256");
