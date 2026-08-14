import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { isSealed, open, seal } from '@gitroom/helpers/auth/crypto.v2';
import {
  canonicalJson,
  sha256,
} from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import {
  normalizePostFailure,
  PostFailureClass,
} from '@gitroom/nestjs-libraries/reliability/post.failure';
import { PublishingAttemptRepository } from './publishing-attempt.repository';

export type V109AttemptContext = {
  attemptNumber: number;
  activityKey: string;
};

function boundedEvidence(value: unknown) {
  const serialized = canonicalJson(value ?? {});
  if (Buffer.byteLength(serialized, 'utf8') <= 64 * 1024) {
    return JSON.parse(serialized) as Prisma.InputJsonValue;
  }
  return {
    truncated: true,
    sha256: sha256(serialized),
    preview: serialized.slice(0, 4_000),
  } as Prisma.InputJsonValue;
}

function sealedAcceptedResults(results: unknown) {
  const serialized = canonicalJson(results);
  if (Buffer.byteLength(serialized, 'utf8') > 40 * 1024) {
    throw new Error('publishing_attempt_accepted_result_too_large');
  }
  return seal(serialized);
}

@Injectable()
export class PublishingAttemptService {
  private readonly logger = new Logger(PublishingAttemptService.name);

  constructor(private _repository: PublishingAttemptRepository) {}

  fingerprint(input: { postId: string; provider: string; posts: unknown }) {
    return sha256(
      canonicalJson({
        schemaVersion: 1,
        postId: input.postId,
        provider: input.provider,
        posts: input.posts,
      })
    );
  }

  async beginMutation(input: {
    organizationId: string;
    postId: string;
    provider: string;
    posts: unknown;
    context: V109AttemptContext;
  }) {
    if (
      !Number.isInteger(input.context.attemptNumber) ||
      input.context.attemptNumber < 1 ||
      !/^v109:mutation:[a-zA-Z0-9_-]+:\d+$/.test(input.context.activityKey)
    ) {
      throw new Error('publishing_attempt_context_invalid');
    }
    const mutationFingerprint = this.fingerprint(input);
    const id = `publish_attempt_${sha256(
      `${input.organizationId}:${input.postId}:${input.context.activityKey}`
    ).slice(0, 32)}`;
    const result = await this._repository.begin({
      id,
      organizationId: input.organizationId,
      postId: input.postId,
      attemptNumber: input.context.attemptNumber,
      phase: 'MUTATION',
      activityKey: input.context.activityKey,
      mutationFingerprint,
    });
    if (result.type === 'job_not_found') {
      throw new Error('publishing_attempt_job_not_found');
    }
    if (result.type === 'mismatch') {
      throw new Error('publishing_attempt_idempotency_mismatch');
    }
    return {
      attempt: result.attempt,
      mutationFingerprint,
      terminalReplay:
        result.attempt.state !== 'STARTED' || result.attempt.mutationInvoked,
    };
  }

  async markMutationInvoked(input: {
    organizationId: string;
    postId: string;
    attemptId: string;
    mutationFingerprint: string;
    now?: Date;
  }) {
    const changed = await this._repository.markInvoked(input);
    if (changed.count !== 1) {
      throw new Error('publishing_attempt_not_startable');
    }
    await this._repository.markCampaignDispatching({
      organizationId: input.organizationId,
      postId: input.postId,
      now: input.now || new Date(),
    });
  }

  async accepted(input: {
    organizationId: string;
    attemptId: string;
    mutationFingerprint: string;
    results: Array<{ postId?: string; releaseURL?: string; status?: string }>;
    now?: Date;
  }) {
    const first = input.results[0] || {};
    const attempt = await this._repository.complete({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      mutationFingerprint: input.mutationFingerprint,
      state: 'ACCEPTED',
      providerPostId: first.postId || null,
      providerUrl: first.releaseURL || null,
      failureClass: null,
      failureCode: null,
      failureReason: null,
      evidence: boundedEvidence({
        providerStatus: first.status || 'accepted',
        resultCount: input.results.length,
        acceptedResults: sealedAcceptedResults(input.results),
      }),
      now: input.now || new Date(),
    });
    if (!attempt) throw new Error('publishing_attempt_completion_conflict');
    Sentry.metrics.count('publishing_attempt_accepted', 1);
    return attempt;
  }

  acceptedReplayResults(attempt: { evidence?: unknown }) {
    const evidence =
      attempt.evidence && typeof attempt.evidence === 'object'
        ? (attempt.evidence as Record<string, unknown>)
        : null;
    const sealed = evidence?.acceptedResults;
    if (typeof sealed !== 'string' || !isSealed(sealed)) return null;
    try {
      const parsed = JSON.parse(open(sealed));
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async failed(input: {
    organizationId: string;
    attemptId: string;
    mutationFingerprint: string;
    error: unknown;
    safeAbsentProof: boolean;
    now?: Date;
  }) {
    const failure = normalizePostFailure({
      error: input.error,
      code: input.safeAbsentProof ? undefined : 'outcome_unknown',
      mutationMayHaveSucceeded: !input.safeAbsentProof,
      willRetry: input.safeAbsentProof,
    });
    const attempt = await this._repository.complete({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      mutationFingerprint: input.mutationFingerprint,
      state: input.safeAbsentProof ? 'FAILED' : 'AMBIGUOUS',
      failureClass: failure.failureClass,
      failureCode: failure.code,
      failureReason: failure.reason,
      evidence: boundedEvidence({ safeAbsentProof: input.safeAbsentProof }),
      now: input.now || new Date(),
    });
    if (!attempt) throw new Error('publishing_attempt_completion_conflict');
    Sentry.metrics.count(
      input.safeAbsentProof
        ? 'publishing_attempt_safe_failure'
        : 'publishing_attempt_ambiguous',
      1
    );
    return attempt;
  }

  async beginReconciliation(input: {
    organizationId: string;
    postId: string;
    attemptNumber: number;
  }) {
    const mutation = await this._repository.getMutationAttempt(input);
    if (!mutation) throw new Error('publishing_mutation_attempt_not_found');
    const activityKey = `v109:reconcile:${input.postId}:${input.attemptNumber}`;
    const id = `publish_attempt_${sha256(
      `${input.organizationId}:${input.postId}:${activityKey}`
    ).slice(0, 32)}`;
    const result = await this._repository.begin({
      id,
      organizationId: input.organizationId,
      postId: input.postId,
      attemptNumber: input.attemptNumber,
      phase: 'RECONCILIATION',
      activityKey,
      mutationFingerprint: mutation.mutationFingerprint,
    });
    if (result.type === 'job_not_found' || result.type === 'mismatch') {
      throw new Error(`publishing_reconciliation_${result.type}`);
    }
    return { mutation, attempt: result.attempt };
  }

  async completeReconciliation(input: {
    organizationId: string;
    postId: string;
    attemptId: string;
    mutationFingerprint: string;
    result: {
      status: 'confirmed' | 'absent' | 'inconclusive';
      providerPostId?: string;
      providerUrl?: string;
      method: string;
      reason?: string;
      evidence?: Record<string, unknown>;
    };
    now?: Date;
  }) {
    const now = input.now || new Date();
    const inconclusiveReason =
      input.result.reason ||
      'Provider readback could not prove whether the mutation was accepted. Manual review is required before retry.';
    const state =
      input.result.status === 'confirmed'
        ? 'CONFIRMED'
        : input.result.status === 'absent'
        ? 'ABSENT'
        : 'NEEDS_REVIEW';
    const failureClass: PostFailureClass | null =
      input.result.status === 'inconclusive' ? 'recoverable' : null;
    const attempt = await this._repository.complete({
      organizationId: input.organizationId,
      attemptId: input.attemptId,
      mutationFingerprint: input.mutationFingerprint,
      state,
      providerPostId: input.result.providerPostId || null,
      providerUrl: input.result.providerUrl || null,
      failureClass,
      failureCode:
        input.result.status === 'inconclusive'
          ? 'outcome_unknown'
          : null,
      failureReason:
        input.result.status === 'inconclusive' ? inconclusiveReason : null,
      evidence: boundedEvidence({
        method: input.result.method,
        ...(input.result.evidence || {}),
      }),
      now,
    });
    if (!attempt) throw new Error('publishing_reconciliation_completion_conflict');
    if (input.result.status === 'inconclusive') {
      await this._repository.markCampaignNeedsReview({
        organizationId: input.organizationId,
        postId: input.postId,
        code: 'provider_timeout_ambiguous',
        reason: inconclusiveReason,
        evidence: boundedEvidence({
          method: input.result.method,
          ...(input.result.evidence || {}),
        }),
        now,
      });
    }
    this.logger[input.result.status === 'inconclusive' ? 'warn' : 'log']({
      event: 'publishing_ambiguity_reconciled',
      organizationId: input.organizationId,
      postId: input.postId,
      status: input.result.status,
      method: input.result.method,
    });
    Sentry.metrics.count(
      `publishing_reconciliation_${input.result.status}`,
      1
    );
    return attempt;
  }

  markPostPublished(organizationId: string, postId: string, now = new Date()) {
    return this._repository.markCampaignPublished({ organizationId, postId, now });
  }

  markPostFailure(input: {
    organizationId: string;
    postId: string;
    failureEventId: string;
    failureClass: PostFailureClass;
    failureCode: string;
    failureReason: string;
    willRetry: boolean;
    now?: Date;
  }) {
    return this._repository.markCampaignFailure({
      ...input,
      now: input.now || new Date(),
    });
  }
}
