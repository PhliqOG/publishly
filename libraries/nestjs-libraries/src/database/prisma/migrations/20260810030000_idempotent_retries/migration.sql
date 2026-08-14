-- API creation idempotency and observable, connection-scoped rate-limit gates.
CREATE TYPE "PostCreationRequestState" AS ENUM (
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);

ALTER TABLE "Integration"
  ADD COLUMN "rateLimitedUntil" TIMESTAMP(3),
  ADD COLUMN "rateLimitReason" TEXT,
  ADD COLUMN "rateLimitObservedAt" TIMESTAMP(3);

CREATE INDEX "Integration_rateLimitedUntil_idx"
  ON "Integration"("rateLimitedUntil");

CREATE TABLE "PostCreationRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "creationMethod" "CreationMethod" NOT NULL,
  "status" "PostCreationRequestState" NOT NULL DEFAULT 'IN_PROGRESS',
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "allocatedPostIds" JSONB NOT NULL,
  "response" JSONB,
  "lastFailureClass" "PostFailureClass",
  "lastFailureCode" TEXT,
  "lastFailureReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostCreationRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostCreationRequest_completed_has_response" CHECK (
    "status" <> 'COMPLETED'
    OR (
      "response" IS NOT NULL
      AND "completedAt" IS NOT NULL
      AND "leaseToken" IS NULL
      AND "leaseUntil" IS NULL
    )
  ),
  CONSTRAINT "PostCreationRequest_active_has_lease" CHECK (
    "status" <> 'IN_PROGRESS'
    OR ("leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL)
  ),
  CONSTRAINT "PostCreationRequest_failure_is_classified" CHECK (
    "lastFailureClass" IS NULL
    OR (
      LENGTH(BTRIM(COALESCE("lastFailureCode", ''))) > 0
      AND LENGTH(BTRIM(COALESCE("lastFailureReason", ''))) > 0
    )
  )
);

CREATE UNIQUE INDEX "PostCreationRequest_organizationId_keyHash_key"
  ON "PostCreationRequest"("organizationId", "keyHash");
CREATE INDEX "PostCreationRequest_organizationId_status_updatedAt_idx"
  ON "PostCreationRequest"("organizationId", "status", "updatedAt");
CREATE INDEX "PostCreationRequest_leaseUntil_idx"
  ON "PostCreationRequest"("leaseUntil");

ALTER TABLE "PostCreationRequest"
  ADD CONSTRAINT "PostCreationRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
