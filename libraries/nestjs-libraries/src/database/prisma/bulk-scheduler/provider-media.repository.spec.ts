import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { ProviderMediaRepository } from './provider-media.repository';

describe('ProviderMediaRepository', () => {
  let db: any;
  let tx: any;
  let repository: ProviderMediaRepository;

  beforeEach(() => {
    db = {
      model: {
        bulkAsset: {
          create: jest.fn(),
          findFirst: jest.fn(),
        },
        bulkCampaignAsset: {
          create: jest.fn(),
          findFirst: jest.fn(),
        },
        bulkPublishingJobAsset: {
          upsert: jest.fn(),
          findFirst: jest.fn(),
        },
        providerMediaGrant: {
          create: jest.fn(),
          findUnique: jest.fn(),
          updateMany: jest.fn(),
        },
        providerMediaFetchEvent: {
          create: jest.fn(),
          updateMany: jest.fn(),
        },
      },
    };
    tx = {
      providerMediaGrant: { updateMany: jest.fn() },
      providerMediaFetchEvent: { create: jest.fn() },
    };
    repository = new ProviderMediaRepository(db, {
      model: { $transaction: jest.fn((operation) => operation(tx)) },
    } as any);
  });

  it('never updates a campaign asset through a tenant-free primary key', async () => {
    db.model.bulkCampaignAsset.create.mockResolvedValue({
      organizationId: 'org-1',
      campaignId: 'campaign-1',
      assetId: 'asset-1',
      position: 4,
    });

    await repository.attachCampaignAsset({
      organizationId: 'org-1',
      campaignId: 'campaign-1',
      assetId: 'asset-1',
      position: 4,
    });

    expect(db.model.bulkCampaignAsset.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        assetId: 'asset-1',
        position: 4,
      },
    });
    expect(db.model.bulkCampaignAsset.findFirst).not.toHaveBeenCalled();
  });

  it('scopes idempotent campaign-asset replay lookup to the tenant', async () => {
    const replayError = Object.create(
      Prisma.PrismaClientKnownRequestError.prototype
    );
    Object.assign(replayError, { code: 'P2002' });
    db.model.bulkCampaignAsset.create.mockRejectedValue(replayError);
    db.model.bulkCampaignAsset.findFirst.mockResolvedValue({
      organizationId: 'org-1',
      campaignId: 'campaign-1',
      assetId: 'asset-1',
      position: 4,
    });

    await expect(
      repository.attachCampaignAsset({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        assetId: 'asset-1',
        position: 4,
      })
    ).resolves.toEqual(expect.objectContaining({ organizationId: 'org-1' }));
    expect(db.model.bulkCampaignAsset.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        assetId: 'asset-1',
      },
    });
  });

  it('uses the tenant-qualified unique key for job attachment replays', async () => {
    db.model.bulkPublishingJobAsset.upsert.mockResolvedValue({});
    await repository.attachJobAsset({
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      assetId: 'asset-1',
      ordinal: 0,
    });
    expect(db.model.bulkPublishingJobAsset.upsert).toHaveBeenCalledWith({
      where: {
        publishingJobId_assetId_organizationId: {
          organizationId: 'org-1',
          publishingJobId: 'job-1',
          assetId: 'asset-1',
        },
      },
      create: {
        organizationId: 'org-1',
        publishingJobId: 'job-1',
        assetId: 'asset-1',
        ordinal: 0,
      },
      update: {},
      include: { asset: true, publishingJob: true },
    });
  });

  it('looks up a job asset by tenant, job, and asset together', async () => {
    db.model.bulkPublishingJobAsset.findFirst.mockResolvedValue(null);
    await repository.getJobAsset('org-1', 'job-1', 'asset-1');
    expect(db.model.bulkPublishingJobAsset.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        publishingJobId: 'job-1',
        assetId: 'asset-1',
      },
      include: { asset: true, publishingJob: true },
    });
  });

  it('claims a fetch with hash, expiry, revocation, count, and tenant predicates atomically', async () => {
    tx.providerMediaGrant.updateMany.mockResolvedValue({ count: 1 });
    tx.providerMediaFetchEvent.create.mockResolvedValue({ id: 'event-1' });
    const now = new Date('2026-08-13T00:00:00.000Z');
    await expect(
      repository.claimFetch({
        eventId: 'event-1',
        grantId: 'grant-1',
        organizationId: 'org-1',
        tokenHash: 'a'.repeat(64),
        expectedFetchCount: 2,
        method: 'GET',
        requestedRange: 'bytes=0-9',
        now,
      })
    ).resolves.toEqual({ id: 'event-1' });
    expect(tx.providerMediaGrant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'grant-1',
        organizationId: 'org-1',
        tokenHash: 'a'.repeat(64),
        revokedAt: null,
        expiresAt: { gt: now },
        fetchCount: 2,
        OR: [{ maxFetches: null }, { maxFetches: { gt: 2 } }],
      },
      data: {
        fetchCount: { increment: 1 },
        lastFetchedAt: now,
      },
    });
    expect(tx.providerMediaFetchEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'event-1',
        organizationId: 'org-1',
        grantId: 'grant-1',
        code: 'provider_media_fetch_authorized',
        reason: expect.any(String),
      }),
    });
  });

  it('does not create an event when an atomic grant claim loses a race', async () => {
    tx.providerMediaGrant.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repository.claimFetch({
        eventId: 'event-1',
        grantId: 'grant-1',
        organizationId: 'org-1',
        tokenHash: 'a'.repeat(64),
        expectedFetchCount: 0,
        method: 'HEAD',
        now: new Date(),
      })
    ).resolves.toBeNull();
    expect(tx.providerMediaFetchEvent.create).not.toHaveBeenCalled();
  });

  it('records a known rejected fetch without mutating its grant count', async () => {
    db.model.providerMediaFetchEvent.create.mockResolvedValue({
      id: 'event-1',
    });
    await repository.recordRejectedFetch({
      eventId: 'event-1',
      grantId: 'grant-1',
      organizationId: 'org-1',
      method: 'GET',
      statusCode: 410,
      code: 'provider_media_grant_expired',
      reason: 'The grant expired.',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(db.model.providerMediaFetchEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        grantId: 'grant-1',
        state: 'REJECTED',
        statusCode: 410,
        bytesServed: 0,
        code: 'provider_media_grant_expired',
        completedAt: new Date('2026-08-13T00:00:00.000Z'),
      }),
    });
    expect(db.model.providerMediaGrant.updateMany).not.toHaveBeenCalled();
  });

  it('completes only the exact authorized event in the same tenant and grant', async () => {
    db.model.providerMediaFetchEvent.updateMany.mockResolvedValue({ count: 1 });
    await repository.completeFetch({
      eventId: 'event-1',
      organizationId: 'org-1',
      grantId: 'grant-1',
      state: 'SERVED',
      statusCode: 206,
      bytesServed: 10,
      code: 'provider_media_fetch_served',
      reason: 'Served.',
      now: new Date('2026-08-13T00:00:01.000Z'),
    });
    expect(db.model.providerMediaFetchEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
        organizationId: 'org-1',
        grantId: 'grant-1',
        state: 'AUTHORIZED',
      },
      data: expect.objectContaining({
        state: 'SERVED',
        statusCode: 206,
        bytesServed: 10,
      }),
    });
  });

  it('scopes revocation to one tenant and publishing job', async () => {
    db.model.providerMediaGrant.updateMany.mockResolvedValue({ count: 2 });
    await repository.revokeJobGrants({
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      code: 'campaign_cancelled',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(db.model.providerMediaGrant.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        publishingJobId: 'job-1',
        revokedAt: null,
      },
      data: {
        revokedAt: new Date('2026-08-13T00:00:00.000Z'),
        revocationCode: 'campaign_cancelled',
      },
    });
  });
});

describe('private provider media migration contract', () => {
  const root = process.cwd();
  const migration = readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/migrations/20260812233000_private_provider_media/migration.sql'
    ),
    'utf8'
  );

  it('enforces tenant-composite campaign, job, asset, grant, and fetch relations', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("publishingJobId", "organizationId") REFERENCES "PublishingJob"("id", "organizationId")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("publishingJobId", "assetId", "organizationId")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("grantId", "organizationId") REFERENCES "ProviderMediaGrant"("id", "organizationId")'
    );
    expect(
      migration.match(/FOREIGN KEY \("assetId", "organizationId"\)/g)
    ).toHaveLength(2);
  });

  it('stores only token hashes and constrains expiration, revocation, fetch state, and private MP4 metadata', () => {
    expect(migration).toContain('"ProviderMediaGrant_token_hash"');
    expect(migration).not.toMatch(/"token" TEXT/);
    expect(migration).toContain('"ProviderMediaGrant_expiry_valid"');
    expect(migration).toContain('"ProviderMediaGrant_revocation_coherent"');
    expect(migration).toContain(
      '"ProviderMediaFetchEvent_completion_coherent"'
    );
    expect(migration).toContain('"BulkAsset_video_mime"');
    expect(migration).toContain('"BulkAsset_sha256_valid"');
  });
});
