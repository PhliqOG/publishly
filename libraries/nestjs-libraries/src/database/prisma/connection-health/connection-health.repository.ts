import { Injectable } from '@nestjs/common';
import {
  ConnectionHealthEventType,
  ConnectionHealthSeverity,
  ConnectionHealthState,
  Prisma,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  CONNECTION_DEAD_ERROR_THRESHOLD,
  CONNECTION_LEVEL_FAILURE_CODES,
  IMMEDIATE_RECONNECT_FAILURE_CODES,
  PROVIDER_CONTACT_FAILURE_CODES,
} from '@gitroom/nestjs-libraries/reliability/connection.health.policy';

export type RecordConnectionHealthEventInput = {
  id: string;
  organizationId: string;
  integrationId: string;
  type: ConnectionHealthEventType;
  severity: ConnectionHealthSeverity;
  code: string;
  reason: string;
  daysRemaining?: number | null;
  consecutiveErrors?: number | null;
  sourceEventId?: string | null;
  projection?: Prisma.IntegrationUncheckedUpdateInput;
  occurredAt?: Date;
};

@Injectable()
export class ConnectionHealthRepository {
  constructor(
    private _db: PrismaRepository<'integration' | 'connectionHealthEvent'>,
    private _transaction: PrismaTransaction
  ) {}

  get(organizationId: string, integrationId: string) {
    return this._db.model.integration.findFirst({
      where: { id: integrationId, organizationId, deletedAt: null },
    });
  }

  listActive() {
    return this._db.model.integration.findMany({
      where: { deletedAt: null, type: 'social' },
      orderBy: [{ organizationId: 'asc' }, { id: 'asc' }],
    });
  }

  async recordEvent(input: RecordConnectionHealthEventInput) {
    return this._transaction.model.$transaction(async (tx) => {
      const integration = await tx.integration.findFirst({
        where: {
          id: input.integrationId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true, providerIdentifier: true, name: true },
      });
      if (!integration) {
        throw new Error(
          `Connection ${input.integrationId} was not found while recording health event ${input.type}`
        );
      }
      const event = await tx.connectionHealthEvent.upsert({
        where: { id: input.id },
        create: {
          id: input.id,
          organizationId: input.organizationId,
          integrationId: input.integrationId,
          provider: integration.providerIdentifier,
          type: input.type,
          severity: input.severity,
          code: input.code,
          reason: input.reason,
          daysRemaining: input.daysRemaining,
          consecutiveErrors: input.consecutiveErrors,
          sourceEventId: input.sourceEventId,
          occurredAt: input.occurredAt,
        },
        update: {},
      });
      if (input.projection) {
        await tx.integration.update({
          where: { id: integration.id },
          data: input.projection,
        });
      }
      return { ...event, connectionName: integration.name };
    });
  }

  updateProjection(
    organizationId: string,
    integrationId: string,
    projection: Prisma.IntegrationUncheckedUpdateInput
  ) {
    return this._db.model.integration.updateMany({
      where: { id: integrationId, organizationId, deletedAt: null },
      data: projection,
    });
  }

  async applyPublishingFailure(input: {
    organizationId: string;
    integrationId: string;
    code: string;
    reason: string;
    sourceEventId: string;
    occurredAt?: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const now = input.occurredAt ?? new Date();
      const current = await tx.integration.findFirst({
        where: {
          id: input.integrationId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
      });
      if (!current) {
        throw new Error(
          `Connection ${input.integrationId} was not found while applying publishing failure ${input.sourceEventId}`
        );
      }

      const connectionLevel = CONNECTION_LEVEL_FAILURE_CODES.has(input.code);
      const immediateReconnect = IMMEDIATE_RECONNECT_FAILURE_CODES.has(
        input.code
      );
      const contact = PROVIDER_CONTACT_FAILURE_CODES.has(input.code);
      const consecutiveErrors = connectionLevel
        ? current.consecutiveErrors + 1
        : current.consecutiveErrors;
      let nextState: ConnectionHealthState = current.disabled
        ? 'DISABLED'
        : current.connectionHealthState;
      let eventType: ConnectionHealthEventType | undefined;
      let severity: ConnectionHealthSeverity | undefined;

      if (!current.disabled && immediateReconnect) {
        nextState = 'RECONNECT_REQUIRED';
        if (current.connectionHealthState !== nextState) {
          eventType = 'CONNECTION_RECONNECT_REQUIRED';
          severity = 'CRITICAL';
        }
      } else if (
        !current.disabled &&
        current.connectionHealthState !== 'RECONNECT_REQUIRED' &&
        connectionLevel &&
        consecutiveErrors >= CONNECTION_DEAD_ERROR_THRESHOLD
      ) {
        nextState = 'DEAD';
        if (current.connectionHealthState !== 'DEAD') {
          eventType = 'CONNECTION_DEAD';
          severity = 'CRITICAL';
        }
      } else if (
        !current.disabled &&
        current.connectionHealthState !== 'RECONNECT_REQUIRED' &&
        current.connectionHealthState !== 'DEAD' &&
        connectionLevel
      ) {
        nextState = 'AT_RISK';
        if (current.connectionHealthState === 'HEALTHY') {
          eventType = 'CONNECTION_AT_RISK';
          severity = 'WARNING';
        }
      }

      const updated = await tx.integration.update({
        where: { id: current.id },
        data: {
          lastFailedPublishAt: now,
          ...(contact ? { lastProviderContactAt: now } : {}),
          ...(connectionLevel
            ? {
                consecutiveErrors,
                lastConnectionErrorCode: input.code,
                lastConnectionErrorReason: input.reason,
                connectionHealthState: nextState,
                connectionHealthReason: input.reason,
                ...(nextState !== current.connectionHealthState
                  ? { connectionHealthChangedAt: now }
                  : {}),
                ...(nextState === 'DEAD' && !current.deadAccountAt
                  ? { deadAccountAt: now }
                  : {}),
              }
            : {}),
        },
      });

      let event = null;
      if (eventType && severity) {
        event = await tx.connectionHealthEvent.upsert({
          where: {
            id: `connection.health:${current.id}:${eventType.toLowerCase()}:${
              input.sourceEventId
            }`,
          },
          create: {
            id: `connection.health:${current.id}:${eventType.toLowerCase()}:${
              input.sourceEventId
            }`,
            organizationId: input.organizationId,
            integrationId: current.id,
            provider: current.providerIdentifier,
            type: eventType,
            severity,
            code: input.code,
            reason: input.reason,
            consecutiveErrors,
            sourceEventId: input.sourceEventId,
            occurredAt: now,
          },
          update: {},
        });
      }
      return { integration: updated, event };
    });
  }

  async applyPublishingReceipt(input: {
    organizationId: string;
    integrationId: string;
    stage: 'sent' | 'confirmed_live';
    sourceEventId: string;
    occurredAt?: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const now = input.occurredAt ?? new Date();
      const current = await tx.integration.findFirst({
        where: {
          id: input.integrationId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
      });
      if (!current) {
        throw new Error(
          `Connection ${input.integrationId} was not found while applying receipt ${input.sourceEventId}`
        );
      }
      if (input.stage === 'sent') {
        const integration = await tx.integration.update({
          where: { id: current.id },
          data: { lastProviderContactAt: now },
        });
        return { integration, event: null };
      }

      const recovered =
        !current.disabled &&
        (current.connectionHealthState !== 'HEALTHY' ||
          current.consecutiveErrors > 0 ||
          !!current.staleSince ||
          !!current.deadAccountAt);
      const integration = await tx.integration.update({
        where: { id: current.id },
        data: {
          lastProviderContactAt: now,
          lastSuccessfulPublishAt: now,
          consecutiveErrors: 0,
          lastConnectionErrorCode: null,
          lastConnectionErrorReason: null,
          staleSince: null,
          deadAccountAt: null,
          ...(!current.disabled
            ? {
                connectionHealthState: 'HEALTHY',
                connectionHealthReason:
                  'The platform confirmed a live post for this connection.',
                ...(recovered ? { connectionHealthChangedAt: now } : {}),
              }
            : {}),
        },
      });
      const event = recovered
        ? await tx.connectionHealthEvent.upsert({
            where: {
              id: `connection.health:${current.id}:recovered:${input.sourceEventId}`,
            },
            create: {
              id: `connection.health:${current.id}:recovered:${input.sourceEventId}`,
              organizationId: input.organizationId,
              integrationId: current.id,
              provider: current.providerIdentifier,
              type: 'CONNECTION_RECOVERED',
              severity: 'RECOVERY',
              code: 'confirmed_live',
              reason:
                'The platform confirmed a live post and this connection recovered.',
              consecutiveErrors: 0,
              sourceEventId: input.sourceEventId,
              occurredAt: now,
            },
            update: {},
          })
        : null;
      return { integration, event };
    });
  }

  markWebhookState(
    id: string,
    webhookState: 'NOT_CONFIGURED' | 'DELIVERED' | 'FAILED'
  ) {
    return this._db.model.connectionHealthEvent.update({
      where: { id },
      data: { webhookState, webhookFinishedAt: new Date() },
    });
  }

  listEvents(organizationId: string, integrationId?: string) {
    return this._db.model.connectionHealthEvent.findMany({
      where: {
        organizationId,
        ...(integrationId ? { integrationId } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 250,
    });
  }
}
