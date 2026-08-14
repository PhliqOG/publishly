-- Additive, tenant-scoped workflow metadata for the unified engagement inbox.
CREATE TABLE "InboxState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalCommentId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "assignedUserId" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxState_organizationId_integrationId_externalCommentId_key"
    ON "InboxState"("organizationId", "integrationId", "externalCommentId");
CREATE INDEX "InboxState_organizationId_integrationId_idx"
    ON "InboxState"("organizationId", "integrationId");
CREATE INDEX "InboxState_organizationId_resolvedAt_idx"
    ON "InboxState"("organizationId", "resolvedAt");
CREATE INDEX "InboxState_organizationId_assignedUserId_idx"
    ON "InboxState"("organizationId", "assignedUserId");

ALTER TABLE "InboxState"
    ADD CONSTRAINT "InboxState_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxState"
    ADD CONSTRAINT "InboxState_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "Integration"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxState"
    ADD CONSTRAINT "InboxState_assignedUserId_fkey"
    FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
