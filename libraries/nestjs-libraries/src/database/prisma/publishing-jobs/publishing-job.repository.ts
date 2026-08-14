import { Injectable } from '@nestjs/common';
import { PublishingJobState } from '@prisma/client';
import { PostFailureClass } from '@gitroom/nestjs-libraries/reliability/post.failure';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type PublishingTransition = {
  error?: string | null;
  failureCategory?: string | null;
  failureClass?: PostFailureClass | null;
  failureCode?: string | null;
  failureReason?: string | null;
  nextAttemptAt?: Date | null;
  providerPostId?: string | null;
  providerUrl?: string | null;
  incrementAttempt?: boolean;
};

@Injectable()
export class PublishingJobRepository {
  constructor(private _db: PrismaRepository<'publishingJob' | 'post'>) {}

  ensure(
    organizationId: string,
    postId: string,
    provider: string,
    state: PublishingJobState,
    integrationId: string
  ) {
    return this._db.model.publishingJob.upsert({
      where: { postId },
      create: {
        organizationId,
        integrationId,
        postId,
        provider,
        state,
        idempotencyKey: `publish:${postId}`,
      },
      update: { provider, state, integrationId },
    });
  }

  transition(
    postId: string,
    state: PublishingJobState,
    details: PublishingTransition = {}
  ) {
    const terminal = ['PUBLISHED', 'FAILED', 'CANCELLED'].includes(state);
    return this._db.model.publishingJob.updateMany({
      where: { postId },
      data: {
        state,
        ...(details.incrementAttempt ? { attempts: { increment: 1 } } : {}),
        ...(state === 'PROCESSING' ? { startedAt: new Date() } : {}),
        ...(terminal ? { completedAt: new Date(), nextAttemptAt: null } : {}),
        ...(details.error !== undefined ? { lastError: details.error } : {}),
        ...(details.failureCategory !== undefined
          ? { failureCategory: details.failureCategory }
          : {}),
        ...(details.failureClass !== undefined
          ? { failureClass: details.failureClass }
          : {}),
        ...(details.failureCode !== undefined
          ? { failureCode: details.failureCode }
          : {}),
        ...(details.failureReason !== undefined
          ? { failureReason: details.failureReason }
          : {}),
        ...(details.nextAttemptAt !== undefined
          ? { nextAttemptAt: details.nextAttemptAt }
          : {}),
        ...(details.providerPostId !== undefined
          ? { providerPostId: details.providerPostId }
          : {}),
        ...(details.providerUrl !== undefined
          ? { providerUrl: details.providerUrl }
          : {}),
      },
    });
  }

  getForPost(organizationId: string, postId: string) {
    return this._db.model.publishingJob.findFirst({
      where: { organizationId, postId },
      include: {
        post: { select: { state: true } },
        failures: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
        receipts: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] },
        publishingAttempts: {
          select: {
            id: true,
            attemptNumber: true,
            phase: true,
            state: true,
            mutationInvoked: true,
            providerPostId: true,
            providerUrl: true,
            failureClass: true,
            failureCode: true,
            failureReason: true,
            startedAt: true,
            completedAt: true,
          },
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
          take: 100,
        },
        bulkAssets: {
          select: {
            assetId: true,
            ordinal: true,
            providerGrants: {
              select: {
                capabilityTupleId: true,
                expiresAt: true,
                maxFetches: true,
                fetchCount: true,
                lastFetchedAt: true,
                revokedAt: true,
                revocationCode: true,
                createdAt: true,
                fetchEvents: {
                  select: {
                    method: true,
                    requestedRange: true,
                    state: true,
                    statusCode: true,
                    bytesServed: true,
                    code: true,
                    reason: true,
                    occurredAt: true,
                    completedAt: true,
                  },
                  orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
                  take: 100,
                },
                _count: { select: { fetchEvents: true } },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: 20,
            },
            _count: { select: { providerGrants: true } },
          },
          orderBy: [{ ordinal: 'asc' }, { assetId: 'asc' }],
          take: 10,
        },
        _count: {
          select: {
            publishingAttempts: true,
            bulkAssets: true,
            failures: true,
            receipts: true,
          },
        },
      },
    });
  }

  getContext(postId: string) {
    return this._db.model.publishingJob.findUnique({
      where: { postId },
      select: {
        organizationId: true,
        provider: true,
        attempts: true,
      },
    });
  }

  getLegacyPostContext(postId: string) {
    return this._db.model.post.findUnique({
      where: { id: postId },
      select: { organizationId: true },
    });
  }

  list(
    organizationId: string,
    state?: PublishingJobState,
    cursor?: string,
    take = 50
  ) {
    return this._db.model.publishingJob.findMany({
      where: { organizationId, ...(state ? { state } : {}) },
      include: {
        post: {
          select: {
            id: true,
            group: true,
            content: true,
            publishDate: true,
            integrationId: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: Math.max(1, Math.min(take, 100)),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  listDueQueueRetries(now: Date, take = 250) {
    return this._db.model.publishingJob.findMany({
      where: {
        state: 'RETRYING',
        failureCode: 'queue_unavailable',
        nextAttemptAt: { lte: now },
        post: { state: 'QUEUE', deletedAt: null },
      },
      select: {
        organizationId: true,
        postId: true,
        provider: true,
        post: { select: { state: true } },
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(take, 500)),
    });
  }

  cancelGroup(organizationId: string, group: string) {
    return this._db.model.publishingJob.updateMany({
      where: {
        organizationId,
        state: { notIn: ['PUBLISHED', 'CANCELLED'] },
        post: { group },
      },
      data: {
        state: 'CANCELLED',
        completedAt: new Date(),
        nextAttemptAt: null,
      },
    });
  }
}
