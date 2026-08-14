import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { cancelCalendarReservationsInTransaction } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.mutation';

type MetaSignedPayload = {
  algorithm?: string;
  user_id?: string | number;
};

type AppSecretConfig = {
  secret: string;
  providers: string[];
};

@Injectable()
export class MetaDataDeletionService {
  constructor(private readonly _prisma: PrismaService) {}

  async requestDeletion(signedRequest: string) {
    const { payload, providers } = this.verifySignedRequest(signedRequest);
    const userId = String(payload.user_id);
    const requestHash = createHash('sha256')
      .update(signedRequest)
      .digest('hex');
    const privacyKey =
      process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || '';
    if (!privacyKey) {
      throw new ServiceUnavailableException('Data deletion is not configured');
    }

    // Deterministic for idempotent webhook replays, but unguessable without
    // the deployment's encryption key.
    const confirmationCode = createHmac('sha256', privacyKey)
      .update(`meta-data-deletion:${requestHash}`)
      .digest('base64url')
      .slice(0, 32);
    const subjectHash = createHmac('sha256', privacyKey)
      .update(`meta-subject:${providers.join(',')}:${userId}`)
      .digest('hex');
    const now = new Date();

    const result = await this._prisma.$transaction(async (tx) => {
      const existing = await tx.metaDataDeletionRequest.findUnique({
        where: { requestHash },
      });
      if (existing) return existing;

      const connections = await tx.integration.findMany({
        where: {
          providerIdentifier: { in: providers },
          deletedAt: null,
          OR: [{ internalId: userId }, { rootInternalId: userId }],
        },
        select: { id: true, organizationId: true },
      });
      const integrationIds = connections.map(({ id }) => id);
      const organizationIds = [
        ...new Set(connections.map(({ organizationId }) => organizationId)),
      ];

      if (integrationIds.length) {
        const posts = await tx.post.findMany({
          where: { integrationId: { in: integrationIds } },
          select: { id: true, organizationId: true },
        });
        const postIds = posts.map(({ id }) => id);

        for (const organizationId of organizationIds.sort()) {
          await cancelCalendarReservationsInTransaction(tx, {
            organizationId,
            integrationIds: connections
              .filter(
                (connection) => connection.organizationId === organizationId
              )
              .map((connection) => connection.id),
            action: 'calendar.writer.meta_erasure',
            subject: `${organizationId}:${subjectHash.slice(0, 16)}`,
            code: 'calendar_meta_erasure_requested',
            reason:
              'A verified Meta erasure request cancelled pending calendar work for the affected connection.',
            actor: { actorType: 'system' },
            now,
          });
        }

        await tx.inboxState.deleteMany({
          where: { integrationId: { in: integrationIds } },
        });
        await tx.analyticsSnapshot.deleteMany({
          where: { integrationId: { in: integrationIds } },
        });
        await tx.integrationsWebhooks.deleteMany({
          where: { integrationId: { in: integrationIds } },
        });

        if (postIds.length) {
          await tx.comments.deleteMany({ where: { postId: { in: postIds } } });
          await tx.errors.deleteMany({ where: { postId: { in: postIds } } });
          await tx.publishingJob.updateMany({
            where: { postId: { in: postIds }, state: { not: 'PUBLISHED' } },
            data: {
              state: 'CANCELLED',
              completedAt: now,
              nextAttemptAt: null,
              lastError: null,
              failureCategory: null,
              providerPostId: null,
              providerUrl: null,
            },
          });
          await tx.post.updateMany({
            where: { id: { in: postIds } },
            data: {
              content: '',
              title: null,
              description: null,
              settings: null,
              image: null,
              releaseId: null,
              releaseURL: null,
              error: null,
              deletedAt: now,
            },
          });
        }

        await Promise.all(
          connections.map(({ id }) =>
            tx.integration.update({
              where: { id },
              data: {
                internalId: `deleted_meta_${id}`,
                rootInternalId: null,
                token: '',
                refreshToken: '',
                tokenExpiration: null,
                customInstanceDetails: null,
                additionalSettings: '[]',
                profile: null,
                picture: null,
                name: 'Deleted Meta connection',
                disabled: true,
                refreshNeeded: false,
                deletedAt: now,
              },
            })
          )
        );

        await tx.auditLog.createMany({
          data: organizationIds.map((organizationId) => ({
            organizationId,
            actorType: 'system',
            action: 'meta.data-deletion-completed',
            targetType: 'integration',
            metadata: JSON.stringify({
              providerCount: providers.length,
              connectionCount: connections.filter(
                (connection) => connection.organizationId === organizationId
              ).length,
              confirmationCode,
            }),
          })),
        });
      }

      return tx.metaDataDeletionRequest.upsert({
        where: { requestHash },
        create: {
          requestHash,
          confirmationCode,
          subjectHash,
          providers: JSON.stringify(providers),
          status: 'COMPLETED',
          connectionsDeleted: connections.length,
          completedAt: now,
        },
        update: {},
      });
    });

    const frontend =
      process.env.FRONTEND_URL ||
      process.env.MAIN_URL ||
      'http://localhost:4200';
    return {
      url: `${frontend.replace(
        /\/$/,
        ''
      )}/data-deletion?code=${encodeURIComponent(result.confirmationCode)}`,
      confirmation_code: result.confirmationCode,
    };
  }

  async getStatus(confirmationCode: string) {
    if (!/^[A-Za-z0-9_-]{32}$/.test(confirmationCode || '')) return null;
    const result = await this._prisma.metaDataDeletionRequest.findUnique({
      where: { confirmationCode },
      select: {
        confirmationCode: true,
        status: true,
        connectionsDeleted: true,
        createdAt: true,
        completedAt: true,
      },
    });
    return result
      ? {
          confirmationCode: result.confirmationCode,
          status: result.status.toLowerCase(),
          connectionsDeleted: result.connectionsDeleted,
          requestedAt: result.createdAt,
          completedAt: result.completedAt,
        }
      : null;
  }

  private verifySignedRequest(signedRequest: string): {
    payload: MetaSignedPayload;
    providers: string[];
  } {
    if (!signedRequest || signedRequest.length > 16_384) {
      throw new BadRequestException('Invalid signed request');
    }
    const parts = signedRequest.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new BadRequestException('Invalid signed request');
    }

    let payload: MetaSignedPayload;
    let signature: Buffer;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      signature = Buffer.from(parts[0], 'base64url');
    } catch {
      throw new BadRequestException('Invalid signed request');
    }
    if (
      payload.algorithm?.toUpperCase() !== 'HMAC-SHA256' ||
      payload.user_id === undefined ||
      payload.user_id === null
    ) {
      throw new BadRequestException('Invalid signed request');
    }

    const matchedProviders = this.appSecrets()
      .filter(({ secret }) => {
        const expected = createHmac('sha256', secret).update(parts[1]).digest();
        return (
          signature.length === expected.length &&
          timingSafeEqual(signature, expected)
        );
      })
      .flatMap(({ providers }) => providers);

    if (!matchedProviders.length) {
      throw new BadRequestException('Invalid signed request');
    }
    return {
      payload,
      providers: [...new Set(matchedProviders)].sort(),
    };
  }

  private appSecrets(): AppSecretConfig[] {
    const configs = [
      {
        secret: process.env.FACEBOOK_APP_SECRET || '',
        providers: ['facebook', 'instagram'],
      },
      {
        secret: process.env.INSTAGRAM_APP_SECRET || '',
        providers: ['instagram-standalone'],
      },
      {
        secret: process.env.THREADS_APP_SECRET || '',
        providers: ['threads'],
      },
    ].filter(({ secret }) => !!secret);
    if (!configs.length) {
      throw new ServiceUnavailableException(
        'Meta data deletion is not configured'
      );
    }
    return configs;
  }
}
