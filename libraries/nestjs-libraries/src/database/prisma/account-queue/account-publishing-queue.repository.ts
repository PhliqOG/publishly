import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type AccountQueueReleaseOutcome =
  | 'RETRY'
  | 'COMPLETED'
  | 'FAILED'
  | 'AMBIGUOUS';

const TERMINAL_QUEUE_STATUSES = [
  'COMPLETED',
  'FAILED',
  'AMBIGUOUS',
  'CANCELLED',
] as const;

@Injectable()
export class AccountPublishingQueueRepository {
  constructor(
    private _db: PrismaRepository<
      | 'accountPublishingQueueItem'
      | 'accountPublishingQueueState'
      | 'integration'
    >,
    private _transaction: PrismaTransaction
  ) {}

  acquire(input: {
    organizationId: string;
    postId: string;
    now: Date;
    leaseSeconds: number;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const post = await tx.post.findFirst({
        where: {
          id: input.postId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          state: true,
          publishDate: true,
          integrationId: true,
          integration: {
            select: {
              id: true,
              organizationId: true,
              deletedAt: true,
              disabled: true,
            },
          },
        },
      });
      if (!post || post.integration.organizationId !== input.organizationId) {
        return { ok: false as const, code: 'post_not_found' };
      }
      if (post.integration.deletedAt) {
        return { ok: false as const, code: 'connection_not_found' };
      }

      const queueItem = await tx.accountPublishingQueueItem.upsert({
        where: { postId: post.id },
        create: {
          postId: post.id,
          organizationId: input.organizationId,
          integrationId: post.integrationId,
          scheduledAt: post.publishDate,
        },
        update: { scheduledAt: post.publishDate },
        select: {
          postId: true,
          integrationId: true,
          status: true,
          terminalCode: true,
          terminalReason: true,
        },
      });
      if (
        queueItem.integrationId !== post.integrationId ||
        TERMINAL_QUEUE_STATUSES.includes(queueItem.status as any)
      ) {
        return {
          ok: false as const,
          code:
            queueItem.integrationId !== post.integrationId
              ? 'queue_destination_changed'
              : 'queue_item_terminal',
          status: queueItem.status,
          terminalCode: queueItem.terminalCode,
          terminalReason: queueItem.terminalReason,
        };
      }

      await tx.accountPublishingQueueState.upsert({
        where: { integrationId: post.integrationId },
        create: {
          integrationId: post.integrationId,
          organizationId: input.organizationId,
        },
        update: { organizationId: input.organizationId },
      });

      // Repair terminal heads left WAITING by a worker crash. This is bounded
      // per acquire; a large historical backlog is drained over safe retries.
      for (let pass = 0; pass < 4; pass += 1) {
        const candidates = await tx.accountPublishingQueueItem.findMany({
          where: {
            organizationId: input.organizationId,
            integrationId: post.integrationId,
            status: 'WAITING',
          },
          select: {
            postId: true,
            post: {
              select: {
                state: true,
                deletedAt: true,
                publishingJob: {
                  select: { state: true, deliveryStage: true },
                },
              },
            },
          },
          orderBy: [
            { scheduledAt: 'asc' },
            { createdAt: 'asc' },
            { postId: 'asc' },
          ],
          take: 50,
        });
        let repaired = 0;
        for (const candidate of candidates) {
          const job = candidate.post.publishingJob;
          const accepted =
            candidate.post.state === 'PUBLISHED' ||
            job?.state === 'PUBLISHED' ||
            job?.deliveryStage === 'sent' ||
            job?.deliveryStage === 'confirmed_live';
          const cancelled =
            job?.state === 'CANCELLED' || !!candidate.post.deletedAt;
          const failed =
            candidate.post.state === 'ERROR' || job?.state === 'FAILED';
          if (!accepted && !cancelled && !failed) continue;
          const status = accepted
            ? 'COMPLETED'
            : cancelled
            ? 'CANCELLED'
            : 'FAILED';
          await tx.accountPublishingQueueItem.updateMany({
            where: { postId: candidate.postId, status: 'WAITING' },
            data: {
              status,
              terminalCode: accepted
                ? 'provider_accepted'
                : cancelled
                ? 'post_cancelled'
                : 'post_failed',
              terminalReason: accepted
                ? 'Provider acceptance was recovered from the delivery ledger.'
                : cancelled
                ? 'The queued post was cancelled before provider mutation.'
                : 'The queued post already has a classified terminal failure.',
              completedAt: input.now,
            },
          });
          repaired += 1;
        }
        if (!repaired) break;
      }

      const waiting = await tx.accountPublishingQueueItem.findMany({
        where: {
          organizationId: input.organizationId,
          integrationId: post.integrationId,
          status: 'WAITING',
        },
        select: { postId: true, scheduledAt: true, createdAt: true },
        orderBy: [
          { scheduledAt: 'asc' },
          { createdAt: 'asc' },
          { postId: 'asc' },
        ],
        take: 501,
      });
      const position = waiting.findIndex((item) => item.postId === post.id) + 1;
      if (!position) {
        return { ok: false as const, code: 'queue_item_not_waiting' };
      }
      if (waiting[0]?.postId !== post.id) {
        return {
          ok: true as const,
          acquired: false as const,
          integrationId: post.integrationId,
          position,
          delaySeconds: 5,
          code: 'waiting_for_account_queue',
          reason:
            'An earlier post is still ahead of this post in the destination account queue.',
        };
      }

      const state = await tx.accountPublishingQueueState.findUnique({
        where: { integrationId: post.integrationId },
        select: {
          leasePostId: true,
          leaseToken: true,
          leaseUntil: true,
          cooldownReason: true,
        },
      });
      if (
        state?.leasePostId === post.id &&
        state.leaseToken &&
        state.leaseUntil &&
        state.leaseUntil.getTime() > input.now.getTime()
      ) {
        return {
          ok: true as const,
          acquired: true as const,
          integrationId: post.integrationId,
          leaseToken: state.leaseToken,
          leaseUntil: state.leaseUntil,
          resumed: true,
        };
      }
      if (
        state?.leasePostId &&
        state.leaseUntil &&
        state.leaseUntil.getTime() > input.now.getTime()
      ) {
        return {
          ok: true as const,
          acquired: false as const,
          integrationId: post.integrationId,
          position,
          delaySeconds: Math.max(
            1,
            Math.ceil((state.leaseUntil.getTime() - input.now.getTime()) / 1000)
          ),
          code: state.cooldownReason
            ? 'account_queue_cooldown'
            : 'account_queue_leased',
          reason:
            state.cooldownReason ||
            'The destination account is currently publishing another post.',
        };
      }

      const leaseToken = randomUUID();
      const leaseUntil = new Date(
        input.now.getTime() + input.leaseSeconds * 1000
      );
      const acquired = await tx.accountPublishingQueueState.updateMany({
        where: {
          integrationId: post.integrationId,
          organizationId: input.organizationId,
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: input.now } }],
        },
        data: {
          leasePostId: post.id,
          leaseToken,
          leaseUntil,
          cooldownReason: null,
        },
      });
      if (!acquired.count) {
        return {
          ok: true as const,
          acquired: false as const,
          integrationId: post.integrationId,
          position,
          delaySeconds: 5,
          code: 'account_queue_race_lost',
          reason:
            'Another worker acquired the destination account queue first; this post will retry safely.',
        };
      }
      return {
        ok: true as const,
        acquired: true as const,
        integrationId: post.integrationId,
        leaseToken,
        leaseUntil,
        resumed: false,
      };
    });
  }

  release(input: {
    organizationId: string;
    postId: string;
    leaseToken: string;
    outcome: AccountQueueReleaseOutcome;
    code: string;
    reason: string;
    now: Date;
    ambiguousCooldownSeconds: number;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const item = await tx.accountPublishingQueueItem.findFirst({
        where: { postId: input.postId, organizationId: input.organizationId },
        select: { integrationId: true, status: true },
      });
      if (!item) return { ok: false as const, code: 'queue_item_not_found' };
      if (
        input.outcome !== 'RETRY' &&
        TERMINAL_QUEUE_STATUSES.includes(item.status as any)
      ) {
        return { ok: true as const, idempotent: true, status: item.status };
      }

      const state = await tx.accountPublishingQueueState.findUnique({
        where: { integrationId: item.integrationId },
        select: { leasePostId: true, leaseToken: true, leaseUntil: true },
      });
      if (
        !state ||
        state.leasePostId !== input.postId ||
        state.leaseToken !== input.leaseToken
      ) {
        return { ok: false as const, code: 'account_queue_lease_lost' };
      }

      if (input.outcome === 'RETRY') {
        await tx.accountPublishingQueueState.update({
          where: { integrationId: item.integrationId },
          data: {
            leasePostId: null,
            leaseToken: null,
            leaseUntil: null,
            cooldownReason: null,
          },
        });
        return { ok: true as const, idempotent: false, status: 'WAITING' };
      }

      const status =
        input.outcome === 'COMPLETED'
          ? 'COMPLETED'
          : input.outcome === 'FAILED'
          ? 'FAILED'
          : 'AMBIGUOUS';
      await tx.accountPublishingQueueItem.update({
        where: { postId: input.postId },
        data: {
          status,
          terminalCode: input.code,
          terminalReason: input.reason,
          completedAt: input.now,
        },
      });

      if (input.outcome === 'AMBIGUOUS') {
        const cooldownUntil = new Date(
          input.now.getTime() + input.ambiguousCooldownSeconds * 1000
        );
        await tx.accountPublishingQueueState.update({
          where: { integrationId: item.integrationId },
          data: {
            leaseUntil: cooldownUntil,
            cooldownReason: input.reason,
          },
        });
        return {
          ok: true as const,
          idempotent: false,
          status,
          cooldownUntil,
        };
      }

      await tx.accountPublishingQueueState.update({
        where: { integrationId: item.integrationId },
        data: {
          leasePostId: null,
          leaseToken: null,
          leaseUntil: null,
          cooldownReason: null,
        },
      });
      return { ok: true as const, idempotent: false, status };
    });
  }

  async getQueue(organizationId: string, integrationId: string) {
    const integration = await this._db.model.integration.findFirst({
      where: {
        id: integrationId,
        organizationId,
        deletedAt: null,
        type: 'social',
      },
      select: { id: true, name: true, providerIdentifier: true },
    });
    if (!integration) return null;
    const [state, items] = await Promise.all([
      this._db.model.accountPublishingQueueState.findUnique({
        where: { integrationId },
        select: {
          leasePostId: true,
          leaseUntil: true,
          cooldownReason: true,
          updatedAt: true,
        },
      }),
      this._db.model.accountPublishingQueueItem.findMany({
        where: { organizationId, integrationId },
        select: {
          postId: true,
          scheduledAt: true,
          status: true,
          terminalCode: true,
          terminalReason: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: [
          { scheduledAt: 'asc' },
          { createdAt: 'asc' },
          { postId: 'asc' },
        ],
        take: 100,
      }),
    ]);
    return { integration, state, items };
  }

  reconcileTerminalOrphans(now: Date, take = 500) {
    return this._transaction.model.$transaction(async (tx) => {
      const candidates = await tx.accountPublishingQueueItem.findMany({
        where: {
          status: 'WAITING',
          OR: [
            { post: { deletedAt: { not: null } } },
            { post: { state: { in: ['PUBLISHED', 'ERROR'] } } },
            {
              post: {
                publishingJob: {
                  is: { state: { in: ['PUBLISHED', 'FAILED', 'CANCELLED'] } },
                },
              },
            },
            {
              post: {
                publishingJob: {
                  is: { deliveryStage: { in: ['sent', 'confirmed_live'] } },
                },
              },
            },
          ],
        },
        select: {
          postId: true,
          post: {
            select: {
              state: true,
              deletedAt: true,
              publishingJob: {
                select: { state: true, deliveryStage: true },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'asc' }, { postId: 'asc' }],
        take: Math.max(1, Math.min(take, 1_000)),
      });
      let repaired = 0;
      for (const candidate of candidates) {
        const job = candidate.post.publishingJob;
        const accepted =
          candidate.post.state === 'PUBLISHED' ||
          job?.state === 'PUBLISHED' ||
          job?.deliveryStage === 'sent' ||
          job?.deliveryStage === 'confirmed_live';
        const cancelled =
          !!candidate.post.deletedAt || job?.state === 'CANCELLED';
        const status = accepted
          ? 'COMPLETED'
          : cancelled
          ? 'CANCELLED'
          : 'FAILED';
        const result = await tx.accountPublishingQueueItem.updateMany({
          where: { postId: candidate.postId, status: 'WAITING' },
          data: {
            status,
            terminalCode: accepted
              ? 'provider_accepted'
              : cancelled
              ? 'post_cancelled'
              : 'post_failed',
            terminalReason: accepted
              ? 'Provider acceptance was recovered from the delivery ledger.'
              : cancelled
              ? 'The queued post was cancelled before provider mutation.'
              : 'The queued post already has a classified terminal failure.',
            completedAt: now,
          },
        });
        repaired += result.count;
      }
      const expiredLeases = await tx.accountPublishingQueueState.updateMany({
        where: { leaseUntil: { lte: now } },
        data: {
          leasePostId: null,
          leaseToken: null,
          leaseUntil: null,
          cooldownReason: null,
        },
      });
      return {
        scanned: candidates.length,
        repaired,
        expiredLeasesCleared: expiredLeases.count,
      };
    });
  }
}
