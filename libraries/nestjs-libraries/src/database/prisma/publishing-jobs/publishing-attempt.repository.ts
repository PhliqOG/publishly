import { Injectable } from '@nestjs/common';
import {
  BulkCampaignIssueClass,
  PostFailureClass,
  Prisma,
  PublishingAttemptPhase,
  PublishingAttemptState,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';

function issueId(organizationId: string, campaignId: string, eventKey: string) {
  return `bulk_issue_${sha256(`${organizationId}:${campaignId}:${eventKey}`).slice(0, 32)}`;
}

@Injectable()
export class PublishingAttemptRepository {
  constructor(
    private _db: PrismaRepository<
      | 'publishingAttempt'
      | 'publishingJob'
      | 'bulkCampaignJob'
      | 'bulkCampaign'
      | 'bulkCampaignIssue'
      | 'auditLog'
    >,
    private _transaction: PrismaTransaction
  ) {}

  async begin(input: {
    id: string;
    organizationId: string;
    postId: string;
    attemptNumber: number;
    phase: PublishingAttemptPhase;
    activityKey: string;
    mutationFingerprint: string;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.publishingJob.findFirst({
        where: { organizationId: input.organizationId, postId: input.postId },
        select: { id: true },
      });
      if (!job) return { type: 'job_not_found' as const };
      const existing = await tx.publishingAttempt.findUnique({
        where: {
          organizationId_publishingJobId_activityKey: {
            organizationId: input.organizationId,
            publishingJobId: job.id,
            activityKey: input.activityKey,
          },
        },
      });
      if (existing) {
        if (
          existing.mutationFingerprint !== input.mutationFingerprint ||
          existing.attemptNumber !== input.attemptNumber ||
          existing.phase !== input.phase
        ) {
          return { type: 'mismatch' as const, attempt: existing };
        }
        return { type: 'replay' as const, attempt: existing };
      }
      const attempt = await tx.publishingAttempt.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          publishingJobId: job.id,
          attemptNumber: input.attemptNumber,
          phase: input.phase,
          activityKey: input.activityKey,
          mutationFingerprint: input.mutationFingerprint,
        },
      });
      return { type: 'created' as const, attempt };
    });
  }

  markInvoked(input: {
    organizationId: string;
    attemptId: string;
    mutationFingerprint: string;
  }) {
    return this._db.model.publishingAttempt.updateMany({
      where: {
        id: input.attemptId,
        organizationId: input.organizationId,
        mutationFingerprint: input.mutationFingerprint,
        state: 'STARTED',
      },
      data: { mutationInvoked: true },
    });
  }

  async complete(input: {
    organizationId: string;
    attemptId: string;
    mutationFingerprint: string;
    state: Exclude<PublishingAttemptState, 'STARTED'>;
    providerPostId?: string | null;
    providerUrl?: string | null;
    failureClass?: PostFailureClass | null;
    failureCode?: string | null;
    failureReason?: string | null;
    evidence?: Prisma.InputJsonValue;
    now: Date;
  }) {
    const changed = await this._db.model.publishingAttempt.updateMany({
      where: {
        id: input.attemptId,
        organizationId: input.organizationId,
        mutationFingerprint: input.mutationFingerprint,
        state: 'STARTED',
      },
      data: {
        state: input.state,
        providerPostId: input.providerPostId,
        providerUrl: input.providerUrl,
        failureClass: input.failureClass,
        failureCode: input.failureCode,
        failureReason: input.failureReason,
        evidence: input.evidence,
        completedAt: input.now,
      },
    });
    if (changed.count === 1) {
      return this._db.model.publishingAttempt.findFirst({
        where: { id: input.attemptId, organizationId: input.organizationId },
      });
    }
    return this._db.model.publishingAttempt.findFirst({
      where: {
        id: input.attemptId,
        organizationId: input.organizationId,
        mutationFingerprint: input.mutationFingerprint,
        state: input.state,
      },
    });
  }

  getMutationAttempt(input: {
    organizationId: string;
    postId: string;
    attemptNumber: number;
  }) {
    return this._db.model.publishingAttempt.findFirst({
      where: {
        organizationId: input.organizationId,
        publishingJob: { postId: input.postId },
        attemptNumber: input.attemptNumber,
        phase: 'MUTATION',
      },
    });
  }

  async markCampaignDispatching(input: {
    organizationId: string;
    postId: string;
    now: Date;
  }) {
    return this._db.model.bulkCampaignJob.updateMany({
      where: {
        organizationId: input.organizationId,
        postId: input.postId,
        state: { in: ['SCHEDULED', 'RETRYABLE_FAILURE'] },
      },
      data: {
        state: 'DISPATCHING',
        dispatchedAt: input.now,
        outcomeClass: null,
        outcomeCode: 'provider_mutation_started',
        outcomeReason: 'V109 started the provider mutation for this campaign job.',
      },
    });
  }

  async markCampaignPublished(input: {
    organizationId: string;
    postId: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.bulkCampaignJob.findFirst({
        where: {
          organizationId: input.organizationId,
          postId: input.postId,
        },
      });
      if (!job) return { type: 'not_campaign' as const };
      const changed = await tx.bulkCampaignJob.updateMany({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          state: {
            in: [
              'SCHEDULED',
              'DISPATCHING',
              'RETRYABLE_FAILURE',
              'NEEDS_REVIEW',
            ],
          },
        },
        data: {
          state: 'PUBLISHED',
          publishedAt: input.now,
          outcomeClass: null,
          outcomeCode: 'confirmed_live',
          outcomeReason:
            'The existing verified publishing path confirmed this post live.',
        },
      });
      if (!changed.count) return { type: 'unchanged' as const };
      const resolved = await tx.bulkCampaignIssue.updateMany({
        where: {
          organizationId: input.organizationId,
          campaignId: job.campaignId,
          subjectType: 'publish_job',
          subjectId: job.id,
          retryable: true,
          state: 'open',
        },
        data: { state: 'resolved', resolvedAt: input.now },
      });
      if (resolved.count) {
        const campaign = await tx.bulkCampaign.findFirst({
          where: { id: job.campaignId, organizationId: input.organizationId },
          select: { openIssueCount: true },
        });
        await tx.bulkCampaign.updateMany({
          where: { id: job.campaignId, organizationId: input.organizationId },
          data: {
            openIssueCount: Math.max(
              0,
              (campaign?.openIssueCount || 0) - resolved.count
            ),
          },
        });
      }
      return { type: 'published' as const, jobId: job.id };
    });
  }

  async markCampaignFailure(input: {
    organizationId: string;
    postId: string;
    failureEventId: string;
    failureClass: PostFailureClass;
    failureCode: string;
    failureReason: string;
    willRetry: boolean;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.bulkCampaignJob.findFirst({
        where: { organizationId: input.organizationId, postId: input.postId },
      });
      if (!job) return { type: 'not_campaign' as const };
      const ambiguous = input.failureCode === 'outcome_unknown';
      const state = ambiguous
        ? 'NEEDS_REVIEW'
        : input.willRetry
        ? 'RETRYABLE_FAILURE'
        : input.failureClass === 'user_action_needed'
        ? 'BLOCKED'
        : 'FINAL_FAILURE';
      const issueClass: BulkCampaignIssueClass =
        ambiguous || input.failureClass === 'user_action_needed'
          ? 'blocked'
          : 'failed';
      await tx.bulkCampaignJob.updateMany({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          state: {
            notIn: ['PUBLISHED', 'CANCELLED', 'FINAL_FAILURE'],
          },
        },
        data: {
          state,
          outcomeClass: issueClass,
          outcomeCode: input.failureCode,
          outcomeReason: input.failureReason,
          claimTokenHash: null,
          leaseExpiresAt: null,
        },
      });
      const eventKey = `publishing_failure:${input.failureEventId}`;
      const created = await tx.bulkCampaignIssue.createMany({
        data: [
          {
            id: issueId(input.organizationId, job.campaignId, eventKey),
            organizationId: input.organizationId,
            campaignId: job.campaignId,
            eventKey,
            issueClass,
            failureClass: input.failureClass,
            code: input.failureCode,
            reason: input.failureReason,
            subjectType: 'publish_job',
            subjectId: job.id,
            retryable: input.willRetry && !ambiguous,
            occurredAt: input.now,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count) {
        await tx.bulkCampaign.update({
          where: { id: job.campaignId },
          data: {
            issueCount: { increment: 1 },
            openIssueCount: { increment: 1 },
            ...(ambiguous ? { state: 'NEEDS_REVIEW' } : {}),
          },
        });
      }
      const auditId = `bulk_failure_audit_${sha256(
        `${input.organizationId}:${input.failureEventId}`
      ).slice(0, 36)}`;
      await tx.auditLog.upsert({
        where: { id: auditId },
        create: {
          id: auditId,
          organizationId: input.organizationId,
          actorType: 'system',
          action: 'bulk.campaign.job-publishing-failure',
          targetType: 'bulkCampaignJob',
          targetId: job.id,
          metadata: JSON.stringify({
            campaignId: job.campaignId,
            failureEventId: input.failureEventId,
            failureClass: input.failureClass,
            failureCode: input.failureCode,
            willRetry: input.willRetry,
          }),
        },
        update: {},
      });
      return { type: 'updated' as const, campaignId: job.campaignId, jobId: job.id };
    });
  }

  async markCampaignNeedsReview(input: {
    organizationId: string;
    postId: string;
    code: 'provider_timeout_ambiguous' | 'needs_review';
    reason: string;
    evidence?: Prisma.InputJsonValue;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const job = await tx.bulkCampaignJob.findFirst({
        where: { organizationId: input.organizationId, postId: input.postId },
      });
      if (!job) return { type: 'not_campaign' as const };
      await tx.bulkCampaignJob.updateMany({
        where: {
          id: job.id,
          organizationId: input.organizationId,
          state: { notIn: ['PUBLISHED', 'CANCELLED', 'FINAL_FAILURE'] },
        },
        data: {
          state: 'NEEDS_REVIEW',
          outcomeClass: 'blocked',
          outcomeCode: input.code,
          outcomeReason: input.reason,
        },
      });
      await tx.bulkCampaign.updateMany({
        where: {
          id: job.campaignId,
          organizationId: input.organizationId,
          state: { notIn: ['COMPLETED', 'CANCELLED', 'FAILED'] },
        },
        data: { state: 'NEEDS_REVIEW' },
      });
      const eventKey = `${input.code}:${job.id}`;
      const created = await tx.bulkCampaignIssue.createMany({
        data: [
          {
            id: issueId(input.organizationId, job.campaignId, eventKey),
            organizationId: input.organizationId,
            campaignId: job.campaignId,
            eventKey,
            issueClass: 'blocked' as BulkCampaignIssueClass,
            failureClass: 'recoverable',
            code: input.code,
            reason: input.reason,
            subjectType: 'publish_job',
            subjectId: job.id,
            retryable: false,
            details: input.evidence,
            occurredAt: input.now,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count) {
        await tx.bulkCampaign.update({
          where: { id: job.campaignId },
          data: {
            issueCount: { increment: 1 },
            openIssueCount: { increment: 1 },
          },
        });
      }
      return { type: 'updated' as const, campaignId: job.campaignId, jobId: job.id };
    });
  }

  list(input: {
    organizationId: string;
    publishingJobId: string;
    cursor?: { startedAt: Date; id: string } | null;
    limit: number;
  }) {
    return this._db.model.publishingAttempt.findMany({
      where: {
        organizationId: input.organizationId,
        publishingJobId: input.publishingJobId,
        ...(input.cursor
          ? {
              OR: [
                { startedAt: { gt: input.cursor.startedAt } },
                { startedAt: input.cursor.startedAt, id: { gt: input.cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
  }
}
