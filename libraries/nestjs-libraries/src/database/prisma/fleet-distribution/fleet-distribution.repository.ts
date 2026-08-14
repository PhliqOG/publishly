import { Injectable } from '@nestjs/common';
import { PostFailureClass, Prisma } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const distributionInclude = {
  accountGroup: { select: { id: true, name: true, color: true } },
  items: {
    include: {
      integration: {
        select: {
          id: true,
          organizationId: true,
          name: true,
          providerIdentifier: true,
          disabled: true,
          deletedAt: true,
        },
      },
    },
    orderBy: [
      { scheduledAt: 'asc' as const },
      { integrationId: 'asc' as const },
    ],
  },
};

export type FleetDistributionAllocation = {
  id: string;
  integrationId: string;
  postId: string;
  postGroup: string;
  scheduledAt: Date;
};

@Injectable()
export class FleetDistributionRepository {
  constructor(
    private _db: PrismaRepository<
      'accountGroup' | 'post' | 'fleetDistribution' | 'fleetDistributionItem'
    >,
    private _transaction: PrismaTransaction
  ) {}

  findByKey(organizationId: string, keyHash: string) {
    return this._db.model.fleetDistribution.findUnique({
      where: { organizationId_keyHash: { organizationId, keyHash } },
      include: distributionInclude,
    });
  }

  getActiveGroup(organizationId: string, accountGroupId: string) {
    return this._db.model.accountGroup.findFirst({
      where: { id: accountGroupId, organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        color: true,
        integrations: {
          where: {
            integration: { deletedAt: null, type: 'social' },
          },
          select: {
            integration: {
              select: {
                id: true,
                organizationId: true,
                name: true,
                providerIdentifier: true,
                disabled: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { integrationId: 'asc' },
        },
      },
    });
  }

  listExistingSlots(input: {
    organizationId: string;
    integrationIds: string[];
    windowStart: Date;
    windowEnd: Date;
    paddingSeconds: number;
  }) {
    const paddingMs = input.paddingSeconds * 1_000;
    return this._db.model.post.findMany({
      where: {
        organizationId: input.organizationId,
        integrationId: { in: input.integrationIds },
        deletedAt: null,
        state: 'QUEUE',
        publishDate: {
          gte: new Date(input.windowStart.getTime() - paddingMs),
          lte: new Date(input.windowEnd.getTime() + paddingMs),
        },
      },
      select: { integrationId: true, publishDate: true },
      orderBy: [{ publishDate: 'asc' }, { id: 'asc' }],
    });
  }

  async create(input: {
    id: string;
    organizationId: string;
    accountGroupId: string;
    keyHash: string;
    requestHash: string;
    windowStart: Date;
    windowEnd: Date;
    timezone: string;
    minimumSpacingSec: number;
    items: FleetDistributionAllocation[];
  }) {
    try {
      const distribution = await this._db.model.fleetDistribution.create({
        data: {
          id: input.id,
          organizationId: input.organizationId,
          accountGroupId: input.accountGroupId,
          keyHash: input.keyHash,
          requestHash: input.requestHash,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          timezone: input.timezone,
          minimumSpacingSec: input.minimumSpacingSec,
          items: { create: input.items },
        },
        include: distributionInclude,
      });
      return { created: true as const, distribution };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const distribution = await this.findByKey(
        input.organizationId,
        input.keyHash
      );
      if (!distribution) throw error;
      return { created: false as const, distribution };
    }
  }

  resume(distributionId: string) {
    return this._db.model.fleetDistribution.update({
      where: { id: distributionId },
      data: {
        state: 'IN_PROGRESS',
        lastFailureClass: null,
        lastFailureCode: null,
        lastFailureReason: null,
        completedAt: null,
      },
    });
  }

  markItemCreated(distributionId: string, itemId: string) {
    return this._db.model.fleetDistributionItem.updateMany({
      where: { id: itemId, distributionId, status: 'ALLOCATED' },
      data: {
        status: 'CREATED',
        failureClass: null,
        failureCode: null,
        failureReason: null,
      },
    });
  }

  recordFailure(input: {
    distributionId: string;
    itemId?: string;
    failureClass: PostFailureClass;
    code: string;
    reason: string;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      if (input.itemId) {
        await tx.fleetDistributionItem.updateMany({
          where: { id: input.itemId, distributionId: input.distributionId },
          data: {
            failureClass: input.failureClass,
            failureCode: input.code,
            failureReason: input.reason,
          },
        });
      }
      return tx.fleetDistribution.update({
        where: { id: input.distributionId },
        data: {
          state: 'FAILED',
          lastFailureClass: input.failureClass,
          lastFailureCode: input.code,
          lastFailureReason: input.reason,
        },
      });
    });
  }

  complete(distributionId: string, now: Date) {
    return this._transaction.model.$transaction(async (tx) => {
      const remaining = await tx.fleetDistributionItem.count({
        where: { distributionId, status: 'ALLOCATED' },
      });
      if (remaining) return { completed: false as const, remaining };
      await tx.fleetDistribution.update({
        where: { id: distributionId },
        data: {
          state: 'COMPLETED',
          completedAt: now,
          lastFailureClass: null,
          lastFailureCode: null,
          lastFailureReason: null,
        },
      });
      return { completed: true as const, remaining: 0 };
    });
  }
}
