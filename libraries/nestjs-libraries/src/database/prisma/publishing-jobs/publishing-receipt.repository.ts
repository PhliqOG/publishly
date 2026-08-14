import { Injectable } from '@nestjs/common';
import { DeliveryReceiptStage, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type RecordPublishingReceiptInput = {
  organizationId: string;
  postId: string;
  stage: DeliveryReceiptStage;
  providerPostId?: string | null;
  providerUrl?: string | null;
  confirmationMethod?: string | null;
  evidence?: Prisma.InputJsonObject;
  failureId?: string | null;
  attempt?: number;
  eventId?: string;
};

function eventSuffix(input: RecordPublishingReceiptInput) {
  const source =
    input.failureId ||
    input.providerPostId ||
    input.confirmationMethod ||
    input.stage;
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

@Injectable()
export class PublishingReceiptRepository {
  constructor(
    private _db: PrismaRepository<
      'publishingJob' | 'publishingReceipt' | 'post'
    >,
    private _transaction: PrismaTransaction
  ) {}

  async record(input: RecordPublishingReceiptInput) {
    return this._transaction.model.$transaction(async (tx) => {
      let job = await tx.publishingJob.findFirst({
        where: {
          organizationId: input.organizationId,
          postId: input.postId,
        },
        select: {
          id: true,
          attempts: true,
          provider: true,
          deliveryStage: true,
          post: { select: { integrationId: true, group: true } },
        },
      });

      if (!job) {
        const post = await tx.post.findFirst({
          where: {
            id: input.postId,
            organizationId: input.organizationId,
          },
          select: {
            integrationId: true,
            group: true,
            integration: { select: { providerIdentifier: true } },
          },
        });
        if (!post) {
          throw new Error(
            `Post ${input.postId} was not found while recording a delivery receipt`
          );
        }
        const provider = post.integration.providerIdentifier
          .split('-')[0]
          .toLowerCase();
        const created = await tx.publishingJob.upsert({
          where: { postId: input.postId },
          create: {
            organizationId: input.organizationId,
            integrationId: post.integrationId,
            postId: input.postId,
            provider,
            state: input.stage === 'queued' ? 'QUEUED' : 'PROCESSING',
            idempotencyKey: `publish:${input.postId}`,
          },
          update: {},
          select: {
            id: true,
            attempts: true,
            provider: true,
            deliveryStage: true,
          },
        });
        job = { ...created, post };
      }

      let attempt = input.attempt ?? job.attempts;
      if (input.stage === 'uploading' && input.attempt === undefined) {
        const claimed = await tx.publishingJob.updateMany({
          where: {
            id: job.id,
            OR: [
              { deliveryStage: null },
              { deliveryStage: 'queued' },
              { deliveryStage: 'failed' },
            ],
          },
          data: {
            attempts: { increment: 1 },
            state: 'PROCESSING',
            deliveryStage: 'uploading',
            stageUpdatedAt: new Date(),
            startedAt: new Date(),
            completedAt: null,
          },
        });
        if (claimed.count > 0) {
          const updated = await tx.publishingJob.findUniqueOrThrow({
            where: { id: job.id },
            select: { attempts: true },
          });
          attempt = updated.attempts;
        } else {
          const current = await tx.publishingJob.findUniqueOrThrow({
            where: { id: job.id },
            select: { attempts: true },
          });
          attempt = current.attempts;
        }
      }

      const eventId =
        input.eventId ||
        `post.receipt:${input.postId}:${input.stage}:${attempt}:${eventSuffix(
          input
        )}`;
      const receipt = await tx.publishingReceipt.upsert({
        where: { id: eventId },
        create: {
          id: eventId,
          organizationId: input.organizationId,
          postId: input.postId,
          publishingJobId: job.id,
          provider: job.provider,
          stage: input.stage,
          attempt,
          providerPostId: input.providerPostId,
          providerUrl: input.providerUrl,
          confirmationMethod: input.confirmationMethod,
          evidence: input.evidence,
          failureId: input.failureId,
        },
        update: {},
      });

      if (input.stage === 'queued') {
        await tx.publishingJob.updateMany({
          where: {
            id: job.id,
            OR: [
              { deliveryStage: null },
              { deliveryStage: 'failed' },
              { deliveryStage: 'queued' },
            ],
          },
          data: {
            state: 'QUEUED',
            deliveryStage: 'queued',
            stageUpdatedAt: receipt.occurredAt,
            completedAt: null,
          },
        });
      } else if (input.stage === 'uploading' && input.attempt !== undefined) {
        await tx.publishingJob.updateMany({
          where: {
            id: job.id,
            deliveryStage: { notIn: ['confirmed_live', 'failed'] },
          },
          data: {
            state: 'PROCESSING',
            deliveryStage: 'uploading',
            stageUpdatedAt: receipt.occurredAt,
            startedAt: new Date(),
            completedAt: null,
          },
        });
      } else if (input.stage === 'sent') {
        await tx.publishingJob.updateMany({
          where: {
            id: job.id,
            deliveryStage: { notIn: ['confirmed_live', 'failed'] },
          },
          data: {
            state: 'PROCESSING',
            deliveryStage: 'sent',
            stageUpdatedAt: receipt.occurredAt,
            sentAt: receipt.occurredAt,
            providerPostId: input.providerPostId,
            providerUrl: input.providerUrl,
          },
        });
      } else if (input.stage === 'confirmed_live') {
        await tx.successfulPostUsage.upsert({
          where: { postId: input.postId },
          create: {
            organizationId: input.organizationId,
            postId: input.postId,
            receiptId: receipt.id,
            provider: job.provider,
            confirmedAt: receipt.occurredAt,
          },
          update: {},
        });
        await tx.publishingJob.update({
          where: { id: job.id },
          data: {
            deliveryStage: 'confirmed_live',
            stageUpdatedAt: receipt.occurredAt,
            confirmedLiveAt: receipt.occurredAt,
            providerPostId: input.providerPostId,
            providerUrl: input.providerUrl,
          },
        });
      } else if (input.stage === 'failed') {
        await tx.publishingJob.update({
          where: { id: job.id },
          data: {
            deliveryStage: 'failed',
            stageUpdatedAt: receipt.occurredAt,
          },
        });
      }

      return {
        ...receipt,
        integrationId: job.post.integrationId,
        postGroup: job.post.group,
      };
    });
  }

  findStage(
    organizationId: string,
    postId: string,
    stage: DeliveryReceiptStage,
    attempt?: number
  ) {
    return this._db.model.publishingReceipt.findFirst({
      where: {
        organizationId,
        postId,
        stage,
        ...(attempt === undefined ? {} : { attempt }),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
  }

  getCurrentAttempt(organizationId: string, postId: string) {
    return this._db.model.publishingJob.findFirst({
      where: { organizationId, postId },
      select: { attempts: true },
    });
  }

  markWebhookState(
    id: string,
    webhookState: 'NOT_CONFIGURED' | 'DELIVERED' | 'FAILED'
  ) {
    return this._db.model.publishingReceipt.update({
      where: { id },
      data: { webhookState, webhookFinishedAt: new Date() },
    });
  }

  listForPost(organizationId: string, postId: string) {
    return this._db.model.publishingReceipt.findMany({
      where: { organizationId, postId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }

  isConfirmed(organizationId: string, postId: string, providerPostId?: string) {
    return this._db.model.publishingReceipt.findFirst({
      where: {
        organizationId,
        postId,
        stage: 'confirmed_live',
        ...(providerPostId ? { providerPostId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    });
  }
}
