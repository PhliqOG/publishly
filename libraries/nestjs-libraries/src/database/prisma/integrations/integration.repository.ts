import {
  PrismaRepository,
  PrismaService,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { seal } from '@gitroom/helpers/auth/crypto.v2';
import dayjs from 'dayjs';
import { Integration, Prisma } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import {
  getPublicStorageUrl,
  UploadFactory,
} from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { resolveTokenWindow } from '@gitroom/nestjs-libraries/reliability/connection.health.policy';
import { cancelCalendarReservationsInTransaction } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.mutation';

@Injectable()
export class IntegrationRepository {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _posts: PrismaRepository<'post'>,
    private _plugs: PrismaRepository<'plugs'>,
    private _exisingPlugData: PrismaRepository<'exisingPlugData'>,
    private _customers: PrismaRepository<'customer'>,
    private _mentions: PrismaRepository<'mentions'>,
    private _prisma: PrismaService
  ) {}

  getMentions(platform: string, q: string) {
    return this._mentions.model.mentions.findMany({
      where: {
        platform,
        OR: [
          {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
          {
            username: {
              contains: q,
              mode: 'insensitive',
            },
          },
        ],
      },
      orderBy: {
        name: 'asc',
      },
      take: 100,
      select: {
        name: true,
        username: true,
        image: true,
      },
    });
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    if (mentions.length === 0) {
      return [] as any[];
    }
    return this._mentions.model.mentions.createMany({
      data: mentions.map((mention) => ({
        platform,
        name: mention.name,
        username: mention.username,
        image: mention.image,
      })),
      skipDuplicates: true,
    });
  }

  async checkPreviousConnections(org: string, id: string) {
    const findIt = await this._integration.model.integration.findMany({
      where: {
        rootInternalId: id,
      },
      select: {
        organizationId: true,
        id: true,
      },
    });

    if (findIt.some((f) => f.organizationId === org)) {
      return false;
    }

    return findIt.length > 0;
  }

  updateProviderSettings(org: string, id: string, settings: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        additionalSettings: settings,
      },
    });
  }

  async setTimes(org: string, id: string, times: IntegrationTimeDto) {
    return this._integration.model.integration.update({
      select: {
        id: true,
      },
      where: {
        id,
        organizationId: org,
      },
      data: {
        postingTimes: JSON.stringify(times.time),
      },
    });
  }

  getPlug(plugId: string) {
    return this._plugs.model.plugs.findFirst({
      where: {
        id: plugId,
      },
      include: {
        integration: true,
      },
    });
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._plugs.model.plugs.findMany({
      where: {
        integrationId,
        organizationId: orgId,
        activated: true,
      },
      include: {
        integration: {
          select: {
            id: true,
            providerIdentifier: true,
          },
        },
      },
    });
  }

  async updateIntegration(id: string, params: Partial<Integration>) {
    if (params.token) {
      params.token = seal(params.token);
    }
    if (params.refreshToken) {
      params.refreshToken = seal(params.refreshToken);
    }
    const storageUrl = getPublicStorageUrl();
    const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    if (
      params.picture &&
      (!storageUrl || !params.picture.startsWith(`${storageUrl}/`)) &&
      (!frontendUrl || !params.picture.startsWith(`${frontendUrl}/`))
    ) {
      params.picture = await this.storage.uploadSimple(params.picture);
    }

    const existing = await this._integration.model.integration.findUnique({
      where: {
        organizationId_internalId: {
          organizationId: params.organizationId!,
          internalId: params.internalId,
        },
      },
    });

    if (existing) {
      await this._prisma.$transaction(async (tx) => {
        const now = new Date();
        const posts = await tx.post.findMany({
          where: {
            organizationId: params.organizationId!,
            integrationId: id,
            deletedAt: null,
          },
          select: { id: true },
        });
        await cancelCalendarReservationsInTransaction(tx, {
          organizationId: params.organizationId!,
          integrationIds: [id],
          action: 'calendar.writer.connection_replaced',
          subject: id,
          code: 'calendar_connection_replaced',
          reason:
            'The connection was replaced; its pending calendar work was cancelled.',
          actor: { actorType: 'system' },
          now,
        });
        await tx.post.updateMany({
          where: { id: { in: posts.map((post) => post.id) } },
          data: { deletedAt: now },
        });
        await tx.integration.update({
          where: { id, organizationId: params.organizationId! },
          data: {
            internalId: `deleted_${params.internalId}_${makeId(10)}`,
            deletedAt: now,
          },
        });
      });
    }

    return this._integration.model.integration.update({
      where: {
        ...(existing ? { id: existing.id } : { id }),
      },
      data: {
        ...params,
        disabled: false,
        deletedAt: null,
      },
    });
  }

  disconnectChannel(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        refreshNeeded: true,
        tokenHealthState: 'RECONNECT_REQUIRED',
        tokenHealthReason: 'Reconnect this account before publishing.',
        tokenHealthCheckedAt: new Date(),
        tokenHealthChangedAt: new Date(),
        connectionHealthState: 'RECONNECT_REQUIRED',
        connectionHealthReason: 'Reconnect this account before publishing.',
        connectionHealthChangedAt: new Date(),
      },
    });
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const tokenWindow = resolveTokenWindow({
      providerIdentifier: provider,
      expiresInSeconds: expiresIn,
    });
    const tokenProjection = {
      tokenIssuedAt: tokenWindow.issuedAt,
      tokenExpiration: tokenWindow.expiration,
      tokenLifetimeDays: tokenWindow.lifetimeDays,
      tokenHealthState: tokenWindow.expiration
        ? ('HEALTHY' as const)
        : ('UNKNOWN' as const),
      tokenHealthReason: tokenWindow.expiration
        ? 'A fresh provider token is within its expected lifetime.'
        : 'The platform did not provide a token expiry.',
      tokenHealthCheckedAt: tokenWindow.issuedAt,
      tokenHealthChangedAt: tokenWindow.issuedAt,
      tokenWarningDays: null as number | null,
    } satisfies Pick<
      Prisma.IntegrationUncheckedCreateInput,
      | 'tokenIssuedAt'
      | 'tokenExpiration'
      | 'tokenLifetimeDays'
      | 'tokenHealthState'
      | 'tokenHealthReason'
      | 'tokenHealthCheckedAt'
      | 'tokenHealthChangedAt'
      | 'tokenWarningDays'
    >;
    // At-rest encryption: tokens are sealed before touching the database and
    // opened just-in-time at provider call sites. Legacy plaintext rows keep
    // working (open() passes them through) and re-seal on their next write.
    token = seal(token);
    refreshToken = refreshToken ? seal(refreshToken) : refreshToken;

    const postTimes = timezone
      ? {
          postingTimes: JSON.stringify([
            { time: 560 - timezone },
            { time: 850 - timezone },
            { time: 1140 - timezone },
          ]),
        }
      : {};
    const upsert = await this._integration.model.integration.upsert({
      where: {
        organizationId_internalId: {
          internalId,
          organizationId: org,
        },
      },
      create: {
        type: type as any,
        name,
        providerIdentifier: provider,
        token,
        profile: username,
        ...(picture ? { picture } : {}),
        inBetweenSteps: isBetweenSteps,
        refreshToken,
        ...tokenProjection,
        internalId,
        ...postTimes,
        organizationId: org,
        refreshNeeded: false,
        connectionHealthState: 'HEALTHY',
        connectionHealthReason: 'The account connected successfully.',
        connectionHealthChangedAt: tokenWindow.issuedAt,
        consecutiveErrors: 0,
        lastConnectionErrorCode: null,
        lastConnectionErrorReason: null,
        staleSince: null,
        deadAccountAt: null,
        rootInternalId: internalId,
        ...(customInstanceDetails ? { customInstanceDetails } : {}),
        additionalSettings: additionalSettings
          ? JSON.stringify(additionalSettings)
          : '[]',
      },
      update: {
        ...(additionalSettings
          ? { additionalSettings: JSON.stringify(additionalSettings) }
          : {}),
        ...(customInstanceDetails ? { customInstanceDetails } : {}),
        type: type as any,
        ...(!refresh
          ? {
              inBetweenSteps: isBetweenSteps,
            }
          : {}),
        ...(picture ? { picture } : {}),
        profile: username,
        providerIdentifier: provider,
        token,
        refreshToken,
        ...tokenProjection,
        internalId,
        organizationId: org,
        deletedAt: null,
        refreshNeeded: false,
        connectionHealthState: 'HEALTHY',
        connectionHealthReason: 'The account connected successfully.',
        connectionHealthChangedAt: tokenWindow.issuedAt,
        consecutiveErrors: 0,
        lastConnectionErrorCode: null,
        lastConnectionErrorReason: null,
        staleSince: null,
        deadAccountAt: null,
      },
    });

    if (oneTimeToken) {
      const rootId =
        (
          await this._integration.model.integration.findFirst({
            where: {
              organizationId: org,
              internalId: internalId,
            },
          })
        )?.rootInternalId || internalId;

      await this._integration.model.integration.updateMany({
        where: {
          id: {
            not: upsert.id,
          },
          rootInternalId: rootId,
        },
        data: {
          token,
          refreshToken,
          refreshNeeded: false,
          ...tokenProjection,
          connectionHealthState: 'HEALTHY',
          connectionHealthReason:
            'The shared account token refreshed successfully.',
          connectionHealthChangedAt: tokenWindow.issuedAt,
          consecutiveErrors: 0,
          lastConnectionErrorCode: null,
          lastConnectionErrorReason: null,
          staleSince: null,
          deadAccountAt: null,
        },
      });
    }

    return upsert;
  }

  needsToBeRefreshed() {
    return this._integration.model.integration.findMany({
      where: {
        tokenExpiration: {
          lte: dayjs().add(1, 'day').toDate(),
        },
        inBetweenSteps: false,
        deletedAt: null,
        refreshNeeded: false,
      },
    });
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
      },
      data: {
        inBetweenSteps: true,
      },
    });
  }
  refreshNeeded(org: string, id: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        refreshNeeded: true,
        tokenHealthState: 'RECONNECT_REQUIRED',
        tokenHealthReason: 'Reconnect this account before publishing.',
        tokenHealthCheckedAt: new Date(),
        tokenHealthChangedAt: new Date(),
        connectionHealthState: 'RECONNECT_REQUIRED',
        connectionHealthReason: 'Reconnect this account before publishing.',
        connectionHealthChangedAt: new Date(),
      },
    });
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integration.model.integration.update({
      where: {
        id,
      },
      data: {
        ...(name ? { name } : {}),
        ...(url ? { picture: url } : {}),
      },
    });
  }

  getIntegrationById(org: string, id: string) {
    return this._integration.model.integration.findFirst({
      where: {
        organizationId: org,
        id,
      },
    });
  }

  async getIntegrationForOrder(
    id: string,
    order: string,
    user: string,
    org: string
  ) {
    const integration = await this._posts.model.post.findFirst({
      where: {
        integrationId: id,
        submittedForOrder: {
          id: order,
          messageGroup: {
            OR: [
              { sellerId: user },
              { buyerId: user },
              { buyerOrganizationId: org },
            ],
          },
        },
      },
      select: {
        integration: {
          select: {
            id: true,
            name: true,
            picture: true,
            inBetweenSteps: true,
            providerIdentifier: true,
          },
        },
      },
    });

    return integration?.integration;
  }

  async updateOnCustomerName(org: string, id: string, name: string) {
    const customer = !name
      ? undefined
      : (await this._customers.model.customer.findFirst({
          where: {
            orgId: org,
            name,
          },
        })) ||
        (await this._customers.model.customer.create({
          data: {
            name,
            orgId: org,
          },
        }));

    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: {
        customer: !customer
          ? { disconnect: true }
          : {
              connect: {
                id: customer.id,
              },
            },
      },
    });
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integration.model.integration.update({
      where: {
        id,
        organizationId: org,
      },
      data: !group
        ? {
            customer: {
              disconnect: true,
            },
          }
        : {
            customer: {
              connect: {
                id: group,
              },
            },
          },
    });
  }

  customers(orgId: string) {
    return this._customers.model.customer.findMany({
      where: {
        orgId,
        deletedAt: null,
      },
    });
  }

  getIntegrationsList(org: string) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
      },
      include: {
        customer: true,
      },
    });
  }

  async disableChannel(org: string, id: string) {
    const updated = await this._integration.model.integration.updateMany({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      data: {
        disabled: true,
        connectionHealthState: 'DISABLED',
        connectionHealthReason: 'This connection is disabled.',
        connectionHealthChangedAt: new Date(),
      },
    });
    return updated.count > 0;
  }

  async enableChannel(org: string, id: string) {
    const updated = await this._integration.model.integration.updateMany({
      where: {
        id,
        organizationId: org,
        deletedAt: null,
      },
      data: {
        disabled: false,
      },
    });
    return updated.count > 0;
  }

  getPostsForChannel(org: string, id: string) {
    return this._posts.model.post.groupBy({
      by: ['group'],
      where: {
        organizationId: org,
        integrationId: id,
        deletedAt: null,
      },
    });
  }

  async deleteChannel(org: string, id: string) {
    return this._prisma.$transaction(async (tx) => {
      const integration = await tx.integration.findFirst({
        where: { id, organizationId: org, deletedAt: null },
        select: { id: true },
      });
      if (!integration) return false;

      const posts = await tx.post.findMany({
        where: { integrationId: id },
        select: { id: true },
      });
      const postIds = posts.map(({ id: postId }) => postId);
      const now = new Date();
      await cancelCalendarReservationsInTransaction(tx, {
        organizationId: org,
        integrationIds: [id],
        action: 'calendar.writer.connection_deleted',
        subject: id,
        code: 'calendar_connection_deleted',
        reason:
          'The connected account was deleted; its pending calendar work was cancelled.',
        actor: { actorType: 'user' },
        now,
      });
      await tx.inboxState.deleteMany({ where: { integrationId: id } });
      await tx.analyticsSnapshot.deleteMany({ where: { integrationId: id } });
      await tx.integrationsWebhooks.deleteMany({
        where: { integrationId: id },
      });
      await tx.exisingPlugData.deleteMany({ where: { integrationId: id } });
      await tx.plugs.deleteMany({ where: { integrationId: id } });
      if (postIds.length) {
        await tx.comments.deleteMany({ where: { postId: { in: postIds } } });
        await tx.errors.deleteMany({ where: { postId: { in: postIds } } });
        await tx.publishingReceipt.updateMany({
          where: { postId: { in: postIds } },
          data: {
            providerPostId: null,
            providerUrl: null,
            evidence: Prisma.DbNull,
          },
        });
        await tx.publishingJob.updateMany({
          where: { postId: { in: postIds } },
          data: {
            providerPostId: null,
            providerUrl: null,
            lastError: null,
          },
        });
        await tx.post.updateMany({
          where: { id: { in: postIds } },
          data: { releaseId: null, releaseURL: null, error: null },
        });
      }

      await tx.integration.update({
        where: { id },
        data: {
          internalId: `deleted_${id}_${makeId(10)}`,
          rootInternalId: null,
          name: 'Deleted connection',
          profile: null,
          picture: null,
          deletedAt: now,
          disabled: true,
          token: seal('revoked'),
          refreshToken: null,
          tokenExpiration: null,
          tokenHealthState: 'UNKNOWN',
          tokenHealthReason: 'This connection was deleted.',
          tokenHealthCheckedAt: now,
          tokenHealthChangedAt: now,
          connectionHealthState: 'DISABLED',
          connectionHealthReason: 'This connection was deleted.',
          connectionHealthChangedAt: now,
          platformTruthState: 'NOT_APPLICABLE',
          platformPublishingMode: 'NOT_APPLICABLE',
          platformAuditState: 'NOT_APPLICABLE',
          platformTruthCode: null,
          platformTruthReason: null,
          platformTruthCheckedAt: null,
          platformTruthChangedAt: now,
          platformAccountType: null,
          platformLinkedResourceId: null,
          platformTruthMetadata: Prisma.DbNull,
          lastProviderContactAt: null,
          customInstanceDetails: null,
          additionalSettings: '[]',
        },
      });
      return true;
    });
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integration.model.integration.updateMany({
      where: {
        organizationId: org,
        internalId: page,
        deletedAt: {
          not: null,
        },
      },
      data: {
        internalId: makeId(10),
      },
    });
  }

  async disableIntegrations(org: string, totalChannels: number) {
    const getChannels = await this._integration.model.integration.findMany({
      where: {
        organizationId: org,
        disabled: false,
        deletedAt: null,
      },
      take: totalChannels,
      select: {
        id: true,
      },
    });

    for (const channel of getChannels) {
      await this._integration.model.integration.update({
        where: {
          id: channel.id,
        },
        data: {
          disabled: true,
        },
      });
    }
  }

  getPlugsByIntegrationId(org: string, id: string) {
    return this._plugs.model.plugs.findMany({
      where: {
        organizationId: org,
        integrationId: id,
      },
    });
  }

  createOrUpdatePlug(org: string, integrationId: string, body: PlugDto) {
    return this._plugs.model.plugs.upsert({
      where: {
        organizationId: org,
        plugFunction_integrationId: {
          integrationId,
          plugFunction: body.func,
        },
      },
      create: {
        integrationId,
        organizationId: org,
        plugFunction: body.func,
        data: JSON.stringify(body.fields),
        activated: true,
      },
      update: {
        data: JSON.stringify(body.fields),
      },
      select: {
        activated: true,
      },
    });
  }

  changePlugActivation(orgId: string, plugId: string, status: boolean) {
    return this._plugs.model.plugs.update({
      where: {
        organizationId: orgId,
        id: plugId,
      },
      data: {
        activated: !!status,
      },
    });
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    return this._exisingPlugData.model.exisingPlugData.findMany({
      where: {
        integrationId,
        methodName,
        value: {
          in: id,
        },
      },
    });
  }

  async saveExisingData(
    methodName: string,
    integrationId: string,
    value: string[]
  ) {
    return this._exisingPlugData.model.exisingPlugData.createMany({
      data: value.map((p) => ({
        integrationId,
        methodName,
        value: p,
      })),
    });
  }

  async getPostingTimes(orgId: string, integrationsId?: string) {
    return this._integration.model.integration.findMany({
      where: {
        ...(integrationsId ? { id: integrationsId } : {}),
        organizationId: orgId,
        disabled: false,
        deletedAt: null,
      },
      select: {
        postingTimes: true,
      },
    });
  }

  listPlatformTruthConnections() {
    return this._integration.model.integration.findMany({
      where: {
        deletedAt: null,
        disabled: false,
        inBetweenSteps: false,
        type: 'social',
        providerIdentifier: { in: ['tiktok', 'instagram'] },
      },
      orderBy: [{ organizationId: 'asc' }, { id: 'asc' }],
    });
  }
}
