import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PublishingFailureService } from './publishing-failure.service';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import {
  computePublishingRetry,
  extractRetryMetadata,
} from '@gitroom/nestjs-libraries/reliability/post.retry.policy';
import { pricingForTier } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

@Injectable()
export class PublishingRetryService {
  constructor(
    private _db: PrismaRepository<'post' | 'integration'>,
    private _failures: PublishingFailureService
  ) {}

  async waitForConnectionGate(input: {
    organizationId: string;
    postId: string;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const post = await this._db.model.post.findFirst({
      where: { id: input.postId, organizationId: input.organizationId },
      select: {
        integrationId: true,
        integration: {
          select: { rateLimitedUntil: true, rateLimitReason: true },
        },
      },
    });
    if (!post) {
      throw new Error(
        `Post ${input.postId} was not found while checking its rate-limit queue`
      );
    }

    const limitedUntil = post.integration.rateLimitedUntil;
    if (!limitedUntil || limitedUntil.getTime() <= now.getTime()) {
      if (limitedUntil) {
        await this._db.model.integration.updateMany({
          where: {
            id: post.integrationId,
            organizationId: input.organizationId,
            rateLimitedUntil: { lte: now },
          },
          data: { rateLimitedUntil: null, rateLimitReason: null },
        });
      }
      return null;
    }

    const delaySeconds = Math.max(
      1,
      Math.ceil((limitedUntil.getTime() - now.getTime()) / 1000)
    );
    const reason =
      post.integration.rateLimitReason ||
      'This connection is queued until the platform rate limit resets.';
    await this._failures.record({
      organizationId: input.organizationId,
      postId: input.postId,
      state: 'RETRYING',
      code: 'rate_limited',
      reason,
      willRetry: true,
      nextAttemptAt: limitedUntil,
      eventId: `post.failure:${
        input.postId
      }:rate-gate:${limitedUntil.toISOString()}`,
    });
    return {
      delaySeconds,
      nextAttemptAt: limitedUntil.toISOString(),
      reason,
    };
  }

  async scheduleRecoverableRetry(input: {
    organizationId: string;
    postId: string;
    error: unknown;
    retryOrdinal: number;
    safeBeforeMutation?: boolean;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const failure = normalizePostFailure({
      error: input.error,
      code: input.safeBeforeMutation ? 'internal_error' : undefined,
      willRetry: true,
    });
    if (failure.failureClass !== 'recoverable') {
      throw new Error(
        `Publishing retry refused for non-recoverable failure ${failure.code}: ${failure.reason}`
      );
    }
    const post = await this._db.model.post.findFirst({
      where: { id: input.postId, organizationId: input.organizationId },
      select: {
        integrationId: true,
        organization: {
          select: {
            subscription: {
              select: { subscriptionTier: true, deletedAt: true },
            },
          },
        },
      },
    });
    if (!post) {
      throw new Error(
        `Post ${input.postId} was not found while scheduling a recoverable retry`
      );
    }
    const subscription = post.organization?.subscription;
    const priority = pricingForTier(
      subscription?.deletedAt ? null : subscription?.subscriptionTier
    ).priority_retries;
    const policy = computePublishingRetry({
      postId: input.postId,
      retryOrdinal: input.retryOrdinal,
      nowMs: now.getTime(),
      metadata: extractRetryMetadata(input.error),
      priority,
    });

    if (failure.code === 'rate_limited') {
      await this._db.model.integration.updateMany({
        where: {
          id: post.integrationId,
          organizationId: input.organizationId,
          OR: [
            { rateLimitedUntil: null },
            { rateLimitedUntil: { lt: policy.nextAttemptAt } },
          ],
        },
        data: {
          rateLimitedUntil: policy.nextAttemptAt,
          rateLimitReason: failure.reason,
          rateLimitObservedAt: now,
        },
      });
    }

    await this._failures.record({
      organizationId: input.organizationId,
      postId: input.postId,
      state: 'RETRYING',
      code: failure.code,
      reason: failure.reason,
      willRetry: true,
      nextAttemptAt: policy.nextAttemptAt,
      eventId: `post.failure:${input.postId}:retry:${input.retryOrdinal + 1}:${
        failure.code
      }`,
    });

    return {
      delaySeconds: policy.delaySeconds,
      nextAttemptAt: policy.nextAttemptAt.toISOString(),
      priority,
      failure: {
        class: failure.failureClass,
        code: failure.code,
        reason: failure.reason,
      },
    };
  }
}
