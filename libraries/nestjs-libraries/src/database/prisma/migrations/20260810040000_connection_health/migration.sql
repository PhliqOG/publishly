-- Proactive token horizon and connection/dead-account health projections.
CREATE TYPE "TokenHealthState" AS ENUM (
  'UNKNOWN',
  'HEALTHY',
  'EXPIRING',
  'EXPIRED',
  'RECONNECT_REQUIRED'
);

CREATE TYPE "ConnectionHealthState" AS ENUM (
  'HEALTHY',
  'AT_RISK',
  'DEAD',
  'RECONNECT_REQUIRED',
  'DISABLED'
);

CREATE TYPE "ConnectionHealthEventType" AS ENUM (
  'TOKEN_EXPIRING',
  'TOKEN_EXPIRED',
  'TOKEN_REFRESHED',
  'CONNECTION_AT_RISK',
  'CONNECTION_RECONNECT_REQUIRED',
  'CONNECTION_STALE',
  'CONNECTION_DEAD',
  'CONNECTION_RECOVERED'
);

CREATE TYPE "ConnectionHealthSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL',
  'RECOVERY'
);

ALTER TABLE "Integration"
  ADD COLUMN "tokenIssuedAt" TIMESTAMP(3),
  ADD COLUMN "tokenLifetimeDays" INTEGER,
  ADD COLUMN "tokenHealthState" "TokenHealthState" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "tokenHealthReason" TEXT,
  ADD COLUMN "tokenHealthCheckedAt" TIMESTAMP(3),
  ADD COLUMN "tokenHealthChangedAt" TIMESTAMP(3),
  ADD COLUMN "tokenWarningDays" INTEGER,
  ADD COLUMN "connectionHealthState" "ConnectionHealthState" NOT NULL DEFAULT 'HEALTHY',
  ADD COLUMN "connectionHealthReason" TEXT,
  ADD COLUMN "connectionHealthChangedAt" TIMESTAMP(3),
  ADD COLUMN "lastProviderContactAt" TIMESTAMP(3),
  ADD COLUMN "lastSuccessfulPublishAt" TIMESTAMP(3),
  ADD COLUMN "lastFailedPublishAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastConnectionErrorCode" TEXT,
  ADD COLUMN "lastConnectionErrorReason" TEXT,
  ADD COLUMN "staleSince" TIMESTAMP(3),
  ADD COLUMN "deadAccountAt" TIMESTAMP(3);

-- Legacy token rows did not retain issue time. `updatedAt` is the least-bad
-- conservative observation, with `createdAt` as a guaranteed fallback.
UPDATE "Integration"
SET
  "tokenIssuedAt" = COALESCE("updatedAt", "createdAt"),
  "tokenLifetimeDays" = CASE
    WHEN LOWER("providerIdentifier") IN (
      'facebook', 'instagram', 'instagram-standalone', 'threads',
      'linkedin', 'linkedin-page', 'tiktok'
    ) THEN 60
    WHEN LOWER("providerIdentifier") = 'x' THEN 90
    WHEN "tokenExpiration" IS NOT NULL THEN GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        "tokenExpiration" - COALESCE("updatedAt", "createdAt")
      )) / 86400.0)::INTEGER
    )
    ELSE NULL
  END;

UPDATE "Integration"
SET "tokenExpiration" = CASE
  WHEN LOWER("providerIdentifier") IN (
    'facebook', 'instagram', 'instagram-standalone', 'threads',
    'linkedin', 'linkedin-page', 'tiktok'
  ) THEN LEAST(
    COALESCE("tokenExpiration", "tokenIssuedAt" + INTERVAL '60 days'),
    "tokenIssuedAt" + INTERVAL '60 days'
  )
  WHEN LOWER("providerIdentifier") = 'x' THEN LEAST(
    COALESCE("tokenExpiration", "tokenIssuedAt" + INTERVAL '90 days'),
    "tokenIssuedAt" + INTERVAL '90 days'
  )
  ELSE "tokenExpiration"
END;

UPDATE "Integration"
SET
  "tokenHealthState" = CASE
    WHEN "refreshNeeded" THEN 'RECONNECT_REQUIRED'::"TokenHealthState"
    WHEN "tokenExpiration" IS NULL THEN 'UNKNOWN'::"TokenHealthState"
    WHEN "tokenExpiration" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"TokenHealthState"
    WHEN "tokenExpiration" <= CURRENT_TIMESTAMP + INTERVAL '30 days' THEN 'EXPIRING'::"TokenHealthState"
    ELSE 'HEALTHY'::"TokenHealthState"
  END,
  "tokenHealthReason" = CASE
    WHEN "refreshNeeded" THEN 'Reconnect this account before publishing.'
    WHEN "tokenExpiration" IS NULL THEN 'The platform did not provide a token expiry.'
    WHEN "tokenExpiration" <= CURRENT_TIMESTAMP THEN 'The connection token has expired.'
    WHEN "tokenExpiration" <= CURRENT_TIMESTAMP + INTERVAL '30 days' THEN 'The connection token is approaching expiry.'
    ELSE 'The connection token is within its expected lifetime.'
  END,
  "tokenHealthCheckedAt" = CURRENT_TIMESTAMP,
  "tokenHealthChangedAt" = CURRENT_TIMESTAMP,
  "connectionHealthState" = CASE
    WHEN "disabled" THEN 'DISABLED'::"ConnectionHealthState"
    WHEN "refreshNeeded" THEN 'RECONNECT_REQUIRED'::"ConnectionHealthState"
    ELSE 'HEALTHY'::"ConnectionHealthState"
  END,
  "connectionHealthReason" = CASE
    WHEN "disabled" THEN 'This connection is disabled.'
    WHEN "refreshNeeded" THEN 'Reconnect this account before publishing.'
    ELSE 'No connection-level failure is active.'
  END,
  "connectionHealthChangedAt" = CURRENT_TIMESTAMP;

CREATE INDEX "Integration_tokenHealthState_tokenExpiration_idx"
  ON "Integration"("tokenHealthState", "tokenExpiration");
CREATE INDEX "Integration_connectionHealthState_deadAccountAt_idx"
  ON "Integration"("connectionHealthState", "deadAccountAt");
CREATE INDEX "Integration_lastProviderContactAt_idx"
  ON "Integration"("lastProviderContactAt");

CREATE TABLE "ConnectionHealthEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "integrationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "type" "ConnectionHealthEventType" NOT NULL,
  "severity" "ConnectionHealthSeverity" NOT NULL,
  "code" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "daysRemaining" INTEGER,
  "consecutiveErrors" INTEGER,
  "sourceEventId" TEXT,
  "webhookState" "FailureWebhookState" NOT NULL DEFAULT 'PENDING',
  "webhookFinishedAt" TIMESTAMP(3),
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConnectionHealthEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConnectionHealthEvent_has_code" CHECK (
    LENGTH(BTRIM("code")) > 0
  ),
  CONSTRAINT "ConnectionHealthEvent_has_reason" CHECK (
    LENGTH(BTRIM("reason")) > 0
  )
);

CREATE INDEX "ConnectionHealthEvent_organizationId_occurredAt_idx"
  ON "ConnectionHealthEvent"("organizationId", "occurredAt");
CREATE INDEX "ConnectionHealthEvent_integrationId_occurredAt_idx"
  ON "ConnectionHealthEvent"("integrationId", "occurredAt");
CREATE INDEX "ConnectionHealthEvent_type_occurredAt_idx"
  ON "ConnectionHealthEvent"("type", "occurredAt");
CREATE INDEX "ConnectionHealthEvent_webhookState_occurredAt_idx"
  ON "ConnectionHealthEvent"("webhookState", "occurredAt");

ALTER TABLE "ConnectionHealthEvent"
  ADD CONSTRAINT "ConnectionHealthEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectionHealthEvent"
  ADD CONSTRAINT "ConnectionHealthEvent_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
