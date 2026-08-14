import { Injectable, Logger } from '@nestjs/common';
import { withOpenToken } from '@gitroom/helpers/auth/crypto.v2';
import {
  Activity,
  ActivityMethod,
  TemporalService,
} from 'nestjs-temporal-core';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import {
  NotificationService,
  NotificationType,
} from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { Integration, Post, PublishingJobState, State } from '@prisma/client';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { AuthTokenDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { timer } from '@gitroom/helpers/utils/timer';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { PublishingRetryService } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-retry.service';
import { AccountPublishingQueueService } from '@gitroom/nestjs-libraries/database/prisma/account-queue/account-publishing-queue.service';
import { AccountQueueReleaseOutcome } from '@gitroom/nestjs-libraries/database/prisma/account-queue/account-publishing-queue.repository';
import {
  PublishingAttemptService,
  V109AttemptContext,
} from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-attempt.service';
import { ProviderTransient } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { BulkCampaignExecutionService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.service';
import { BulkUploadService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.service';

// Drops fields the workflow and downstream activities never read — biggest wins are `error` (grows per retry) and `childrenPost` (Prisma side-loads it on every recursive row).
function slimPost(post: any) {
  if (!post) return post;
  const {
    error,
    childrenPost,
    tags,
    description,
    title,
    submittedForOrderId,
    submittedForOrganizationId,
    submittedForOrder,
    submittedForOrganization,
    lastMessageId,
    parentPostId,
    approvedSubmitForOrder,
    deletedAt,
    createdAt,
    updatedAt,
    payoutProblems,
    comments,
    errors,
    ...rest
  } = post;
  return rest;
}

const RECEIPT_CORRELATION_KEY = '__publishlyReceipt';

function receiptCorrelation(pendingData: any): { postId: string } | undefined {
  return pendingData && typeof pendingData === 'object'
    ? pendingData[RECEIPT_CORRELATION_KEY]
    : undefined;
}

function preserveReceiptCorrelation(
  pendingData: any,
  correlation?: { postId: string }
) {
  if (pendingData && typeof pendingData === 'object' && correlation?.postId) {
    pendingData[RECEIPT_CORRELATION_KEY] = correlation;
  }
  return pendingData;
}

function restoreOpaquePrivateMedia(
  value: unknown,
  replacements: Array<{ hydrated: string; opaque: string }>,
  depth = 0
): any {
  if (depth > 20) throw new Error('bulk_private_media_value_too_deep');
  if (typeof value === 'string') {
    return replacements.find((item) => item.hydrated === value)?.opaque || value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      restoreOpaquePrivateMedia(item, replacements, depth + 1)
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        restoreOpaquePrivateMedia(item, replacements, depth + 1),
      ])
    );
  }
  return value;
}

@Injectable()
@Activity()
export class PostActivity {
  private readonly logger = new Logger(PostActivity.name);
  constructor(
    private _postService: PostsService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _subscriptionService: SubscriptionService,
    private _publishingRetryService: PublishingRetryService,
    private _accountPublishingQueue: AccountPublishingQueueService,
    private _publishingAttempts: PublishingAttemptService,
    private _bulkCampaignExecution: BulkCampaignExecutionService,
    private _bulkUploads: BulkUploadService
  ) {}

  @ActivityMethod()
  async getIntegrationById(orgId: string, id: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  @ActivityMethod()
  assertBulkCampaignDispatchGateV109(orgId: string, postId: string) {
    return this._bulkCampaignExecution.assertDispatchGate(orgId, postId);
  }

  @ActivityMethod()
  async searchForMissingThreeHoursPosts() {
    const list = await this._postService.searchForMissingThreeHoursPosts();
    for (const post of list) {
      await this._temporalService.client
        .getRawClient()
        .workflow.signalWithStart('postWorkflowV109', {
          workflowId: `post_${post.id}`,
          taskQueue: 'main',
          signal: 'poke',
          workflowIdConflictPolicy: 'USE_EXISTING',
          signalArgs: [],
          args: [
            {
              taskQueue: post.integration.providerIdentifier
                .split('-')[0]
                .toLowerCase(),
              postId: post.id,
              organizationId: post.organizationId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: post.id,
            },
            {
              key: organizationId,
              value: post.organizationId,
            },
          ]),
        });
    }
  }

  @ActivityMethod()
  retryDuePublishingQueuesV108() {
    return this._postService.retryDuePublishingQueuesV108();
  }

  @ActivityMethod()
  async materializeDueBulkCampaignJobsV101() {
    if (process.env.BULK_SCHEDULER_MATERIALIZER_ENABLED !== 'true') {
      return { disabled: true, claimed: 0, materialized: 0, failed: 0 };
    }
    const uploads = await this._bulkUploads.processBatch();
    const campaigns = await this._bulkCampaignExecution.runMaintenanceCycle();
    return { uploads, campaigns };
  }

  @ActivityMethod()
  async updatePost(id: string, postId: string, releaseURL: string) {
    await this._postService.updatePost(id, postId, releaseURL);
  }

  @ActivityMethod()
  async getPost(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return false;
      }
    }
    const post = await this._postService.getPostById(postId, orgId);
    if (post.deletedAt) {
      return false;
    }

    return post;
  }

  @ActivityMethod()
  async getPostsList(orgId: string, postId: string) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        orgId
      );
      if (!subscription) {
        return [];
      }
    }

    const getPosts = await this._postService.getPostsRecursively(
      postId,
      true,
      orgId
    );
    if (!getPosts || getPosts.length === 0 || getPosts[0].parentPostId) {
      return [];
    }

    return getPosts.map(slimPost);
  }

  @ActivityMethod()
  async isCommentable(integration: Integration) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    return !!getIntegration.comment;
  }

  @ActivityMethod()
  async postComment(
    postId: string,
    lastPostId: string | undefined,
    integration: Integration,
    posts: Post[]
  ) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const openedIntegration = withOpenToken(integration);

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const results = await getIntegration.comment(
      integration.internalId,
      postId,
      lastPostId,
      openedIntegration.token,
      await Promise.all(
        (newPosts || []).map(async (p) => ({
          id: p.id,
          message: stripHtmlValidation(
            getIntegration.editor,
            p.content,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content),
            getIntegration.mentionFormat
          ),
          settings: JSON.parse(p.settings || '{}'),
          media: await this._postService.updateMedia(
            p.id,
            JSON.parse(p.image || '[]'),
            getIntegration?.convertToJPEG || false,
            integration.organizationId
          ),
        }))
      ),
      openedIntegration
    );
    for (const result of results || []) {
      await this.recordSentReceipt(integration, result, false);
    }
    return results;
  }

  @ActivityMethod()
  async postSocial(integration: Integration, posts: Post[]) {
    return this.postSocialInternal(integration, posts, false);
  }

  // Used by postWorkflowV106 and up: providers that implement `postPending`
  // return a `pending` response the workflow resolves via checkPostStatus /
  // finalizePost. Older workflow versions keep calling `postSocial` and get
  // the old blocking behavior.
  @ActivityMethod()
  async postSocialPending(integration: Integration, posts: Post[]) {
    return this.postSocialInternal(integration, posts, true);
  }

  @ActivityMethod()
  async postSocialPendingV109(
    integration: Integration,
    posts: Post[],
    attemptContext: V109AttemptContext
  ) {
    return this.postSocialInternal(integration, posts, true, attemptContext);
  }

  private async postSocialInternal(
    integration: Integration,
    posts: Post[],
    allowPending: boolean,
    attemptContext?: V109AttemptContext
  ) {
    if (process.env.STRIPE_SECRET_KEY) {
      const subscription = await this._subscriptionService.getSubscription(
        integration.organizationId
      );

      if (!subscription) {
        throw new Error('No active subscription found for this organization.');
      }
    }

    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const openedIntegration = withOpenToken(integration);

    const newPosts = await this._postService.updateTags(
      integration.organizationId,
      posts
    );

    const replacements: Array<{ hydrated: string; opaque: string }> = [];
    const preparedPosts = await Promise.all(
      (newPosts || []).map(async (p) => {
        const media = await this._postService.updateMedia(
          p.id,
          JSON.parse(p.image || '[]'),
          getIntegration?.convertToJPEG || false,
          integration.organizationId
        );
        const base = {
          id: p.id,
          message: stripHtmlValidation(
            getIntegration.editor,
            p.content,
            true,
            false,
            !/<\/?[a-z][\s\S]*>/i.test(p.content),
            getIntegration.mentionFormat
          ),
          settings: JSON.parse(p.settings || '{}'),
          media,
        };
        const hydrated = await this._postService.hydratePublishingValue(
          integration.organizationId,
          p.id,
          base
        );
        return { base, hydrated };
      })
    );
    const attemptPosts = preparedPosts.map((item) => item.base);
    const mappedPosts = preparedPosts.map((item) => item.hydrated.value);
    preparedPosts.forEach((item) =>
      replacements.push(...item.hydrated.replacements)
    );

    let ledger:
      | Awaited<ReturnType<PublishingAttemptService['beginMutation']>>
      | undefined;
    if (attemptContext) {
      ledger = await this._publishingAttempts.beginMutation({
        organizationId: integration.organizationId,
        postId: posts[0].id,
        provider: integration.providerIdentifier,
        posts: attemptPosts,
        context: attemptContext,
      });
      if (ledger.terminalReplay) {
        const acceptedResults =
          ledger.attempt.state === 'ACCEPTED'
            ? this._publishingAttempts.acceptedReplayResults(ledger.attempt)
            : null;
        if (acceptedResults) return acceptedResults;
        if (
          ledger.attempt.state === 'ACCEPTED' &&
          ledger.attempt.providerPostId &&
          ledger.attempt.providerUrl
        ) {
          return [
            {
              id: posts[0].id,
              postId: ledger.attempt.providerPostId,
              releaseURL: ledger.attempt.providerUrl,
              status: 'success',
            },
          ];
        }
        throw new Error('publishing_mutation_attempt_requires_reconciliation');
      }
      await this._publishingAttempts.markMutationInvoked({
        organizationId: integration.organizationId,
        postId: posts[0].id,
        attemptId: ledger.attempt.id,
        mutationFingerprint: ledger.mutationFingerprint,
      });
    }

    let postNow;
    try {
      postNow =
        allowPending && getIntegration.postPending
          ? await getIntegration.postPending(
              integration.internalId,
              openedIntegration.token,
              mappedPosts,
              openedIntegration
            )
          : await getIntegration.post(
              integration.internalId,
              openedIntegration.token,
              mappedPosts,
              openedIntegration
            );
      postNow = restoreOpaquePrivateMedia(postNow, replacements);
      if (ledger) {
        await this._publishingAttempts.accepted({
          organizationId: integration.organizationId,
          attemptId: ledger.attempt.id,
          mutationFingerprint: ledger.mutationFingerprint,
          results: postNow,
        });
      }
    } catch (error) {
      if (ledger) {
        await this._publishingAttempts.failed({
          organizationId: integration.organizationId,
          attemptId: ledger.attempt.id,
          mutationFingerprint: ledger.mutationFingerprint,
          error,
          safeAbsentProof: error instanceof ProviderTransient,
        });
      }
      throw error;
    }

    for (const result of postNow || []) {
      if (result.status === 'pending') {
        preserveReceiptCorrelation(result.pendingData, { postId: result.id });
      }
      await this.recordSentReceipt(integration, result, allowPending);
    }

    // The post is already published at this point: the streak is best-effort,
    // failing the activity here would retry it and publish again.
    try {
      await this._temporalService.client
        .getRawClient()
        .workflow.start('streakWorkflow', {
          args: [{ organizationId: integration.organizationId }],
          workflowId: `streak_${integration.organizationId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: organizationId,
              value: integration.organizationId,
            },
          ]),
        });
    } catch (err) {
      this.logger.warn({
        event: 'post.streak_workflow_start_failed',
        organizationId: integration.organizationId,
        reason:
          err instanceof Error
            ? err.message
            : 'The streak workflow could not be started after publishing.',
      });
    }

    return postNow;
  }

  @ActivityMethod()
  async checkPostStatus(integration: Integration, pendingData: any) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const openedIntegration = withOpenToken(integration);
    const correlation = receiptCorrelation(pendingData);
    const hydrated = correlation?.postId
      ? await this._postService.hydratePublishingValue(
          integration.organizationId,
          correlation.postId,
          pendingData
        )
      : { value: pendingData, replacements: [] };
    const result = restoreOpaquePrivateMedia(await getIntegration.checkPostStatus(
      openedIntegration.token,
      hydrated.value,
      openedIntegration
    ), hydrated.replacements);
    if (result.status === 'completed' && correlation?.postId) {
      await this._postService.recordDeliveryReceipt({
        organizationId: integration.organizationId,
        postId: correlation.postId,
        stage: 'confirmed_live',
        providerPostId: result.postId,
        providerUrl: result.releaseURL,
        confirmationMethod: 'provider_status_api',
        evidence: { providerStatus: 'completed' },
      });
    } else if (result.status !== 'completed') {
      preserveReceiptCorrelation(result.pendingData, correlation);
    }
    return result;
  }

  @ActivityMethod()
  async finalizePost(integration: Integration, pendingData: any) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const openedIntegration = withOpenToken(integration);
    const correlation = receiptCorrelation(pendingData);
    const hydrated = correlation?.postId
      ? await this._postService.hydratePublishingValue(
          integration.organizationId,
          correlation.postId,
          pendingData
        )
      : { value: pendingData, replacements: [] };
    const result = restoreOpaquePrivateMedia(await getIntegration.finalizePost(
      openedIntegration.token,
      hydrated.value,
      openedIntegration
    ), hydrated.replacements);
    if (result.status !== 'completed') {
      preserveReceiptCorrelation(result.pendingData, correlation);
    }
    return result;
  }

  @ActivityMethod()
  async reconcileAmbiguousPostV109(
    integration: Integration,
    postId: string,
    attemptNumber: number
  ) {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    const openedIntegration = withOpenToken(integration);
    const ledger = await this._publishingAttempts.beginReconciliation({
      organizationId: integration.organizationId,
      postId,
      attemptNumber,
    });
    if (ledger.attempt.state !== 'STARTED') {
      if (ledger.attempt.state === 'CONFIRMED') {
        return {
          status: 'confirmed' as const,
          method: 'durable_reconciliation_replay',
          providerPostId: ledger.attempt.providerPostId!,
          providerUrl: ledger.attempt.providerUrl!,
        };
      }
      if (ledger.attempt.state === 'ABSENT') {
        return {
          status: 'absent' as const,
          method: 'durable_reconciliation_replay',
          reason: 'A prior provider read proved the timed-out post was absent.',
        };
      }
      return {
        status: 'inconclusive' as const,
        method: 'durable_reconciliation_replay',
        reason:
          ledger.attempt.failureReason ||
          'A prior provider read could not prove whether the post exists.',
      };
    }
    const result = await getIntegration.reconcileAmbiguousPost(
      openedIntegration.token,
      {
        publishlyPostId: postId,
        mutationFingerprint: ledger.mutation.mutationFingerprint,
        mutationStartedAt: ledger.mutation.startedAt.toISOString(),
      },
      openedIntegration
    );
    await this._publishingAttempts.completeReconciliation({
      organizationId: integration.organizationId,
      postId,
      attemptId: ledger.attempt.id,
      mutationFingerprint: ledger.mutation.mutationFingerprint,
      result,
    });
    return result;
  }

  private async recordSentReceipt(
    integration: Integration,
    result: {
      id: string;
      postId: string;
      releaseURL: string;
      status: string;
    },
    failActivity: boolean
  ) {
    try {
      await this._postService.recordDeliveryReceipt({
        organizationId: integration.organizationId,
        postId: result.id,
        stage: 'sent',
        providerPostId: result.postId || null,
        providerUrl: result.releaseURL || null,
        evidence: { providerStatus: result.status || 'accepted' },
      });
    } catch (error) {
      if (failActivity) throw error;
      // Legacy post/comment activities are mutation-retryable in their checked-
      // in workflow histories. Throwing after provider acceptance would replay
      // the mutation. updatePost's confirmation step reconstructs the missing
      // sent receipt before it can mark the post published.
      this.logger.error({
        event: 'post.sent_receipt_deferred',
        organizationId: integration.organizationId,
        postId: result.id,
        providerPostId: result.postId || null,
        reason:
          error instanceof Error
            ? error.message
            : 'The sent receipt could not be persisted after provider acceptance.',
      });
    }
  }

  @ActivityMethod()
  async inAppNotification(
    orgId: string,
    subject: string,
    message: string,
    sendEmail = false,
    digest = false,
    type: NotificationType = 'success'
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      subject,
      message,
      sendEmail,
      digest,
      type
    );
  }

  @ActivityMethod()
  async globalPlugs(integration: Integration) {
    return this._postService.checkPlugs(
      integration.organizationId,
      integration.providerIdentifier,
      integration.id
    );
  }

  @ActivityMethod()
  async changeState(id: string, state: State, err?: any, body?: any) {
    await this._postService.changeState(id, state, err, body);
  }

  @ActivityMethod()
  async changePublishingJobState(
    postId: string,
    state: PublishingJobState,
    error?: string,
    failureCategory?: string,
    retryInSeconds?: number
  ) {
    await this._postService.transitionPublishingJob(
      postId,
      state,
      error,
      failureCategory,
      retryInSeconds
    );
  }

  @ActivityMethod()
  async ensureClassifiedPublishingOutcomeV107(
    organizationId: string,
    postId: string,
    workflowError?: { message?: string; type?: string }
  ) {
    await this._postService.ensureClassifiedPublishingOutcomeV107(
      organizationId,
      postId,
      workflowError
    );
  }

  @ActivityMethod()
  waitForPublishingRateLimitV108(organizationId: string, postId: string) {
    return this._publishingRetryService.waitForConnectionGate({
      organizationId,
      postId,
    });
  }

  @ActivityMethod()
  schedulePublishingRetryV108(
    organizationId: string,
    postId: string,
    error: unknown,
    retryOrdinal: number,
    safeBeforeMutation = false
  ) {
    return this._publishingRetryService.scheduleRecoverableRetry({
      organizationId,
      postId,
      error,
      retryOrdinal,
      safeBeforeMutation,
    });
  }

  @ActivityMethod()
  acquireAccountPublishingQueueV109(organizationId: string, postId: string) {
    return this._accountPublishingQueue.acquire(organizationId, postId);
  }

  @ActivityMethod()
  releaseAccountPublishingQueueV109(
    organizationId: string,
    postId: string,
    leaseToken: string,
    outcome: AccountQueueReleaseOutcome,
    code?: string,
    reason?: string
  ) {
    return this._accountPublishingQueue.release(
      organizationId,
      postId,
      leaseToken,
      outcome,
      code,
      reason
    );
  }

  @ActivityMethod()
  reconcileAccountPublishingQueuesV109() {
    return this._accountPublishingQueue.reconcileTerminalOrphans();
  }

  @ActivityMethod()
  async internalPlugs(integration: Integration, settings: any) {
    return this._postService.checkInternalPlug(
      integration,
      integration.organizationId,
      integration.id,
      settings
    );
  }

  @ActivityMethod()
  async sendWebhooks(
    _postId: string,
    _orgId: string,
    _integrationId: string
  ) {
    // Temporal histories through V109 call this activity after updatePost.
    // Keep the activity name replay-compatible, but do not emit the retired
    // non-envelope post.published event. updatePost can complete only after a
    // durable confirmed_live receipt and its post.receipt webhook attempt.
  }
  @ActivityMethod()
  async processPlug(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    return this._integrationService.processPlugs(data);
  }

  @ActivityMethod()
  async processInternalPlug(data: {
    post: string;
    originalIntegration: string;
    integration: string;
    plugName: string;
    orgId: string;
    delay: number;
    information: any;
  }) {
    await this._integrationService.processInternalPlug(data);
  }

  @ActivityMethod()
  async refreshToken(
    integration: Integration
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration);
      return false;
    }
  }

  @ActivityMethod()
  async refreshTokenWithCause(
    integration: Integration,
    cause: string
  ): Promise<false | AuthTokenDetails> {
    const getIntegration = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    try {
      const refresh = await this._refreshIntegrationService.refresh(
        integration,
        cause
      );
      if (!refresh) {
        return false;
      }

      if (getIntegration.refreshWait) {
        await timer(10000);
      }

      return refresh;
    } catch (err) {
      await this._refreshIntegrationService.setBetweenSteps(integration, cause);
      return false;
    }
  }
}
