import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PublishingFailureRepository } from '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-failure.repository';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { PublishingReceiptService } from './publishing-receipt.service';
import {
  normalizePostFailure,
  PostFailureInput,
} from '@gitroom/nestjs-libraries/reliability/post.failure';
import { ConnectionHealthService } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service';
import { PublishingAttemptService } from './publishing-attempt.service';

export type RecordPostFailureInput = Omit<
  Parameters<PublishingFailureRepository['record']>[0],
  'failure'
> &
  PostFailureInput;

@Injectable()
export class PublishingFailureService {
  private readonly logger = new Logger(PublishingFailureService.name);

  constructor(
    private _repository: PublishingFailureRepository,
    private _webhooks: WebhooksService,
    private _receipts: PublishingReceiptService,
    private _connectionHealth: ConnectionHealthService,
    private _publishingAttempts: PublishingAttemptService
  ) {}

  async record(input: RecordPostFailureInput) {
    const failure = normalizePostFailure({
      error: input.error,
      reason: input.reason,
      code: input.code,
      legacyCategory: input.legacyCategory,
      willRetry: input.state === 'RETRYING' || input.willRetry,
      mutationMayHaveSucceeded: input.mutationMayHaveSucceeded,
    });
    const event = await this._repository.record({
      organizationId: input.organizationId,
      postId: input.postId,
      state: input.state,
      nextAttemptAt: input.nextAttemptAt,
      eventId: input.eventId,
      failure,
    });

    await this._publishingAttempts.markPostFailure({
      organizationId: event.organizationId,
      postId: event.postId,
      failureEventId: event.id,
      failureClass: event.failureClass,
      failureCode: event.failureCode,
      failureReason: event.reason,
      willRetry: event.willRetry,
      now: event.occurredAt,
    });

    await this._receipts.record({
      organizationId: event.organizationId,
      postId: event.postId,
      stage: 'failed',
      attempt: event.attempt,
      failureId: event.id,
      evidence: {
        failureClass: event.failureClass,
        failureCode: event.failureCode,
        reason: event.reason,
        willRetry: event.willRetry,
      },
    });

    await this._connectionHealth.recordPublishingFailure(event);

    if (
      event.webhookState !== 'DELIVERED' &&
      event.webhookState !== 'NOT_CONFIGURED'
    ) {
      await this.dispatch(event);
    }

    return event;
  }

  listForPost(organizationId: string, postId: string) {
    return this._repository.listForPost(organizationId, postId);
  }

  private async dispatch(
    event: Awaited<ReturnType<PublishingFailureRepository['record']>>
  ) {
    let hooks: Awaited<ReturnType<WebhooksService['getWebhooksForDelivery']>>;
    try {
      hooks = (await this._webhooks.getWebhooksForDelivery(
        event.organizationId
      )).filter(
        (hook) =>
          hook.integrations.length === 0 ||
          hook.integrations.some(
            (item) => item.integration.id === event.integrationId
          )
      );
    } catch (error) {
      await this.markDispatchFailure(event.id, error);
      return;
    }

    if (hooks.length === 0) {
      await this._repository.markWebhookState(event.id, 'NOT_CONFIGURED');
      return;
    }

    const body = JSON.stringify({
      specversion: '1.0',
      id: event.id,
      type: 'post.failure',
      time: event.occurredAt.toISOString(),
      data: {
        postId: event.postId,
        postGroup: event.postGroup,
        integrationId: event.integrationId,
        provider: event.provider,
        attempt: event.attempt,
        willRetry: event.willRetry,
        failure: {
          class: event.failureClass,
          code: event.failureCode,
          reason: event.reason,
        },
      },
    });

    const delivered = await Promise.all(
      hooks.map((hook) => this.deliverToHook(event, hook, body))
    );
    await this._repository.markWebhookState(
      event.id,
      delivered.every(Boolean) ? 'DELIVERED' : 'FAILED'
    );
  }

  private async deliverToHook(
    event: Awaited<ReturnType<PublishingFailureRepository['record']>>,
    hook: Awaited<
      ReturnType<WebhooksService['getWebhooksForDelivery']>
    >[number],
    body: string
  ) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const startedAt = Date.now();
      const timestamp = Math.floor(startedAt / 1000).toString();
      const signature = createHmac('sha256', hook.signingSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');

      try {
        const response = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Publishly-Webhooks/1.0',
            'X-Publishly-Event': 'post.failure',
            'X-Publishly-Event-Id': event.id,
            'X-Publishly-Timestamp': timestamp,
            'X-Publishly-Signature': `t=${timestamp},v1=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
          // @ts-ignore - undici dispatcher is not in lib.dom RequestInit.
          dispatcher: getSsrfSafeDispatcher(),
        });
        await this.recordDelivery({
          organizationId: event.organizationId,
          webhookId: hook.id,
          eventId: event.id,
          eventType: 'post.failure',
          attempt,
          status: response.ok ? 'DELIVERED' : 'FAILED',
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
          ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
        });
        if (response.ok) return true;
      } catch (error) {
        await this.recordDelivery({
          organizationId: event.organizationId,
          webhookId: hook.id,
          eventId: event.id,
          eventType: 'post.failure',
          attempt,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          error:
            error instanceof Error
              ? error.message
              : 'The webhook receiver could not be reached.',
        });
      }

      if (attempt < 3) {
        await this.sleep(attempt === 1 ? 1_000 : 5_000);
      }
    }
    return false;
  }

  private async recordDelivery(
    input: Parameters<WebhooksService['recordDelivery']>[0]
  ) {
    try {
      await this._webhooks.recordDelivery(input);
    } catch (error) {
      this.logger.error({
        event: 'post.failure.webhook_attempt_write_failed',
        failureEventId: input.eventId,
        webhookId: input.webhookId,
        attempt: input.attempt,
        reason:
          error instanceof Error
            ? error.message
            : 'Webhook attempt ledger write failed.',
      });
    }
  }

  private async markDispatchFailure(eventId: string, error: unknown) {
    this.logger.error({
      event: 'post.failure.webhook_dispatch_failed',
      failureEventId: eventId,
      reason:
        error instanceof Error
          ? error.message
          : 'Webhook dispatch failed before delivery.',
    });
    await this._repository.markWebhookState(eventId, 'FAILED');
  }

  private sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
