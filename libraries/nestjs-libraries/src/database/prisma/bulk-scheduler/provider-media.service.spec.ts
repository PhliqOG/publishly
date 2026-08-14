import { Readable } from 'node:stream';
import { HttpException } from '@nestjs/common';
import { hashProviderMediaCapability } from '@gitroom/helpers/bulk-scheduler/provider-media.contract';
import { ProviderMediaService } from './provider-media.service';

const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('isomiso2mp41'),
  Buffer.alloc(100),
]);

function jobAsset(provider = 'instagram') {
  return {
    organizationId: 'org-1',
    publishingJobId: 'job-1',
    assetId: 'asset-1',
    ordinal: 0,
    asset: {
      id: 'asset-1',
      organizationId: 'org-1',
      storageKey: 'bulk/org/asset/video.mp4',
      originalName: 'launch.mp4',
      mimeType: 'video/mp4',
      byteLength: 1000,
      sha256: 'a'.repeat(64),
      state: 'READY',
      deletedAt: null,
    },
    publishingJob: {
      id: 'job-1',
      organizationId: 'org-1',
      provider,
    },
  };
}

function capabilityFixture(overrides: Record<string, unknown> = {}) {
  const capability = `pmg_${'a'.repeat(32)}.${'B'.repeat(43)}`;
  const link = jobAsset();
  return {
    capability,
    grant: {
      id: `pmg_${'a'.repeat(32)}`,
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      assetId: 'asset-1',
      capabilityTupleId: 'instagram.professional.reel.video',
      tokenHash: hashProviderMediaCapability(capability),
      expiresAt: new Date('2026-08-13T04:00:00.000Z'),
      maxFetches: null,
      fetchCount: 0,
      revokedAt: null,
      jobAsset: link,
      ...overrides,
    },
  };
}

async function consume(stream: Readable | null) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream || []) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('ProviderMediaService', () => {
  let repository: any;
  let storage: any;
  let service: ProviderMediaService;
  const originalEnvironment = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PROVIDER_MEDIA_BASE_URL = 'https://api.publishly.test';
    process.env.BULK_PRIVATE_INTERNAL_TOKEN =
      'test-private-adapter-secret-at-least-32';
    delete process.env.BULK_SCHEDULER_KILL_ALL;
    delete process.env.BULK_SCHEDULER_KILL_INSTAGRAM_PROFESSIONAL_REEL_VIDEO;
    repository = {
      createAsset: jest.fn(),
      attachCampaignAsset: jest.fn(),
      attachJobAsset: jest.fn(),
      getJobAsset: jest.fn(),
      createGrant: jest.fn().mockResolvedValue({ id: 'grant' }),
      findGrant: jest.fn(),
      claimFetch: jest.fn().mockResolvedValue({ id: 'event-1' }),
      recordRejectedFetch: jest.fn().mockResolvedValue({ id: 'rejected-1' }),
      completeFetch: jest.fn().mockResolvedValue({ count: 1 }),
      revokeJobGrants: jest.fn().mockResolvedValue({ count: 1 }),
    };
    storage = {
      put: jest.fn(),
      head: jest.fn().mockResolvedValue({
        contentLength: 1000,
        contentType: 'video/mp4',
        etag: 'etag-1',
      }),
      open: jest.fn().mockImplementation(async (_key: string, range: any) => ({
        contentLength: range ? range.end - range.start + 1 : 1000,
        contentType: 'video/mp4',
        ...(range ? { contentRange: `bytes ${range.start}-${range.end}/1000` } : {}),
        body: Readable.from(Buffer.from(range ? '0123' : 'video')),
      })),
      remove: jest.fn(),
    };
    service = new ProviderMediaService(repository);
    service.useStorageForTesting(storage);
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
    jest.restoreAllMocks();
  });

  it('stores verified MP4 bytes privately and returns no storage path or URL', async () => {
    repository.createAsset.mockImplementation(async (input: any) => ({
      created: true,
      asset: { ...input, state: 'READY' },
    }));
    const result = await service.storePrivateVideo({
      organizationId: 'org-1',
      originalName: '../launch.mov',
      body: mp4,
    });
    expect(result).toMatchObject({
      id: expect.stringMatching(/^bulk_asset_/),
      originalName: expect.stringMatching(/\.mp4$/),
      mimeType: 'video/mp4',
      byteLength: mp4.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      state: 'READY',
      duplicate: false,
    });
    expect(result).not.toHaveProperty('storageKey');
    expect(result).not.toHaveProperty('url');
    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^bulk\/[a-f0-9]{32}\/bulk_asset_[a-f0-9]{32}\/[a-f0-9]{64}\.mp4$/),
      mp4,
      'video/mp4'
    );
  });

  it('quarantines unsupported bytes at the boundary instead of storing them', async () => {
    await expect(
      service.storePrivateVideo({
        organizationId: 'org-1',
        originalName: 'script.html',
        body: Buffer.from('<script>alert(1)</script>'),
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(storage.put).not.toHaveBeenCalled();
    expect(repository.createAsset).not.toHaveBeenCalled();
  });

  it('issues a random job-scoped Instagram capability with a four-hour repeat-fetch policy', async () => {
    repository.getJobAsset.mockResolvedValue(jobAsset());
    const now = new Date('2026-08-13T00:00:00.000Z');
    const result = await service.issueProviderPullGrant({
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      assetId: 'asset-1',
      tupleId: 'instagram.professional.reel.video',
      now,
    });
    expect(result).toMatchObject({
      grantId: expect.stringMatching(/^pmg_[a-f0-9]{32}$/),
      url: expect.stringMatching(
        /^https:\/\/api\.publishly\.test\/provider-media\/pmg_[a-f0-9]{32}\.[A-Za-z0-9_-]{43}\/video\.mp4$/
      ),
      expiresAt: new Date('2026-08-13T04:00:00.000Z'),
      fetchPolicy: {
        ttlSeconds: 14400,
        maxFetches: null,
        allowHead: true,
        allowRange: true,
      },
    });
    const written = repository.createGrant.mock.calls[0][0];
    expect(written).toMatchObject({
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      assetId: 'asset-1',
      capabilityTupleId: 'instagram.professional.reel.video',
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      maxFetches: null,
    });
    expect(result.url).not.toContain(jobAsset().asset.storageKey);
    expect(result.url).not.toContain('org-1');
  });

  it('refuses wrong-tenant or unrelated-job assets before granting access', async () => {
    repository.getJobAsset.mockResolvedValue(null);
    await expect(
      service.issueProviderPullGrant({
        organizationId: 'org-wrong',
        publishingJobId: 'job-1',
        assetId: 'asset-1',
        tupleId: 'instagram.professional.reel.video',
      })
    ).rejects.toThrow('bulk_job_asset_not_found');
    expect(repository.getJobAsset).toHaveBeenCalledWith(
      'org-wrong',
      'job-1',
      'asset-1'
    );
    expect(repository.createGrant).not.toHaveBeenCalled();
  });

  it('opens direct-upload bytes only for an exact direct tuple and linked job', async () => {
    repository.getJobAsset.mockResolvedValue(jobAsset('youtube'));
    await expect(
      service.openDirectJobAsset({
        organizationId: 'org-1',
        publishingJobId: 'job-1',
        assetId: 'asset-1',
        tupleId: 'youtube.channel.video.video',
      })
    ).resolves.toMatchObject({ contentType: 'video/mp4' });
    await expect(
      service.openDirectJobAsset({
        organizationId: 'org-1',
        publishingJobId: 'job-1',
        assetId: 'asset-1',
        tupleId: 'instagram.professional.reel.video',
      })
    ).rejects.toThrow('bulk_private_transport_tuple_unavailable');
  });

  it('serves repeat HEAD and byte-range GET requests and records both durably', async () => {
    const fixture = capabilityFixture();
    repository.findGrant.mockResolvedValue(fixture.grant);
    const head = await service.openProviderMedia({
      capability: fixture.capability,
      method: 'HEAD',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(head).toMatchObject({
      statusCode: 200,
      contentLength: 1000,
      contentType: 'video/mp4',
      body: null,
    });
    await head.completeServed();

    const get = await service.openProviderMedia({
      capability: fixture.capability,
      method: 'GET',
      rangeHeader: 'bytes=10-13',
      now: new Date('2026-08-13T00:01:00.000Z'),
    });
    expect(get).toMatchObject({
      statusCode: 206,
      contentLength: 4,
      contentRange: 'bytes 10-13/1000',
      contentType: 'video/mp4',
    });
    await expect(consume(get.body)).resolves.toEqual(Buffer.from('0123'));
    await get.completeServed();
    expect(repository.claimFetch).toHaveBeenCalledTimes(2);
    expect(repository.completeFetch).toHaveBeenCalledTimes(2);
    expect(storage.head).toHaveBeenCalledTimes(1);
    expect(storage.open).toHaveBeenCalledWith(
      fixture.grant.jobAsset.asset.storageKey,
      { start: 10, end: 13 }
    );
  });

  it('requires internal adapter authentication for a direct-upload capability', async () => {
    const fixture = capabilityFixture({
      capabilityTupleId: 'youtube.channel.video.video',
      jobAsset: jobAsset('youtube'),
    });
    repository.findGrant.mockResolvedValue(fixture.grant);
    await expect(
      service.openProviderMedia({
        capability: fixture.capability,
        method: 'GET',
        now: new Date('2026-08-13T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.recordRejectedFetch).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'provider_media_internal_auth_invalid' })
    );
    repository.recordRejectedFetch.mockClear();
    await expect(
      service.openProviderMedia({
        capability: fixture.capability,
        method: 'GET',
        internalToken: 'test-private-adapter-secret-at-least-32',
        now: new Date('2026-08-13T00:00:00.000Z'),
      })
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(repository.recordRejectedFetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'tampered',
      { tokenHash: 'f'.repeat(64) },
      'provider_media_capability_tampered',
      404,
    ],
    [
      'expired',
      { expiresAt: new Date('2026-08-12T23:59:59.000Z') },
      'provider_media_grant_expired',
      410,
    ],
    [
      'revoked',
      { revokedAt: new Date('2026-08-12T23:00:00.000Z') },
      'provider_media_grant_revoked',
      410,
    ],
    [
      'over limit',
      { maxFetches: 2, fetchCount: 2 },
      'provider_media_fetch_limit_reached',
      410,
    ],
  ])('rejects and durably records a known %s capability', async (_label, overrides, code, status) => {
    const fixture = capabilityFixture(overrides);
    repository.findGrant.mockResolvedValue(fixture.grant);
    await expect(
      service.openProviderMedia({
        capability: fixture.capability,
        method: 'GET',
        now: new Date('2026-08-13T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status });
    expect(repository.recordRejectedFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        grantId: fixture.grant.id,
        organizationId: 'org-1',
        code,
        statusCode: status,
        reason: expect.any(String),
      })
    );
    expect(repository.claimFetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid range with a durable code and no storage read', async () => {
    const fixture = capabilityFixture();
    repository.findGrant.mockResolvedValue(fixture.grant);
    await expect(
      service.openProviderMedia({
        capability: fixture.capability,
        method: 'GET',
        rangeHeader: 'bytes=1000-',
        now: new Date('2026-08-13T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 416 });
    expect(repository.recordRejectedFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'provider_media_range_unsatisfiable',
        requestedRange: 'bytes=1000-',
      })
    );
    expect(storage.open).not.toHaveBeenCalled();
  });

  it('marks the durable fetch failed when private storage cannot be read', async () => {
    const fixture = capabilityFixture();
    repository.findGrant.mockResolvedValue(fixture.grant);
    storage.open.mockRejectedValue(new Error('private bucket unavailable'));
    await expect(
      service.openProviderMedia({
        capability: fixture.capability,
        method: 'GET',
        now: new Date('2026-08-13T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 503 });
    expect(repository.completeFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'FAILED',
        statusCode: 503,
        code: 'provider_media_storage_unavailable',
        reason: 'private bucket unavailable',
      })
    );
  });

  it('honors the permanent tuple kill switch for existing grants', async () => {
    const fixture = capabilityFixture();
    repository.findGrant.mockResolvedValue(fixture.grant);
    process.env.BULK_SCHEDULER_KILL_INSTAGRAM_PROFESSIONAL_REEL_VIDEO = 'true';
    await expect(
      service.openProviderMedia({
        capability: fixture.capability,
        method: 'GET',
        now: new Date('2026-08-13T00:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 410 });
    expect(repository.recordRejectedFetch).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'provider_media_tuple_disabled' })
    );
  });

  it('revokes grants only inside the supplied tenant and job', async () => {
    await service.revokeJobGrants({
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      code: 'campaign_cancelled',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(repository.revokeJobGrants).toHaveBeenCalledWith({
      organizationId: 'org-1',
      publishingJobId: 'job-1',
      code: 'campaign_cancelled',
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
  });
});
