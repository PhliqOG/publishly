CREATE TYPE "ServiceHealthState" AS ENUM (
  'OPERATIONAL',
  'DEGRADED',
  'OUTAGE'
);

CREATE TABLE "ServiceHealthSample" (
  "id" TEXT NOT NULL,
  "component" TEXT NOT NULL,
  "bucket" TIMESTAMP(3) NOT NULL,
  "status" "ServiceHealthState" NOT NULL,
  "latencyMs" INTEGER,
  "code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceHealthSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceHealthSample_component_bucket_key"
  ON "ServiceHealthSample"("component", "bucket");

CREATE INDEX "ServiceHealthSample_component_bucket_idx"
  ON "ServiceHealthSample"("component", "bucket");

CREATE INDEX "ServiceHealthSample_bucket_idx"
  ON "ServiceHealthSample"("bucket");
