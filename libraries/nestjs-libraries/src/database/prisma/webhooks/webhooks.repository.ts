import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { WebhooksDto } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { open, seal } from '@gitroom/helpers/auth/crypto.v2';

@Injectable()
export class WebhooksRepository {
  constructor(
    private _webhooks: PrismaRepository<'webhooks' | 'webhookDeliveryAttempt'>
  ) {}

  getTotal(orgId: string) {
    return this._webhooks.model.webhooks.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
    });
  }

  getWebhooks(orgId: string) {
    return this._webhooks.model.webhooks.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        url: true,
        createdAt: true,
        updatedAt: true,
        integrations: {
          select: {
            integration: {
              select: {
                id: true,
                picture: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async getWebhooksForDelivery(orgId: string) {
    const hooks = await this._webhooks.model.webhooks.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        url: true,
        signingSecret: true,
        integrations: {
          select: {
            integration: {
              select: { id: true, picture: true, name: true },
            },
          },
        },
      },
    });

    return Promise.all(
      hooks.map(async (hook) => {
        if (hook.signingSecret) {
          return { ...hook, signingSecret: open(hook.signingSecret) };
        }
        const signingSecret = `whsec_${randomBytes(32).toString('base64url')}`;
        const claimed = await this._webhooks.model.webhooks.updateMany({
          where: {
            id: hook.id,
            organizationId: orgId,
            signingSecret: null,
          },
          data: { signingSecret: seal(signingSecret) },
        });

        if (claimed.count === 1) {
          return { ...hook, signingSecret };
        }

        // Another worker won the compare-and-set. Read the persisted secret
        // instead of signing with a value that receivers can never verify.
        const persisted = await this._webhooks.model.webhooks.findFirst({
          where: {
            id: hook.id,
            organizationId: orgId,
            deletedAt: null,
          },
          select: { signingSecret: true },
        });
        if (!persisted?.signingSecret) {
          throw new Error('Webhook signing secret could not be initialized');
        }
        return { ...hook, signingSecret: open(persisted.signingSecret) };
      })
    );
  }

  recordDelivery(input: {
    organizationId: string;
    webhookId: string;
    eventId: string;
    eventType: string;
    attempt: number;
    status: 'DELIVERED' | 'FAILED';
    statusCode?: number;
    durationMs?: number;
    error?: string;
  }) {
    return this._webhooks.model.webhookDeliveryAttempt.upsert({
      where: {
        webhookId_eventId_attempt: {
          webhookId: input.webhookId,
          eventId: input.eventId,
          attempt: input.attempt,
        },
      },
      create: {
        ...input,
        error: input.error?.slice(0, 1000),
        deliveredAt: input.status === 'DELIVERED' ? new Date() : null,
      },
      update: {
        status: input.status,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        error: input.error?.slice(0, 1000),
        deliveredAt: input.status === 'DELIVERED' ? new Date() : null,
      },
    });
  }

  async rotateSigningSecret(orgId: string, id: string) {
    const signingSecret = `whsec_${randomBytes(32).toString('base64url')}`;
    const updated = await this._webhooks.model.webhooks.updateMany({
      where: { id, organizationId: orgId, deletedAt: null },
      data: { signingSecret: seal(signingSecret) },
    });
    return updated.count ? { signingSecret } : null;
  }

  async deleteWebhook(orgId: string, id: string) {
    const deleted = await this._webhooks.model.webhooks.updateMany({
      where: {
        id,
        organizationId: orgId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
    return deleted.count > 0;
  }

  async createWebhook(orgId: string, body: WebhooksDto) {
    const isNew = !body.id;
    const signingSecret = isNew
      ? `whsec_${randomBytes(32).toString('base64url')}`
      : undefined;
    const { id } = await this._webhooks.model.webhooks.upsert({
      where: {
        id: body.id || uuidv4(),
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        url: body.url,
        name: body.name,
        signingSecret: seal(
          signingSecret || `whsec_${randomBytes(32).toString('base64url')}`
        ),
      },
      update: {
        url: body.url,
        name: body.name,
      },
    });

    await this._webhooks.model.webhooks.update({
      where: {
        id,
        organizationId: orgId,
      },
      data: {
        integrations: {
          deleteMany: {},
          create: body.integrations.map((integration) => ({
            integrationId: integration.id,
          })),
        },
      },
    });

    return { id, ...(signingSecret ? { signingSecret } : {}) };
  }
}
