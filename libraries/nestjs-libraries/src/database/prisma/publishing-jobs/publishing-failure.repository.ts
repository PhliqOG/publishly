import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { NormalizedPostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

export type FailureJobState = 'RETRYING' | 'FAILED';

export type RecordPublishingFailureInput = {
  organizationId: string;
  postId: string;
  state: FailureJobState;
  failure: NormalizedPostFailure;
  nextAttemptAt?: Date | null;
  eventId?: string;
};

@Injectable()
export class PublishingFailureRepository {
  constructor(
    private _db: PrismaRepository<
      'publishingJob' | 'publishingFailure' | 'post'
    >,
    private _transaction: PrismaTransaction
  ) {}

  async record(input: RecordPublishingFailureInput) {
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
            `Post ${input.postId} was not found while recording a classified failure`
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
            state: input.state,
            idempotencyKey: `publish:${input.postId}`,
          },
          update: {},
          select: {
            id: true,
            attempts: true,
            provider: true,
          },
        });
        job = { ...created, post };
      }

      const eventId =
        input.eventId ||
        [
          'post.failure',
          input.postId,
          input.state.toLowerCase(),
          job.attempts,
          input.failure.code,
        ].join(':');

      const failure = await tx.publishingFailure.upsert({
        where: { id: eventId },
        create: {
          id: eventId,
          organizationId: input.organizationId,
          postId: input.postId,
          publishingJobId: job.id,
          provider: job.provider,
          failureClass: input.failure.failureClass,
          failureCode: input.failure.code,
          reason: input.failure.reason,
          willRetry: input.failure.willRetry,
          attempt: job.attempts,
        },
        // The occurrence payload is append-only. Activity replays may update
        // webhook delivery metadata later, but never rewrite what happened.
        update: {},
      });

      await tx.publishingJob.update({
        where: { id: job.id },
        data: {
          state: input.state,
          lastError: failure.reason,
          failureCategory: failure.failureCode,
          failureClass: failure.failureClass,
          failureCode: failure.failureCode,
          failureReason: failure.reason,
          ...(input.state === 'FAILED'
            ? { completedAt: new Date(), nextAttemptAt: null }
            : {
                completedAt: null,
                nextAttemptAt: input.nextAttemptAt ?? null,
              }),
        },
      });

      if (input.state === 'FAILED') {
        await tx.post.updateMany({
          where: {
            id: input.postId,
            organizationId: input.organizationId,
          },
          data: {
            state: 'ERROR',
            error: failure.reason,
          },
        });
      }

      return {
        ...failure,
        integrationId: job.post.integrationId,
        postGroup: job.post.group,
      };
    });
  }

  markWebhookState(
    id: string,
    webhookState: 'NOT_CONFIGURED' | 'DELIVERED' | 'FAILED'
  ) {
    return this._db.model.publishingFailure.update({
      where: { id },
      data: {
        webhookState,
        webhookFinishedAt: new Date(),
      },
    });
  }

  listForPost(organizationId: string, postId: string) {
    return this._db.model.publishingFailure.findMany({
      where: { organizationId, postId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }
}
