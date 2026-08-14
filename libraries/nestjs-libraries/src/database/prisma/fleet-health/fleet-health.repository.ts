import { Injectable } from '@nestjs/common';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class FleetHealthRepository {
  constructor(
    private _db: PrismaRepository<
      | 'integration'
      | 'publishingJob'
      | 'accountTag'
      | 'integrationAccountTag'
      | 'accountGroup'
      | 'integrationAccountGroup'
    >,
    private _transaction: PrismaTransaction
  ) {}

  listConnections(
    organizationId: string,
    filters: { groupId?: string; tagId?: string }
  ) {
    return this._db.model.integration.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: 'social',
        ...(filters.groupId
          ? {
              accountGroups: {
                some: {
                  accountGroup: {
                    id: filters.groupId,
                    organizationId,
                    deletedAt: null,
                  },
                },
              },
            }
          : {}),
        ...(filters.tagId
          ? {
              accountTags: {
                some: {
                  accountTag: {
                    id: filters.tagId,
                    organizationId,
                    deletedAt: null,
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        internalId: true,
        name: true,
        picture: true,
        providerIdentifier: true,
        disabled: true,
        refreshNeeded: true,
        tokenExpiration: true,
        tokenHealthState: true,
        tokenHealthReason: true,
        connectionHealthState: true,
        connectionHealthReason: true,
        lastProviderContactAt: true,
        lastSuccessfulPublishAt: true,
        lastFailedPublishAt: true,
        consecutiveErrors: true,
        staleSince: true,
        deadAccountAt: true,
        rateLimitedUntil: true,
        platformTruthState: true,
        platformPublishingMode: true,
        platformAuditState: true,
        platformTruthCode: true,
        platformTruthReason: true,
        platformTruthCheckedAt: true,
        platformAccountType: true,
        platformLinkedResourceId: true,
        platformTruthMetadata: true,
        accountGroups: {
          where: { accountGroup: { deletedAt: null } },
          select: {
            accountGroup: {
              select: { id: true, name: true, color: true },
            },
          },
          orderBy: { accountGroup: { name: 'asc' } },
        },
        accountTags: {
          where: { accountTag: { deletedAt: null } },
          select: {
            accountTag: { select: { id: true, name: true, color: true } },
          },
          orderBy: { accountTag: { name: 'asc' } },
        },
      },
      orderBy: [
        { connectionHealthState: 'desc' },
        { providerIdentifier: 'asc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  listFacets(organizationId: string) {
    return Promise.all([
      this._db.model.accountGroup.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this._db.model.accountTag.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true, color: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]).then(([groups, tags]) => ({ groups, tags }));
  }

  aggregateTerminalOutcomes(
    organizationId: string,
    integrationIds: string[],
    since: Date
  ) {
    if (!integrationIds.length) return Promise.resolve([]);
    return this._db.model.publishingJob.groupBy({
      by: ['integrationId', 'state', 'deliveryStage'],
      where: {
        organizationId,
        integrationId: { in: integrationIds },
        completedAt: { gte: since },
        OR: [
          { state: 'PUBLISHED', deliveryStage: 'confirmed_live' },
          { state: 'FAILED', deliveryStage: 'failed' },
        ],
      },
      _count: { _all: true },
      _sum: { attempts: true },
    });
  }

  aggregateQueue(organizationId: string, integrationIds: string[]) {
    if (!integrationIds.length) return Promise.resolve([]);
    return this._db.model.publishingJob.groupBy({
      by: ['integrationId'],
      where: {
        organizationId,
        integrationId: { in: integrationIds },
        state: { in: ['QUEUED', 'PROCESSING', 'RETRYING'] },
      },
      _count: { _all: true },
      _min: { createdAt: true },
    });
  }

  listReconnectCandidates(organizationId: string, integrationIds: string[]) {
    return this._db.model.integration.findMany({
      where: {
        organizationId,
        id: { in: integrationIds },
        deletedAt: null,
        type: 'social',
      },
      select: {
        id: true,
        internalId: true,
        name: true,
        providerIdentifier: true,
        disabled: true,
        tokenHealthState: true,
        connectionHealthState: true,
      },
    });
  }

  createTag(input: {
    organizationId: string;
    name: string;
    normalizedName: string;
    color: string;
  }) {
    return this._db.model.accountTag.upsert({
      where: {
        organizationId_normalizedName: {
          organizationId: input.organizationId,
          normalizedName: input.normalizedName,
        },
      },
      create: input,
      update: { name: input.name, color: input.color, deletedAt: null },
      select: { id: true, name: true, color: true },
    });
  }

  createGroup(input: {
    organizationId: string;
    name: string;
    normalizedName: string;
    color: string;
  }) {
    return this._db.model.accountGroup.upsert({
      where: {
        organizationId_normalizedName: {
          organizationId: input.organizationId,
          normalizedName: input.normalizedName,
        },
      },
      create: input,
      update: { name: input.name, color: input.color, deletedAt: null },
      select: { id: true, name: true, color: true },
    });
  }

  updateTag(input: {
    organizationId: string;
    accountTagId: string;
    name: string;
    normalizedName: string;
    color: string;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const current = await tx.accountTag.findFirst({
        where: {
          id: input.accountTagId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!current)
        return { ok: false as const, code: 'account_tag_not_found' };
      const conflict = await tx.accountTag.findFirst({
        where: {
          organizationId: input.organizationId,
          normalizedName: input.normalizedName,
          id: { not: input.accountTagId },
        },
        select: { id: true },
      });
      if (conflict) return { ok: false as const, code: 'account_tag_conflict' };
      const tag = await tx.accountTag.update({
        where: { id: input.accountTagId },
        data: {
          name: input.name,
          normalizedName: input.normalizedName,
          color: input.color,
        },
        select: { id: true, name: true, color: true },
      });
      return { ok: true as const, tag };
    });
  }

  updateGroup(input: {
    organizationId: string;
    accountGroupId: string;
    name: string;
    normalizedName: string;
    color: string;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const current = await tx.accountGroup.findFirst({
        where: {
          id: input.accountGroupId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!current) {
        return { ok: false as const, code: 'account_group_not_found' };
      }
      const conflict = await tx.accountGroup.findFirst({
        where: {
          organizationId: input.organizationId,
          normalizedName: input.normalizedName,
          id: { not: input.accountGroupId },
        },
        select: { id: true },
      });
      if (conflict) {
        return { ok: false as const, code: 'account_group_conflict' };
      }
      const group = await tx.accountGroup.update({
        where: { id: input.accountGroupId },
        data: {
          name: input.name,
          normalizedName: input.normalizedName,
          color: input.color,
        },
        select: { id: true, name: true, color: true },
      });
      return { ok: true as const, group };
    });
  }

  archiveTag(organizationId: string, accountTagId: string, now: Date) {
    return this._db.model.accountTag.updateMany({
      where: { id: accountTagId, organizationId, deletedAt: null },
      data: { deletedAt: now },
    });
  }

  archiveGroup(organizationId: string, accountGroupId: string, now: Date) {
    return this._db.model.accountGroup.updateMany({
      where: { id: accountGroupId, organizationId, deletedAt: null },
      data: { deletedAt: now },
    });
  }

  assignTag(input: {
    organizationId: string;
    accountTagId: string;
    integrationIds: string[];
    mode: 'add' | 'remove';
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const tag = await tx.accountTag.findFirst({
        where: {
          id: input.accountTagId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true, name: true, color: true },
      });
      if (!tag) return { ok: false as const, code: 'account_tag_not_found' };

      const connections = await tx.integration.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.integrationIds },
          deletedAt: null,
          type: 'social',
        },
        select: { id: true },
      });
      if (connections.length !== input.integrationIds.length) {
        return { ok: false as const, code: 'connection_not_found' };
      }

      const result =
        input.mode === 'add'
          ? await tx.integrationAccountTag.createMany({
              data: connections.map((connection) => ({
                integrationId: connection.id,
                accountTagId: tag.id,
              })),
              skipDuplicates: true,
            })
          : await tx.integrationAccountTag.deleteMany({
              where: {
                accountTagId: tag.id,
                integrationId: { in: input.integrationIds },
              },
            });
      return {
        ok: true as const,
        tag,
        mode: input.mode,
        affected: result.count,
        requested: input.integrationIds.length,
      };
    });
  }

  assignGroup(input: {
    organizationId: string;
    accountGroupId: string;
    integrationIds: string[];
    mode: 'add' | 'remove';
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const group = await tx.accountGroup.findFirst({
        where: {
          id: input.accountGroupId,
          organizationId: input.organizationId,
          deletedAt: null,
        },
        select: { id: true, name: true, color: true },
      });
      if (!group) {
        return { ok: false as const, code: 'account_group_not_found' };
      }

      const connections = await tx.integration.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: input.integrationIds },
          deletedAt: null,
          type: 'social',
        },
        select: { id: true },
      });
      if (connections.length !== input.integrationIds.length) {
        return { ok: false as const, code: 'connection_not_found' };
      }

      const result =
        input.mode === 'add'
          ? await tx.integrationAccountGroup.createMany({
              data: connections.map((connection) => ({
                integrationId: connection.id,
                accountGroupId: group.id,
              })),
              skipDuplicates: true,
            })
          : await tx.integrationAccountGroup.deleteMany({
              where: {
                accountGroupId: group.id,
                integrationId: { in: input.integrationIds },
              },
            });
      return {
        ok: true as const,
        group,
        mode: input.mode,
        affected: result.count,
        requested: input.integrationIds.length,
      };
    });
  }
}
