import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ProviderMediaFetchMethod,
  ProviderMediaFetchState,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

@Injectable()
export class ProviderMediaRepository {
  constructor(
    private _db: PrismaRepository<
      | 'bulkAsset'
      | 'bulkCampaignAsset'
      | 'bulkPublishingJobAsset'
      | 'providerMediaGrant'
      | 'providerMediaFetchEvent'
    >,
    private _transaction: PrismaTransaction
  ) {}

  async createAsset(input: {
    id: string;
    organizationId: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    byteLength: number;
    sha256: string;
  }) {
    try {
      const asset = await this._db.model.bulkAsset.create({ data: input });
      return { created: true as const, asset };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const asset = await this._db.model.bulkAsset.findFirst({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          sha256: input.sha256,
          state: 'READY',
        },
      });
      if (!asset) throw error;
      return { created: false as const, asset };
    }
  }

  findAsset(organizationId: string, assetId: string) {
    return this._db.model.bulkAsset.findFirst({
      where: {
        id: assetId,
        organizationId,
        state: 'READY',
        deletedAt: null,
      },
    });
  }

  async attachCampaignAsset(input: {
    organizationId: string;
    campaignId: string;
    assetId: string;
    position: number;
  }) {
    try {
      return await this._db.model.bulkCampaignAsset.create({ data: input });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      // A replay may observe the row created by the first request. Never use the
      // tenant-free primary key for an update: a caller must not be able to
      // mutate another organization's campaign position through a guessed ID.
      const existing = await this._db.model.bulkCampaignAsset.findFirst({
        where: {
          organizationId: input.organizationId,
          campaignId: input.campaignId,
          assetId: input.assetId,
        },
      });
      if (!existing) throw error;
      return existing;
    }
  }

  attachJobAsset(input: {
    organizationId: string;
    publishingJobId: string;
    assetId: string;
    ordinal: number;
  }) {
    return this._db.model.bulkPublishingJobAsset.upsert({
      where: {
        publishingJobId_assetId_organizationId: {
          publishingJobId: input.publishingJobId,
          assetId: input.assetId,
          organizationId: input.organizationId,
        },
      },
      create: input,
      update: {},
      include: {
        asset: true,
        publishingJob: true,
      },
    });
  }

  getJobAsset(
    organizationId: string,
    publishingJobId: string,
    assetId: string
  ) {
    return this._db.model.bulkPublishingJobAsset.findFirst({
      where: { organizationId, publishingJobId, assetId },
      include: {
        asset: true,
        publishingJob: true,
      },
    });
  }

  getPostJobAsset(input: {
    organizationId: string;
    postId: string;
    assetId: string;
  }) {
    return this._db.model.bulkPublishingJobAsset.findFirst({
      where: {
        organizationId: input.organizationId,
        assetId: input.assetId,
        publishingJob: {
          organizationId: input.organizationId,
          postId: input.postId,
        },
      },
      include: {
        asset: true,
        publishingJob: {
          include: { bulkCampaignJob: true },
        },
      },
    });
  }

  createGrant(input: {
    id: string;
    organizationId: string;
    publishingJobId: string;
    assetId: string;
    capabilityTupleId: string;
    tokenHash: string;
    expiresAt: Date;
    maxFetches: number | null;
  }) {
    return this._db.model.providerMediaGrant.create({ data: input });
  }

  findGrant(id: string) {
    return this._db.model.providerMediaGrant.findUnique({
      where: { id },
      include: {
        jobAsset: {
          include: {
            asset: true,
            publishingJob: true,
          },
        },
      },
    });
  }

  async claimFetch(input: {
    eventId: string;
    grantId: string;
    organizationId: string;
    tokenHash: string;
    expectedFetchCount: number;
    method: ProviderMediaFetchMethod;
    requestedRange?: string;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const claimed = await tx.providerMediaGrant.updateMany({
        where: {
          id: input.grantId,
          organizationId: input.organizationId,
          tokenHash: input.tokenHash,
          revokedAt: null,
          expiresAt: { gt: input.now },
          fetchCount: input.expectedFetchCount,
          OR: [
            { maxFetches: null },
            { maxFetches: { gt: input.expectedFetchCount } },
          ],
        },
        data: {
          fetchCount: { increment: 1 },
          lastFetchedAt: input.now,
        },
      });
      if (claimed.count !== 1) return null;
      return tx.providerMediaFetchEvent.create({
        data: {
          id: input.eventId,
          organizationId: input.organizationId,
          grantId: input.grantId,
          method: input.method,
          requestedRange: input.requestedRange,
          code: 'provider_media_fetch_authorized',
          reason: 'The job-scoped provider media fetch was authorized.',
          occurredAt: input.now,
        },
      });
    });
  }

  recordRejectedFetch(input: {
    eventId: string;
    grantId: string;
    organizationId: string;
    method: ProviderMediaFetchMethod;
    requestedRange?: string;
    statusCode: number;
    code: string;
    reason: string;
    now: Date;
  }) {
    return this._db.model.providerMediaFetchEvent.create({
      data: {
        id: input.eventId,
        organizationId: input.organizationId,
        grantId: input.grantId,
        method: input.method,
        requestedRange: input.requestedRange,
        state: 'REJECTED',
        statusCode: input.statusCode,
        bytesServed: 0,
        code: input.code,
        reason: input.reason,
        occurredAt: input.now,
        completedAt: input.now,
      },
    });
  }

  completeFetch(input: {
    eventId: string;
    organizationId: string;
    grantId: string;
    state: Extract<ProviderMediaFetchState, 'SERVED' | 'FAILED'>;
    statusCode: number;
    bytesServed: number;
    code: string;
    reason: string;
    now: Date;
  }) {
    return this._db.model.providerMediaFetchEvent.updateMany({
      where: {
        id: input.eventId,
        organizationId: input.organizationId,
        grantId: input.grantId,
        state: 'AUTHORIZED',
      },
      data: {
        state: input.state,
        statusCode: input.statusCode,
        bytesServed: input.bytesServed,
        code: input.code,
        reason: input.reason,
        completedAt: input.now,
      },
    });
  }

  revokeJobGrants(input: {
    organizationId: string;
    publishingJobId: string;
    code: string;
    now: Date;
  }) {
    return this._db.model.providerMediaGrant.updateMany({
      where: {
        organizationId: input.organizationId,
        publishingJobId: input.publishingJobId,
        revokedAt: null,
      },
      data: { revokedAt: input.now, revocationCode: input.code },
    });
  }
}
