-- Outbound webhook signing and an append-only delivery-attempt ledger.
ALTER TABLE "Webhooks" ADD COLUMN "signingSecret" TEXT;

CREATE TABLE "WebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookDeliveryAttempt_webhookId_eventId_attempt_key"
  ON "WebhookDeliveryAttempt"("webhookId", "eventId", "attempt");
CREATE INDEX "WebhookDeliveryAttempt_organizationId_createdAt_idx"
  ON "WebhookDeliveryAttempt"("organizationId", "createdAt");
CREATE INDEX "WebhookDeliveryAttempt_status_createdAt_idx"
  ON "WebhookDeliveryAttempt"("status", "createdAt");
CREATE INDEX "WebhookDeliveryAttempt_webhookId_createdAt_idx"
  ON "WebhookDeliveryAttempt"("webhookId", "createdAt");

ALTER TABLE "WebhookDeliveryAttempt"
  ADD CONSTRAINT "WebhookDeliveryAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt"
  ADD CONSTRAINT "WebhookDeliveryAttempt_webhookId_fkey"
  FOREIGN KEY ("webhookId") REFERENCES "Webhooks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
