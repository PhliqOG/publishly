-- Store only opaque/one-way identifiers for Meta deletion confirmations.
CREATE TABLE "MetaDataDeletionRequest" (
    "id" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "providers" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "connectionsDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MetaDataDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaDataDeletionRequest_requestHash_key"
    ON "MetaDataDeletionRequest"("requestHash");
CREATE UNIQUE INDEX "MetaDataDeletionRequest_confirmationCode_key"
    ON "MetaDataDeletionRequest"("confirmationCode");
CREATE INDEX "MetaDataDeletionRequest_createdAt_idx"
    ON "MetaDataDeletionRequest"("createdAt");
CREATE INDEX "MetaDataDeletionRequest_status_createdAt_idx"
    ON "MetaDataDeletionRequest"("status", "createdAt");
