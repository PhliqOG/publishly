import { Injectable } from '@nestjs/common';
import {
  BulkUploadSessionState,
  PostFailureClass,
  Prisma,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';

export type UploadCursor = { timestamp: Date; id: string } | null;

function auditId(action: string, ...parts: string[]) {
  return `bulk_upload_audit_${sha256([action, ...parts].join(':')).slice(
    0,
    36
  )}`;
}

@Injectable()
export class BulkUploadRepository {
  constructor(
    private _db: PrismaRepository<
      | 'bulkUploadSession'
      | 'bulkUploadPart'
      | 'bulkCampaign'
      | 'bulkCampaignAsset'
      | 'bulkAsset'
      | 'bulkCampaignIssue'
      | 'auditLog'
    >,
    private _transaction: PrismaTransaction
  ) {}

  async initiateBatch(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    batchKeyHash: string;
    batchRequestHash: string;
    expiresAt: Date;
    files: Array<{
      id: string;
      clientUploadId: string;
      originalName: string;
      relativePath: string;
      declaredMimeType?: string;
      expectedByteLength: number;
      chunkSize: number;
      totalParts: number;
      storagePrefix: string;
    }>;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.campaignId}:uploads`}, 0))`;
      const campaign = await tx.bulkCampaign.findFirst({
        where: { id: input.campaignId, organizationId: input.organizationId },
        select: { id: true, state: true },
      });
      if (!campaign) return { type: 'not_found' as const };
      if (
        ['CANCELLED', 'COMPLETED', 'FAILED', 'CANCELLING'].includes(
          campaign.state
        )
      ) {
        return { type: 'terminal' as const, state: campaign.state };
      }
      const existing = await tx.bulkUploadSession.findMany({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          batchKeyHash: input.batchKeyHash,
        },
        include: { parts: { orderBy: { partNumber: 'asc' } } },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      if (existing.length) {
        if (
          existing.length !== input.files.length ||
          existing.some(
            (row) => row.batchRequestHash !== input.batchRequestHash
          )
        ) {
          return { type: 'idempotency_mismatch' as const };
        }
        return { type: 'replay' as const, sessions: existing };
      }
      const reusedClient = await tx.bulkUploadSession.findFirst({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          clientUploadId: {
            in: input.files.map((file) => file.clientUploadId),
          },
        },
        select: { clientUploadId: true },
      });
      if (reusedClient) {
        return {
          type: 'client_id_reused' as const,
          clientUploadId: reusedClient.clientUploadId,
        };
      }
      const currentCount = await tx.bulkUploadSession.count({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
        },
      });
      if (currentCount + input.files.length > 100_000) {
        return { type: 'campaign_limit' as const, currentCount };
      }
      const [sessionMax, assetMax] = await Promise.all([
        tx.bulkUploadSession.aggregate({
          where: {
            organizationId: input.organizationId,
            campaignId: input.campaignId,
          },
          _max: { position: true },
        }),
        tx.bulkCampaignAsset.aggregate({
          where: {
            organizationId: input.organizationId,
            campaignId: input.campaignId,
          },
          _max: { position: true },
        }),
      ]);
      const startPosition =
        Math.max(sessionMax._max.position ?? -1, assetMax._max.position ?? -1) +
        1;
      await tx.bulkUploadSession.createMany({
        data: input.files.map((file, index) => ({
          ...file,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          batchKeyHash: input.batchKeyHash,
          batchRequestHash: input.batchRequestHash,
          position: startPosition + index,
          expiresAt: input.expiresAt,
        })),
      });
      if (campaign.state === 'DRAFT') {
        await tx.bulkCampaign.updateMany({
          where: {
            id: input.campaignId,
            organizationId: input.organizationId,
            state: 'DRAFT',
          },
          data: { state: 'UPLOADING' },
        });
      }
      await tx.auditLog.upsert({
        where: {
          id: auditId('initiated', input.campaignId, input.batchKeyHash),
        },
        create: {
          id: auditId('initiated', input.campaignId, input.batchKeyHash),
          organizationId: input.organizationId,
          userId: input.userId,
          actorType: input.userId ? 'user' : 'apikey',
          action: 'bulk.upload.batch-initiated',
          targetType: 'bulkCampaign',
          targetId: input.campaignId,
          metadata: JSON.stringify({
            fileCount: input.files.length,
            firstPosition: startPosition,
            lastPosition: startPosition + input.files.length - 1,
            expiresAt: input.expiresAt.toISOString(),
          }),
        },
        update: {},
      });
      const sessions = await tx.bulkUploadSession.findMany({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          batchKeyHash: input.batchKeyHash,
        },
        include: { parts: { orderBy: { partNumber: 'asc' } } },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      });
      return { type: 'created' as const, sessions };
    });
  }

  get(organizationId: string, campaignId: string, uploadId: string) {
    return this._db.model.bulkUploadSession.findFirst({
      where: { id: uploadId, organizationId, campaignId },
      include: { parts: { orderBy: { partNumber: 'asc' } }, asset: true },
    });
  }

  async list(input: {
    organizationId: string;
    campaignId: string;
    state?: BulkUploadSessionState;
    cursor: UploadCursor;
    limit: number;
  }) {
    const campaign = await this._db.model.bulkCampaign.findFirst({
      where: { id: input.campaignId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!campaign) return null;
    return this._db.model.bulkUploadSession.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { gt: input.cursor.timestamp } },
                {
                  createdAt: input.cursor.timestamp,
                  id: { gt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      include: {
        parts: { orderBy: { partNumber: 'asc' }, select: { partNumber: true } },
        asset: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
  }

  async recordPart(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    partNumber: number;
    storageKey: string;
    byteLength: number;
    sha256: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const session = await tx.bulkUploadSession.findFirst({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
        },
      });
      if (!session) return { type: 'not_found' as const };
      const existing = await tx.bulkUploadPart.findUnique({
        where: {
          sessionId_partNumber: {
            sessionId: input.uploadId,
            partNumber: input.partNumber,
          },
        },
      });
      if (existing) {
        if (
          existing.organizationId !== input.organizationId ||
          existing.sha256 !== input.sha256 ||
          existing.byteLength !== input.byteLength
        ) {
          return { type: 'mismatch' as const, session, existing };
        }
        return { type: 'replay' as const, session, part: existing };
      }
      if (!['INITIATED', 'UPLOADING'].includes(session.state)) {
        return { type: 'not_uploading' as const, session };
      }
      if (session.expiresAt <= input.now) {
        return { type: 'expired' as const, session };
      }
      const part = await tx.bulkUploadPart.create({
        data: {
          organizationId: input.organizationId,
          sessionId: input.uploadId,
          partNumber: input.partNumber,
          storageKey: input.storageKey,
          byteLength: input.byteLength,
          sha256: input.sha256,
          receivedAt: input.now,
        },
      });
      const changed = await tx.bulkUploadSession.updateMany({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          state: { in: ['INITIATED', 'UPLOADING'] },
        },
        data: {
          state: 'UPLOADING',
          receivedParts: { increment: 1 },
          receivedBytes: { increment: input.byteLength },
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error('bulk_upload_part_state_race');
      return { type: 'stored' as const, session, part };
    });
  }

  async requestCompletion(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const session = await tx.bulkUploadSession.findFirst({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
        },
        include: { parts: { orderBy: { partNumber: 'asc' } } },
      });
      if (!session) return { type: 'not_found' as const };
      if (
        ['ASSEMBLING', 'VALIDATING', 'NORMALIZING', 'READY'].includes(
          session.state
        )
      ) {
        return { type: 'replay' as const, session };
      }
      if (!['INITIATED', 'UPLOADING'].includes(session.state)) {
        return { type: 'terminal' as const, session };
      }
      const received = new Set(session.parts.map((part) => part.partNumber));
      const missingParts = Array.from(
        { length: session.totalParts },
        (_, partNumber) => partNumber
      ).filter((partNumber) => !received.has(partNumber));
      if (
        missingParts.length ||
        session.receivedParts !== session.totalParts ||
        session.receivedBytes !== session.expectedByteLength
      ) {
        return { type: 'incomplete' as const, session, missingParts };
      }
      const changed = await tx.bulkUploadSession.updateMany({
        where: {
          id: session.id,
          organizationId: input.organizationId,
          state: { in: ['INITIATED', 'UPLOADING'] },
        },
        data: {
          state: 'ASSEMBLING',
          failureClass: null,
          failureCode: null,
          failureReason: null,
          nextAttemptAt: null,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) return { type: 'race' as const };
      await tx.auditLog.upsert({
        where: { id: auditId('complete-requested', session.id) },
        create: {
          id: auditId('complete-requested', session.id),
          organizationId: input.organizationId,
          actorType: 'user',
          action: 'bulk.upload.completion-requested',
          targetType: 'bulkUploadSession',
          targetId: session.id,
          metadata: JSON.stringify({
            partCount: session.totalParts,
            byteLength: session.expectedByteLength,
          }),
        },
        update: {},
      });
      return {
        type: 'accepted' as const,
        session: { ...session, state: 'ASSEMBLING' as const },
      };
    });
  }

  claimProcessing(input: {
    now: Date;
    leaseExpiresAt: Date;
    claimTokenHash: string;
    limit: number;
  }) {
    return this._transaction.model.$transaction((tx) =>
      tx.$queryRaw<Array<{ id: string; organizationId: string }>>(Prisma.sql`
        WITH candidates AS (
          SELECT upload."id"
          FROM "BulkUploadSession" upload
          INNER JOIN "BulkCampaign" campaign
            ON campaign."id" = upload."campaignId"
           AND campaign."organizationId" = upload."organizationId"
          WHERE upload."state" IN (
              'ASSEMBLING'::"BulkUploadSessionState",
              'RETRYABLE_FAILURE'::"BulkUploadSessionState"
            )
            AND (upload."nextAttemptAt" IS NULL OR upload."nextAttemptAt" <= ${
              input.now
            })
            AND (upload."leaseExpiresAt" IS NULL OR upload."leaseExpiresAt" <= ${
              input.now
            })
            AND campaign."state" NOT IN (
              'CANCELLING'::"BulkCampaignState", 'CANCELLED'::"BulkCampaignState",
              'COMPLETED'::"BulkCampaignState", 'FAILED'::"BulkCampaignState"
            )
          ORDER BY upload."createdAt" ASC, upload."id" ASC
          FOR UPDATE OF upload SKIP LOCKED
          LIMIT ${Math.max(1, Math.min(input.limit, 10))}
        )
        UPDATE "BulkUploadSession" upload
           SET "state" = 'ASSEMBLING'::"BulkUploadSessionState",
               "claimTokenHash" = ${input.claimTokenHash},
               "leaseExpiresAt" = ${input.leaseExpiresAt},
               "attemptCount" = upload."attemptCount" + 1,
               "nextAttemptAt" = NULL,
               "updatedAt" = ${input.now}
          FROM candidates
         WHERE upload."id" = candidates."id"
        RETURNING upload."id", upload."organizationId"
      `)
    );
  }

  getProcessingContext(input: {
    organizationId: string;
    uploadId: string;
    claimTokenHash: string;
    now: Date;
  }) {
    return this._db.model.bulkUploadSession.findFirst({
      where: {
        id: input.uploadId,
        organizationId: input.organizationId,
        state: { in: ['ASSEMBLING', 'VALIDATING', 'NORMALIZING'] },
        claimTokenHash: input.claimTokenHash,
        leaseExpiresAt: { gt: input.now },
      },
      include: {
        parts: { orderBy: { partNumber: 'asc' } },
        campaign: { select: { id: true, state: true } },
      },
    });
  }

  setProcessingState(input: {
    organizationId: string;
    uploadId: string;
    claimTokenHash: string;
    state: 'VALIDATING' | 'NORMALIZING';
    metadata?: Prisma.InputJsonValue;
  }) {
    return this._db.model.bulkUploadSession.updateMany({
      where: {
        id: input.uploadId,
        organizationId: input.organizationId,
        claimTokenHash: input.claimTokenHash,
        state: { in: ['ASSEMBLING', 'VALIDATING', 'NORMALIZING'] },
      },
      data: {
        state: input.state,
        ...(input.metadata ? { metadata: input.metadata } : {}),
        revision: { increment: 1 },
      },
    });
  }

  async finalizeReady(input: {
    organizationId: string;
    uploadId: string;
    claimTokenHash: string;
    asset: {
      id: string;
      storageKey: string;
      mimeType: string;
      byteLength: number;
      sha256: string;
      width?: number | null;
      height?: number | null;
      durationSeconds?: number | null;
      videoCodec?: string | null;
      audioCodec?: string | null;
      thumbnailStorageKey?: string | null;
      metadata: Prisma.InputJsonValue;
      normalized: boolean;
    };
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.organizationId}:${input.asset.sha256}:asset`}, 0))`;
      const session = await tx.bulkUploadSession.findFirst({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          claimTokenHash: input.claimTokenHash,
          leaseExpiresAt: { gt: input.now },
          state: { in: ['ASSEMBLING', 'VALIDATING', 'NORMALIZING'] },
        },
      });
      if (!session) return { type: 'claim_lost' as const };
      const duplicate = await tx.bulkAsset.findFirst({
        where: {
          organizationId: input.organizationId,
          sha256: input.asset.sha256,
          state: 'READY',
          deletedAt: null,
        },
        select: { id: true, originalName: true },
      });
      if (duplicate) {
        await this.markOutcomeInTransaction(tx, {
          session,
          state: 'QUARANTINED',
          failureClass: 'data_problem',
          code: 'duplicate_media',
          reason: `This file duplicates existing asset ${duplicate.id}; it was not added twice.`,
          now: input.now,
        });
        return { type: 'duplicate' as const, duplicateAssetId: duplicate.id };
      }
      const asset = await tx.bulkAsset.create({
        data: {
          ...input.asset,
          organizationId: input.organizationId,
          originalName: session.originalName,
          state: 'READY',
        },
      });
      await tx.bulkCampaignAsset.create({
        data: {
          organizationId: input.organizationId,
          campaignId: session.campaignId,
          assetId: asset.id,
          position: session.position,
        },
      });
      await tx.bulkUploadSession.update({
        where: { id: session.id },
        data: {
          state: 'READY',
          assetId: asset.id,
          sha256: asset.sha256,
          metadata: input.asset.metadata,
          thumbnailStorageKey: input.asset.thumbnailStorageKey,
          normalizationApplied: input.asset.normalized,
          failureClass: null,
          failureCode: null,
          failureReason: null,
          claimTokenHash: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          completedAt: input.now,
          revision: { increment: 1 },
        },
      });
      const resolved = await tx.bulkCampaignIssue.updateMany({
        where: {
          organizationId: input.organizationId,
          campaignId: session.campaignId,
          subjectType: 'upload',
          subjectId: session.id,
          retryable: true,
          state: 'open',
        },
        data: { state: 'resolved', resolvedAt: input.now },
      });
      if (resolved.count) {
        const campaign = await tx.bulkCampaign.findFirstOrThrow({
          where: {
            id: session.campaignId,
            organizationId: input.organizationId,
          },
          select: { openIssueCount: true },
        });
        await tx.bulkCampaign.updateMany({
          where: {
            id: session.campaignId,
            organizationId: input.organizationId,
          },
          data: {
            openIssueCount: Math.max(
              0,
              campaign.openIssueCount - resolved.count
            ),
          },
        });
      }
      await tx.auditLog.upsert({
        where: { id: auditId('ready', session.id) },
        create: {
          id: auditId('ready', session.id),
          organizationId: input.organizationId,
          actorType: 'system',
          action: 'bulk.upload.ready',
          targetType: 'bulkUploadSession',
          targetId: session.id,
          metadata: JSON.stringify({
            campaignId: session.campaignId,
            assetId: asset.id,
            sha256: asset.sha256,
            normalized: input.asset.normalized,
          }),
        },
        update: {},
      });
      return { type: 'ready' as const, asset };
    });
  }

  private async markOutcomeInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      session: {
        id: string;
        campaignId: string;
        organizationId: string;
        attemptCount: number;
      };
      state:
        | 'QUARANTINED'
        | 'RETRYABLE_FAILURE'
        | 'FINAL_FAILURE'
        | 'ABORTED'
        | 'EXPIRED';
      failureClass: PostFailureClass;
      code: string;
      reason: string;
      now: Date;
      nextAttemptAt?: Date | null;
      userId?: string;
    }
  ) {
    const issueClass =
      input.state === 'QUARANTINED'
        ? 'quarantined'
        : input.state === 'RETRYABLE_FAILURE' || input.state === 'FINAL_FAILURE'
        ? 'failed'
        : 'blocked';
    await tx.bulkUploadSession.update({
      where: { id: input.session.id },
      data: {
        state: input.state,
        failureClass: input.failureClass,
        failureCode: input.code,
        failureReason: input.reason,
        claimTokenHash: null,
        leaseExpiresAt: null,
        nextAttemptAt: input.nextAttemptAt ?? null,
        ...(input.state === 'QUARANTINED' ? { quarantinedAt: input.now } : {}),
        ...(input.state === 'ABORTED' ? { abortedAt: input.now } : {}),
        revision: { increment: 1 },
      },
    });
    const eventKey = `${input.code}:${input.session.id}:${input.session.attemptCount}`;
    const issueId = `bulk_issue_${sha256(
      `${input.session.organizationId}:${input.session.campaignId}:${eventKey}`
    ).slice(0, 32)}`;
    const created = await tx.bulkCampaignIssue.createMany({
      data: [
        {
          id: issueId,
          organizationId: input.session.organizationId,
          campaignId: input.session.campaignId,
          eventKey,
          issueClass,
          failureClass: input.failureClass,
          code: input.code,
          reason: input.reason,
          subjectType: 'upload',
          subjectId: input.session.id,
          retryable: input.state === 'RETRYABLE_FAILURE',
          occurredAt: input.now,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count) {
      await tx.bulkCampaign.update({
        where: { id: input.session.campaignId },
        data: {
          issueCount: { increment: 1 },
          openIssueCount: { increment: 1 },
        },
      });
    }
    await tx.auditLog.upsert({
      where: {
        id: auditId(
          input.code,
          input.session.id,
          String(input.session.attemptCount)
        ),
      },
      create: {
        id: auditId(
          input.code,
          input.session.id,
          String(input.session.attemptCount)
        ),
        organizationId: input.session.organizationId,
        userId: input.userId,
        actorType: input.userId ? 'user' : 'system',
        action: `bulk.upload.${input.state.toLowerCase()}`,
        targetType: 'bulkUploadSession',
        targetId: input.session.id,
        metadata: JSON.stringify({
          campaignId: input.session.campaignId,
          failureClass: input.failureClass,
          code: input.code,
          reason: input.reason,
          attemptCount: input.session.attemptCount,
          nextAttemptAt: input.nextAttemptAt?.toISOString(),
        }),
      },
      update: {},
    });
  }

  async markProcessingFailure(input: {
    organizationId: string;
    uploadId: string;
    claimTokenHash: string;
    failureClass: PostFailureClass;
    code: string;
    reason: string;
    quarantine: boolean;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const session = await tx.bulkUploadSession.findFirst({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          claimTokenHash: input.claimTokenHash,
          state: { in: ['ASSEMBLING', 'VALIDATING', 'NORMALIZING'] },
        },
      });
      if (!session) return { type: 'claim_lost' as const };
      const final = !input.quarantine && session.attemptCount >= 5;
      const state = input.quarantine
        ? 'QUARANTINED'
        : final
        ? 'FINAL_FAILURE'
        : 'RETRYABLE_FAILURE';
      const delaySeconds = Math.min(
        3_600,
        30 * 2 ** Math.max(0, session.attemptCount - 1)
      );
      await this.markOutcomeInTransaction(tx, {
        session,
        state,
        failureClass: input.failureClass,
        code: input.code,
        reason: input.reason,
        now: input.now,
        nextAttemptAt:
          state === 'RETRYABLE_FAILURE'
            ? new Date(input.now.getTime() + delaySeconds * 1_000)
            : null,
      });
      return { type: 'recorded' as const, state, delaySeconds };
    });
  }

  async abort(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    userId?: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const session = await tx.bulkUploadSession.findFirst({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
        },
        include: { parts: true },
      });
      if (!session) return { type: 'not_found' as const };
      if (
        [
          'READY',
          'QUARANTINED',
          'FINAL_FAILURE',
          'ABORTED',
          'EXPIRED',
        ].includes(session.state)
      ) {
        return { type: 'replay' as const, session };
      }
      await this.markOutcomeInTransaction(tx, {
        session,
        state: 'ABORTED',
        failureClass: 'data_problem',
        code: 'upload_aborted',
        reason:
          'The operator cancelled this file before it became a campaign asset.',
        now: input.now,
        userId: input.userId,
      });
      return {
        type: 'aborted' as const,
        session: {
          ...session,
          state: 'ABORTED' as const,
          failureClass: 'data_problem' as const,
          failureCode: 'upload_aborted',
          failureReason:
            'The operator cancelled this file before it became a campaign asset.',
          abortedAt: input.now,
        },
      };
    });
  }

  async expire(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const session = await tx.bulkUploadSession.findFirst({
        where: {
          id: input.uploadId,
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          expiresAt: { lte: input.now },
          state: { in: ['INITIATED', 'UPLOADING'] },
        },
        include: { parts: true },
      });
      if (!session) return { type: 'unchanged' as const };
      await this.markOutcomeInTransaction(tx, {
        session,
        state: 'EXPIRED',
        failureClass: 'recoverable',
        code: 'upload_expired',
        reason:
          'This incomplete upload expired after seven days; start a new resumable upload.',
        now: input.now,
      });
      return {
        type: 'expired' as const,
        session: {
          ...session,
          state: 'EXPIRED' as const,
          failureClass: 'recoverable' as const,
          failureCode: 'upload_expired',
          failureReason:
            'This incomplete upload expired after seven days; start a new resumable upload.',
        },
      };
    });
  }

  findDuplicateHash(organizationId: string, digest: string) {
    return this._db.model.bulkAsset.findFirst({
      where: {
        organizationId,
        sha256: digest,
        state: 'READY',
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  findAsset(organizationId: string, assetId: string) {
    return this._db.model.bulkAsset.findFirst({
      where: { id: assetId, organizationId, state: 'READY', deletedAt: null },
    });
  }
}
