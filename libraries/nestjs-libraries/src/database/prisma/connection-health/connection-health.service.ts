import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectionHealthEvent,
  ConnectionHealthEventType,
  ConnectionHealthSeverity,
  Integration,
  Prisma,
} from '@prisma/client';
import { createHash, createHmac } from 'crypto';
import { ConnectionHealthRepository } from './connection-health.repository';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  CONNECTION_DEAD_STALE_DAYS,
  CONNECTION_STALE_WARNING_DAYS,
  tokenDaysRemaining,
  tokenWarningThreshold,
} from '@gitroom/nestjs-libraries/reliability/connection.health.policy';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';
import {
  PlatformTruthSnapshot,
  platformTruthEventKind,
} from '@gitroom/nestjs-libraries/reliability/platform.truth';

const WEBHOOK_TYPE: Record<ConnectionHealthEventType, string> = {
  TOKEN_EXPIRING: 'token.expiring',
  TOKEN_EXPIRED: 'token.expired',
  TOKEN_REFRESHED: 'token.refreshed',
  CONNECTION_AT_RISK: 'connection.at_risk',
  CONNECTION_RECONNECT_REQUIRED: 'connection.reconnect_required',
  CONNECTION_STALE: 'connection.stale',
  CONNECTION_DEAD: 'connection.dead',
  CONNECTION_RECOVERED: 'connection.recovered',
  PLATFORM_READY: 'platform.ready',
  PLATFORM_LIMITATION: 'platform.limitation',
  PLATFORM_INVALID: 'platform.invalid',
  PLATFORM_TRUTH_UNKNOWN: 'platform.truth_unknown',
};

function nonEmptyReason(reason: unknown, fallback: string) {
  return typeof reason === 'string' && reason.trim()
    ? reason.replace(/\s+/g, ' ').trim().slice(0, 2_000)
    : fallback;
}

@Injectable()
export class ConnectionHealthService {
  private readonly logger = new Logger(ConnectionHealthService.name);

  constructor(
    private _repository: ConnectionHealthRepository,
    private _webhooks: WebhooksService
  ) {}

  async evaluateAll(now = new Date()) {
    const connections = await this._repository.listActive();
    const failures: string[] = [];
    for (const connection of connections) {
      try {
        await this.evaluateConnection(connection, now);
      } catch (error) {
        const reason = normalizePostFailure({ error }).reason;
        failures.push(`${connection.id}: ${reason}`);
        this.logger.error({
          event: 'connection.health_evaluation_failed',
          organizationId: connection.organizationId,
          integrationId: connection.id,
          reason,
        });
      }
    }
    if (failures.length) {
      throw new Error(
        `Connection health evaluation failed for ${
          failures.length
        } connection(s): ${failures.join('; ')}`
      );
    }
    return { evaluated: connections.length };
  }

  async evaluateConnection(connection: Integration, now = new Date()) {
    if (connection.disabled) {
      await this.updateProjection(connection, {
        connectionHealthState: 'DISABLED',
        connectionHealthReason: 'This connection is disabled.',
        connectionHealthChangedAt:
          connection.connectionHealthState === 'DISABLED'
            ? connection.connectionHealthChangedAt
            : now,
        tokenHealthCheckedAt: now,
      });
      return;
    }

    if (connection.refreshNeeded) {
      const reason = 'Reconnect this account before publishing.';
      await this.emit({
        id: `connection.health:${connection.id}:reconnect:${
          connection.tokenIssuedAt?.toISOString() ||
          connection.createdAt.toISOString()
        }`,
        organizationId: connection.organizationId,
        integrationId: connection.id,
        type: 'CONNECTION_RECONNECT_REQUIRED',
        severity: 'CRITICAL',
        code: 'reconnect_required',
        reason,
        projection: {
          tokenHealthState: 'RECONNECT_REQUIRED',
          tokenHealthReason: reason,
          tokenHealthCheckedAt: now,
          tokenHealthChangedAt: now,
          connectionHealthState: 'RECONNECT_REQUIRED',
          connectionHealthReason: reason,
          connectionHealthChangedAt: now,
        },
        occurredAt: now,
      });
      return;
    }

    const daysRemaining = tokenDaysRemaining(connection.tokenExpiration, now);
    if (daysRemaining !== null && daysRemaining <= 0) {
      const reason = `The ${connection.providerIdentifier} token expired ${
        daysRemaining === 0 ? 'today' : `${Math.abs(daysRemaining)} day(s) ago`
      }.`;
      await this.emit({
        id: `connection.health:${
          connection.id
        }:token-expired:${connection.tokenExpiration!.toISOString()}`,
        organizationId: connection.organizationId,
        integrationId: connection.id,
        type: 'TOKEN_EXPIRED',
        severity: 'CRITICAL',
        code: 'token_expired',
        reason,
        daysRemaining,
        projection: {
          tokenHealthState: 'EXPIRED',
          tokenHealthReason: reason,
          tokenHealthCheckedAt: now,
          tokenHealthChangedAt: now,
          tokenWarningDays: 0,
        },
        occurredAt: now,
      });
    } else {
      const warning = tokenWarningThreshold(daysRemaining);
      if (warning !== null) {
        const reason = `The ${connection.providerIdentifier} token expires in ${daysRemaining} day(s). Reconnect or refresh it before expiry.`;
        const crossedThreshold =
          connection.tokenWarningDays === null ||
          connection.tokenWarningDays === undefined ||
          warning < connection.tokenWarningDays;
        if (crossedThreshold) {
          await this.emit({
            id: `connection.health:${
              connection.id
            }:token-expiring:${connection.tokenExpiration!.toISOString()}:${warning}`,
            organizationId: connection.organizationId,
            integrationId: connection.id,
            type: 'TOKEN_EXPIRING',
            severity: 'WARNING',
            code: 'token_expiring',
            reason,
            daysRemaining,
            projection: {
              tokenHealthState: 'EXPIRING',
              tokenHealthReason: reason,
              tokenHealthCheckedAt: now,
              tokenHealthChangedAt:
                connection.tokenHealthState === 'EXPIRING'
                  ? connection.tokenHealthChangedAt
                  : now,
              tokenWarningDays: warning,
            },
            occurredAt: now,
          });
        } else {
          await this.updateProjection(connection, {
            tokenHealthState: 'EXPIRING',
            tokenHealthReason: reason,
            tokenHealthCheckedAt: now,
            ...(connection.tokenHealthState !== 'EXPIRING'
              ? { tokenHealthChangedAt: now }
              : {}),
          });
        }
      } else {
        const state = daysRemaining === null ? 'UNKNOWN' : 'HEALTHY';
        const reason =
          daysRemaining === null
            ? 'The platform did not provide a token expiry.'
            : `The token is within its expected lifetime (${daysRemaining} day(s) remaining).`;
        await this.updateProjection(connection, {
          tokenHealthState: state,
          tokenHealthReason: reason,
          tokenHealthCheckedAt: now,
          ...(connection.tokenHealthState !== state
            ? { tokenHealthChangedAt: now }
            : {}),
        });
      }
    }

    if (
      connection.connectionHealthState === 'RECONNECT_REQUIRED' ||
      (connection.connectionHealthState === 'DEAD' &&
        connection.consecutiveErrors >= 3)
    ) {
      return;
    }

    const lastContact =
      connection.lastProviderContactAt || connection.createdAt;
    const staleDays = Math.floor(
      (now.getTime() - lastContact.getTime()) / 86_400_000
    );
    if (staleDays >= CONNECTION_DEAD_STALE_DAYS) {
      const reason = `No provider contact has succeeded for ${staleDays} days. This connection is considered dead until it is reconnected or confirms a live post.`;
      await this.emit({
        id: `connection.health:${
          connection.id
        }:dead-stale:${lastContact.toISOString()}`,
        organizationId: connection.organizationId,
        integrationId: connection.id,
        type: 'CONNECTION_DEAD',
        severity: 'CRITICAL',
        code: 'connection_stale_dead',
        reason,
        projection: {
          connectionHealthState: 'DEAD',
          connectionHealthReason: reason,
          connectionHealthChangedAt: now,
          staleSince: connection.staleSince || now,
          deadAccountAt: connection.deadAccountAt || now,
        },
        occurredAt: now,
      });
    } else if (
      staleDays >= CONNECTION_STALE_WARNING_DAYS &&
      connection.connectionHealthState === 'HEALTHY'
    ) {
      const reason = `No provider contact has succeeded for ${staleDays} days. Publishly marked this connection stale.`;
      await this.emit({
        id: `connection.health:${
          connection.id
        }:stale:${lastContact.toISOString()}`,
        organizationId: connection.organizationId,
        integrationId: connection.id,
        type: 'CONNECTION_STALE',
        severity: 'WARNING',
        code: 'connection_stale',
        reason,
        projection: {
          connectionHealthState: 'AT_RISK',
          connectionHealthReason: reason,
          connectionHealthChangedAt: now,
          staleSince: connection.staleSince || now,
        },
        occurredAt: now,
      });
    }
  }

  async recordPlatformTruth(
    connection: Integration,
    snapshot: PlatformTruthSnapshot
  ) {
    const current =
      (await this._repository.get(connection.organizationId, connection.id)) ||
      connection;
    const metadata = snapshot.metadata || {};
    const changed =
      current.platformTruthState !== snapshot.state ||
      current.platformPublishingMode !== snapshot.publishingMode ||
      current.platformAuditState !== snapshot.auditState ||
      current.platformTruthCode !== snapshot.code ||
      current.platformTruthReason !== snapshot.reason ||
      current.platformAccountType !== (snapshot.accountType || null) ||
      current.platformLinkedResourceId !==
        (snapshot.linkedResourceId || null) ||
      JSON.stringify(current.platformTruthMetadata || {}) !==
        JSON.stringify(metadata);
    const projection: Prisma.IntegrationUncheckedUpdateInput = {
      platformTruthState: snapshot.state,
      platformPublishingMode: snapshot.publishingMode,
      platformAuditState: snapshot.auditState,
      platformTruthCode: snapshot.code,
      platformTruthReason: snapshot.reason,
      platformTruthCheckedAt: snapshot.checkedAt,
      ...(changed ? { platformTruthChangedAt: snapshot.checkedAt } : {}),
      platformAccountType: snapshot.accountType || null,
      platformLinkedResourceId: snapshot.linkedResourceId || null,
      platformTruthMetadata: metadata as Prisma.InputJsonValue,
    };

    if (!changed) {
      await this.updateProjection(current, projection);
      return { changed: false, event: null, snapshot };
    }

    const eventKind = platformTruthEventKind(snapshot.state);
    if (!eventKind) {
      await this.updateProjection(current, projection);
      return { changed: true, event: null, snapshot };
    }
    const transition = createHash('sha256')
      .update(
        JSON.stringify({
          fromState: current.platformTruthState,
          fromCode: current.platformTruthCode,
          fromChangedAt:
            current.platformTruthChangedAt?.toISOString?.() ||
            current.tokenIssuedAt?.toISOString?.() ||
            current.createdAt.toISOString(),
          toState: snapshot.state,
          toCode: snapshot.code,
        })
      )
      .digest('hex')
      .slice(0, 24);
    const event = await this.emit({
      id: `connection.health:${current.id}:platform:${transition}`,
      organizationId: current.organizationId,
      integrationId: current.id,
      type: eventKind.type,
      severity: eventKind.severity,
      code: snapshot.code,
      reason: snapshot.reason,
      projection,
      occurredAt: snapshot.checkedAt,
    });
    return { changed: true, event, snapshot };
  }

  async recordPublishingFailure(event: {
    organizationId: string;
    integrationId: string;
    id: string;
    failureCode: string;
    reason: string;
    occurredAt: Date;
  }) {
    const result = await this._repository.applyPublishingFailure({
      organizationId: event.organizationId,
      integrationId: event.integrationId,
      code: event.failureCode,
      reason: nonEmptyReason(
        event.reason,
        'The provider returned a connection-level publishing failure.'
      ),
      sourceEventId: event.id,
      occurredAt: event.occurredAt,
    });
    if (result.event) await this.dispatchIfNeeded(result.event);
    return result.integration;
  }

  async recordPublishingReceipt(event: {
    organizationId: string;
    integrationId: string;
    id: string;
    stage: string;
    occurredAt: Date;
  }) {
    if (event.stage !== 'sent' && event.stage !== 'confirmed_live') return;
    const result = await this._repository.applyPublishingReceipt({
      organizationId: event.organizationId,
      integrationId: event.integrationId,
      stage: event.stage,
      sourceEventId: event.id,
      occurredAt: event.occurredAt,
    });
    if (result.event) await this.dispatchIfNeeded(result.event);
    return result.integration;
  }

  async recordTokenInvalidation(
    connection: Integration,
    error: unknown,
    occurredAt = new Date()
  ) {
    const failure = normalizePostFailure({
      error,
      code: 'reconnect_required',
      willRetry: false,
    });
    const reason = nonEmptyReason(failure.reason, 'Reconnect this account.');
    return this.emit({
      id: `connection.health:${connection.id}:token-invalid:${
        connection.tokenIssuedAt?.toISOString() ||
        connection.createdAt.toISOString()
      }`,
      organizationId: connection.organizationId,
      integrationId: connection.id,
      type: 'CONNECTION_RECONNECT_REQUIRED',
      severity: 'CRITICAL',
      code: 'reconnect_required',
      reason,
      projection: {
        refreshNeeded: true,
        tokenHealthState: 'RECONNECT_REQUIRED',
        tokenHealthReason: reason,
        tokenHealthCheckedAt: occurredAt,
        tokenHealthChangedAt: occurredAt,
        connectionHealthState: 'RECONNECT_REQUIRED',
        connectionHealthReason: reason,
        connectionHealthChangedAt: occurredAt,
        lastConnectionErrorCode: 'reconnect_required',
        lastConnectionErrorReason: reason,
        lastFailedPublishAt: occurredAt,
        consecutiveErrors: { increment: 1 },
      },
      occurredAt,
    });
  }

  async recordTokenRefreshed(connection: Integration, occurredAt = new Date()) {
    const current =
      (await this._repository.get(connection.organizationId, connection.id)) ||
      connection;
    const recovered =
      connection.connectionHealthState !== 'HEALTHY' ||
      connection.consecutiveErrors > 0 ||
      !!connection.staleSince ||
      !!connection.deadAccountAt;
    const refreshed = await this.emit({
      id: `connection.health:${current.id}:token-refreshed:${
        current.tokenIssuedAt?.toISOString() || occurredAt.toISOString()
      }`,
      organizationId: current.organizationId,
      integrationId: current.id,
      type: 'TOKEN_REFRESHED',
      severity: 'INFO',
      code: 'token_refreshed',
      reason: 'The provider token refreshed successfully.',
      projection: {
        refreshNeeded: false,
        tokenHealthState: current.tokenExpiration ? 'HEALTHY' : 'UNKNOWN',
        tokenHealthReason: current.tokenExpiration
          ? 'The provider token refreshed successfully.'
          : 'The refreshed token has no provider-supplied expiry.',
        tokenHealthCheckedAt: occurredAt,
        tokenHealthChangedAt: occurredAt,
        tokenWarningDays: null,
        lastProviderContactAt: occurredAt,
        connectionHealthState: current.disabled ? 'DISABLED' : 'HEALTHY',
        connectionHealthReason: current.disabled
          ? 'This connection is disabled.'
          : 'The provider token refreshed successfully.',
        connectionHealthChangedAt: occurredAt,
        consecutiveErrors: 0,
        lastConnectionErrorCode: null,
        lastConnectionErrorReason: null,
        staleSince: null,
        deadAccountAt: null,
      },
      occurredAt,
    });
    if (recovered && !current.disabled) {
      await this.emit({
        id: `connection.health:${current.id}:recovered:token:${
          current.tokenIssuedAt?.toISOString() || occurredAt.toISOString()
        }`,
        organizationId: current.organizationId,
        integrationId: current.id,
        type: 'CONNECTION_RECOVERED',
        severity: 'RECOVERY',
        code: 'token_refreshed',
        reason: 'A successful token refresh restored this connection.',
        occurredAt,
      });
    }
    return refreshed;
  }

  listEvents(organizationId: string, integrationId?: string) {
    return this._repository.listEvents(organizationId, integrationId);
  }

  private async updateProjection(
    connection: Integration,
    projection: Prisma.IntegrationUncheckedUpdateInput
  ) {
    const updated = await this._repository.updateProjection(
      connection.organizationId,
      connection.id,
      projection
    );
    if (updated.count !== 1) {
      throw new Error(
        `Connection ${connection.id} disappeared while updating its health projection`
      );
    }
  }

  private async emit(
    input: Parameters<ConnectionHealthRepository['recordEvent']>[0]
  ) {
    const event = await this._repository.recordEvent({
      ...input,
      code: nonEmptyReason(input.code, 'connection_health_changed'),
      reason: nonEmptyReason(
        input.reason,
        'The connection health state changed.'
      ),
    });
    await this.dispatchIfNeeded(event);
    return event;
  }

  private async dispatchIfNeeded(event: ConnectionHealthEvent) {
    if (
      event.webhookState === 'DELIVERED' ||
      event.webhookState === 'NOT_CONFIGURED'
    ) {
      return;
    }
    let hooks: Awaited<ReturnType<WebhooksService['getWebhooksForDelivery']>>;
    try {
      hooks = (
        await this._webhooks.getWebhooksForDelivery(event.organizationId)
      ).filter(
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
    if (!hooks.length) {
      await this._repository.markWebhookState(event.id, 'NOT_CONFIGURED');
      return;
    }

    const eventType = WEBHOOK_TYPE[event.type];
    const body = JSON.stringify({
      specversion: '1.0',
      id: event.id,
      type: eventType,
      time: event.occurredAt.toISOString(),
      data: {
        integrationId: event.integrationId,
        provider: event.provider,
        severity: event.severity.toLowerCase(),
        code: event.code,
        reason: event.reason,
        daysRemaining: event.daysRemaining,
        consecutiveErrors: event.consecutiveErrors,
        ...(event.type.startsWith('PLATFORM_')
          ? {
              platformTruthState:
                event.type === 'PLATFORM_READY'
                  ? 'READY'
                  : event.type === 'PLATFORM_LIMITATION'
                  ? 'LIMITED'
                  : event.type === 'PLATFORM_INVALID'
                  ? 'INVALID'
                  : 'UNKNOWN',
            }
          : {}),
      },
    });
    const delivered = await Promise.all(
      hooks.map((hook) => this.deliver(event, eventType, hook, body))
    );
    await this._repository.markWebhookState(
      event.id,
      delivered.every(Boolean) ? 'DELIVERED' : 'FAILED'
    );
  }

  private async deliver(
    event: ConnectionHealthEvent,
    eventType: string,
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
            'X-Publishly-Event': eventType,
            'X-Publishly-Event-Id': event.id,
            'X-Publishly-Timestamp': timestamp,
            'X-Publishly-Signature': `t=${timestamp},v1=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
          // @ts-ignore undici dispatcher
          dispatcher: getSsrfSafeDispatcher(),
        });
        await this.recordDelivery({
          organizationId: event.organizationId,
          webhookId: hook.id,
          eventId: event.id,
          eventType,
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
          eventType,
          attempt,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          error:
            error instanceof Error
              ? error.message
              : 'The webhook receiver could not be reached.',
        });
      }
      if (attempt < 3) await this.sleep(attempt === 1 ? 1_000 : 5_000);
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
        event: 'connection.health_webhook_attempt_write_failed',
        healthEventId: input.eventId,
        webhookId: input.webhookId,
        attempt: input.attempt,
        reason: normalizePostFailure({ error }).reason,
      });
    }
  }

  private async markDispatchFailure(eventId: string, error: unknown) {
    this.logger.error({
      event: 'connection.health_webhook_dispatch_failed',
      healthEventId: eventId,
      reason: normalizePostFailure({ error }).reason,
    });
    await this._repository.markWebhookState(eventId, 'FAILED');
  }

  private sleep(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
