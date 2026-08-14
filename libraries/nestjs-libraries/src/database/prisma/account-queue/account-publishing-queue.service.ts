import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountPublishingQueueRepository,
  AccountQueueReleaseOutcome,
} from './account-publishing-queue.repository';

const LEASE_SECONDS = 30 * 60;
const AMBIGUOUS_COOLDOWN_SECONDS = 30 * 60;

function safeDetail(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 1_000)
    : fallback;
}

@Injectable()
export class AccountPublishingQueueService {
  constructor(private _repository: AccountPublishingQueueRepository) {}

  async acquire(organizationId: string, postId: string, now = new Date()) {
    const result = await this._repository.acquire({
      organizationId,
      postId,
      now,
      leaseSeconds: LEASE_SECONDS,
    });
    if (!result.ok && result.code === 'post_not_found') {
      throw new NotFoundException({
        code: result.code,
        reason: 'This queued post was not found in the current workspace.',
      });
    }
    if (!result.ok && result.code === 'connection_not_found') {
      throw new NotFoundException({
        code: result.code,
        reason:
          'The destination connection for this queued post no longer exists.',
      });
    }
    if (!result.ok) {
      throw new BadRequestException({
        code: result.code,
        reason:
          result.terminalReason ||
          'This post cannot enter the destination account queue in its current state.',
        ...(result.status ? { status: result.status } : {}),
      });
    }
    return result;
  }

  async release(
    organizationId: string,
    postId: string,
    leaseToken: string,
    outcome: AccountQueueReleaseOutcome,
    code?: unknown,
    reason?: unknown,
    now = new Date()
  ) {
    if (!/^[0-9a-f-]{20,100}$/i.test(leaseToken || '')) {
      throw new BadRequestException({
        code: 'invalid_account_queue_lease',
        reason: 'A valid destination account queue lease is required.',
      });
    }
    if (!['RETRY', 'COMPLETED', 'FAILED', 'AMBIGUOUS'].includes(outcome)) {
      throw new BadRequestException({
        code: 'invalid_account_queue_outcome',
        reason: 'The destination account queue release outcome is invalid.',
      });
    }
    const terminalCode = safeDetail(
      code,
      outcome === 'COMPLETED'
        ? 'provider_accepted'
        : outcome === 'RETRY'
        ? 'safe_retry'
        : outcome === 'AMBIGUOUS'
        ? 'outcome_unknown'
        : 'publishing_failed'
    );
    const terminalReason = safeDetail(
      reason,
      outcome === 'COMPLETED'
        ? 'The provider accepted the post mutation.'
        : outcome === 'RETRY'
        ? 'The provider proved no mutation was accepted; this post may retry safely.'
        : outcome === 'AMBIGUOUS'
        ? 'The provider mutation outcome is unknown; this account is cooling down before another post can start.'
        : 'The post reached a classified terminal failure before provider acceptance.'
    );
    const result = await this._repository.release({
      organizationId,
      postId,
      leaseToken,
      outcome,
      code: terminalCode,
      reason: terminalReason,
      now,
      ambiguousCooldownSeconds: AMBIGUOUS_COOLDOWN_SECONDS,
    });
    if (!result.ok && result.code === 'queue_item_not_found') {
      throw new NotFoundException({
        code: result.code,
        reason: 'This post has no destination account queue entry.',
      });
    }
    if (!result.ok) {
      throw new BadRequestException({
        code: result.code,
        reason:
          'The destination account queue lease no longer belongs to this post; the provider mutation will not be replayed.',
      });
    }
    return result;
  }

  async getQueue(organizationId: string, integrationId: string) {
    const queue = await this._repository.getQueue(
      organizationId,
      integrationId
    );
    if (!queue) {
      throw new NotFoundException({
        code: 'connection_not_found',
        reason:
          'This destination connection was not found in the current workspace.',
      });
    }
    return queue;
  }

  reconcileTerminalOrphans(now = new Date()) {
    return this._repository.reconcileTerminalOrphans(now);
  }
}
