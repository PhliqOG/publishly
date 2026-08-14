import { Injectable, Logger } from '@nestjs/common';
import { DeliveryReceiptStage, Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import {
  PublishingReceiptRepository,
  RecordPublishingReceiptInput,
} from './publishing-receipt.repository';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { ConnectionHealthService } from '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service';

export type RecordDeliveryReceiptInput = Omit<
  RecordPublishingReceiptInput,
  'evidence'
> & {
  evidence?: Record<string, string | number | boolean | null | undefined>;
};

@Injectable()
export class PublishingReceiptService {
  private readonly logger = new Logger(PublishingReceiptService.name);

  constructor(
    private _repository: PublishingReceiptRepository,
    private _webhooks: WebhooksService,
    private _connectionHealth: ConnectionHealthService
  ) {}

  async record(input: RecordDeliveryReceiptInput) {
    if (input.stage === 'uploading') {
      await this.ensurePrior(input, 'queued');
    } else if (input.stage === 'sent') {
      await this.ensurePrior(input, 'uploading');
    } else if (input.stage === 'confirmed_live') {
      await this.ensurePrior(input, 'sent');
    }

    const current =
      input.stage !== 'uploading' && input.attempt === undefined
        ? await this._repository.getCurrentAttempt(
            input.organizationId,
            input.postId
          )
        : undefined;
    const normalizedInput = {
      ...input,
      ...(input.attempt === undefined && current
        ? { attempt: current.attempts }
        : {}),
    };
    const event = await this._repository.record({
      ...normalizedInput,
      evidence: this.cleanEvidence(input.evidence),
    });
    await this._connectionHealth.recordPublishingReceipt(event);
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

  isConfirmed(
    organizationId: string,
    postId: string,
    providerPostId?: string
  ) {
    return this._repository.isConfirmed(
      organizationId,
      postId,
      providerPostId
    );
  }

  private async ensurePrior(
    input: RecordDeliveryReceiptInput,
    stage: DeliveryReceiptStage
  ) {
    const existing = await this._repository.findStage(
      input.organizationId,
      input.postId,
      stage,
      input.attempt
    );
    if (existing) return existing;
    return this.record({
      organizationId: input.organizationId,
      postId: input.postId,
      stage,
      attempt: input.attempt,
      ...(stage === 'sent'
        ? {
            providerPostId: input.providerPostId,
            providerUrl: input.providerUrl,
          }
        : {}),
      evidence: { reconstructed: true },
    });
  }

  private cleanEvidence(
    evidence?: Record<string, string | number | boolean | null | undefined>
  ): Prisma.InputJsonObject | undefined {
    if (!evidence) return undefined;
    return Object.fromEntries(
      Object.entries(evidence)
        .filter(
          ([key, value]) =>
            value !== undefined &&
            !/(token|secret|authorization|cookie|body)/i.test(key)
        )
        .slice(0, 20)
        .map(([key, value]) => [
          key.slice(0, 100),
          typeof value === 'string' ? value.slice(0, 1_000) : value,
        ])
    ) as Prisma.InputJsonObject;
  }

  private async dispatch(
    event: Awaited<ReturnType<PublishingReceiptRepository['record']>>
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
      this.logger.error({
        event: 'post.receipt.webhook_dispatch_failed',
        receiptId: event.id,
        reason:
          error instanceof Error
            ? error.message
            : 'Receipt webhook discovery failed.',
      });
      await this._repository.markWebhookState(event.id, 'FAILED');
      return;
    }

    if (hooks.length === 0) {
      await this._repository.markWebhookState(event.id, 'NOT_CONFIGURED');
      return;
    }

    const body = JSON.stringify({
      specversion: '1.0',
      id: event.id,
      type: 'post.receipt',
      time: event.occurredAt.toISOString(),
      data: {
        postId: event.postId,
        postGroup: event.postGroup,
        integrationId: event.integrationId,
        provider: event.provider,
        stage: event.stage,
        attempt: event.attempt,
        providerPostId: event.providerPostId,
        providerUrl: event.providerUrl,
        confirmationMethod: event.confirmationMethod,
        evidence: event.evidence,
        failureId: event.failureId,
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
    event: Awaited<ReturnType<PublishingReceiptRepository['record']>>,
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
            'X-Publishly-Event': 'post.receipt',
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
          eventType: 'post.receipt',
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
          eventType: 'post.receipt',
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
        event: 'post.receipt.webhook_attempt_write_failed',
        receiptId: input.eventId,
        webhookId: input.webhookId,
        attempt: input.attempt,
        reason:
          error instanceof Error
            ? error.message
            : 'Receipt webhook attempt ledger write failed.',
      });
    }
  }

  private sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
