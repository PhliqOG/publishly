import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { BulkUploadRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.repository';
import { BulkUploadService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.service';
import { LocalPrivateMediaStorage } from '@gitroom/nestjs-libraries/upload/private-media.storage';
import { BULK_UPLOAD_CHUNK_BYTES } from '@gitroom/helpers/bulk-scheduler/upload.contract';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const repository = new BulkUploadRepository(
  new PrismaRepository(prisma as any) as any,
  new PrismaTransaction(prisma as any)
);
const service = new BulkUploadService(repository);
let root: string;
let organizationId: string;
let integrationId: string;
let campaignId: string;

const intent = (destination: string) =>
  ({
    schemaVersion: 1,
    selection: {
      destinations: [
        {
          integrationId: destination,
          capabilityTupleId: 'instagram.professional.reel.video',
        },
      ],
    },
    distribution: { mode: 'cross_post' },
    cadence: { scope: 'per_account', postsPerDay: 3 },
    schedule: {
      startDate: '2026-09-01',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      timezone: 'UTC',
      windowStart: '09:00',
      windowEnd: '17:00',
      spacingMinutes: 60,
      slotStrategy: 'even',
      conflictBehavior: 'next_available',
    },
    ordering: { mode: 'upload' },
  }) as Prisma.InputJsonValue;

async function generateVideo(kind: 'mp4' | 'webm') {
  const output = path.join(root, `fixture-${randomUUID()}.${kind}`);
  const codec = kind === 'mp4' ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : ['-c:v', 'libvpx-vp9'];
  await execFileAsync(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x240:d=0.4',
      '-an',
      ...codec,
      output,
    ],
    { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }
  );
  return readFile(output);
}

async function initiateFiles(
  key: string,
  files: Array<{
    clientUploadId: string;
    originalName: string;
    relativePath: string;
    body: Buffer;
    mimeType: string;
  }>
) {
  return service.initiate({
    organizationId,
    campaignId,
    idempotencyKey: key,
    body: {
      files: files.map(({ body, ...file }) => ({
        ...file,
        byteLength: body.length,
      })),
    },
  });
}

async function uploadAll(upload: any, body: Buffer) {
  for (let partNumber = 0; partNumber < upload.totalParts; partNumber += 1) {
    const start = partNumber * upload.chunkSize;
    const end = Math.min(body.length, start + upload.chunkSize);
    await service.uploadPart({
      organizationId,
      campaignId,
      uploadId: upload.id,
      partNumber,
      body: body.subarray(start, end),
    });
  }
  await service.complete({ organizationId, campaignId, uploadId: upload.id });
}

async function cleanup() {
  await prisma.providerMediaFetchEvent.deleteMany({ where: { organizationId } });
  await prisma.providerMediaGrant.deleteMany({ where: { organizationId } });
  await prisma.publishingAttempt.deleteMany({ where: { organizationId } });
  await prisma.bulkPublishingJobAsset.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignJob.deleteMany({ where: { organizationId } });
  await prisma.bulkUploadPart.deleteMany({ where: { organizationId } });
  await prisma.bulkUploadSession.deleteMany({ where: { organizationId } });
  await prisma.calendarReservation.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignIssue.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignAsset.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaignIntent.deleteMany({ where: { organizationId } });
  await prisma.bulkCampaign.deleteMany({ where: { organizationId } });
  await prisma.bulkAsset.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.integration.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

describe('Bulk Scheduler native resumable upload integration', () => {
  jest.setTimeout(180_000);

  beforeAll(async () => {
    await prisma.$connect();
    root = await mkdtemp(path.join(os.tmpdir(), 'publishly-bulk-upload-int-'));
    service.useStorageForTesting(new LocalPrivateMediaStorage(root));
    const suffix = randomUUID();
    organizationId = `upload_org_${suffix}`;
    integrationId = `upload_integration_${suffix}`;
    campaignId = `upload_campaign_${suffix}`;
    await prisma.organization.create({
      data: { id: organizationId, name: 'Bulk upload integration tenant' },
    });
    await prisma.integration.create({
      data: {
        id: integrationId,
        organizationId,
        internalId: `upload_internal_${suffix}`,
        name: 'Designated upload destination',
        providerIdentifier: 'testprovider',
        token: 'test-only-token',
        type: 'social',
      },
    });
    await prisma.bulkCampaign.create({
      data: {
        id: campaignId,
        organizationId,
        name: 'Native upload campaign',
        idempotencyKeyHash: `upload_key_${suffix}`,
        requestHash: `upload_request_${suffix}`,
        state: 'SCHEDULED',
      },
    });
    await prisma.bulkCampaignIntent.create({
      data: {
        id: `upload_intent_${suffix}`,
        organizationId,
        campaignId,
        revision: 1,
        intent: intent(integrationId),
        intentHash: 'b'.repeat(64),
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
  });

  it('resumes out-of-order chunks and reports every missing part', async () => {
    const body = Buffer.alloc(BULK_UPLOAD_CHUNK_BYTES + 17, 7);
    const initiated = await initiateFiles('resume-batch-0001', [
      {
        clientUploadId: 'resume-file-0001',
        originalName: 'resume.mp4',
        relativePath: 'folder/resume.mp4',
        body,
        mimeType: 'video/mp4',
      },
    ]);
    const upload = initiated.sessions[0];
    await service.uploadPart({
      organizationId,
      campaignId,
      uploadId: upload.id,
      partNumber: 1,
      body: body.subarray(BULK_UPLOAD_CHUNK_BYTES),
    });
    await expect(
      service.complete({ organizationId, campaignId, uploadId: upload.id })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'upload_incomplete',
        missingParts: [0],
      }),
    });
    await service.uploadPart({
      organizationId,
      campaignId,
      uploadId: upload.id,
      partNumber: 0,
      body: body.subarray(0, BULK_UPLOAD_CHUNK_BYTES),
    });
    await expect(
      service.complete({ organizationId, campaignId, uploadId: upload.id })
    ).resolves.toMatchObject({ accepted: true, replayed: false });
    await service.abort({ organizationId, campaignId, uploadId: upload.id });
  });

  it('makes one valid file READY while independently quarantining a corrupt neighbor', async () => {
    const video = await generateVideo('mp4');
    const corrupt = Buffer.from('this is not a video');
    const initiated = await initiateFiles('mixed-batch-0001', [
      {
        clientUploadId: 'valid-file-0001',
        originalName: 'valid.mp4',
        relativePath: 'launch/valid.mp4',
        body: video,
        mimeType: 'video/mp4',
      },
      {
        clientUploadId: 'broken-file-0001',
        originalName: 'broken.mp4',
        relativePath: 'launch/broken.mp4',
        body: corrupt,
        mimeType: 'video/mp4',
      },
    ]);
    await uploadAll(initiated.sessions[0], video);
    await uploadAll(initiated.sessions[1], corrupt);
    await expect(service.processBatch({ limit: 2 })).resolves.toMatchObject({
      claimed: 2,
    });
    const [ready, bad] = await Promise.all(
      initiated.sessions.map((upload) =>
        service.get(organizationId, campaignId, upload.id)
      )
    );
    expect(ready).toMatchObject({
      state: 'READY',
      normalizationApplied: false,
      asset: {
        mimeType: 'video/mp4',
        videoCodec: 'h264',
        width: 320,
        height: 240,
      },
    });
    expect(ready).not.toHaveProperty('storagePrefix');
    expect(bad).toMatchObject({
      state: 'QUARANTINED',
      failureClass: 'data_problem',
      failureCode: 'invalid_media',
      failureReason: expect.any(String),
    });
    const thumbnail = await service.openThumbnail(organizationId, ready.assetId!);
    expect(thumbnail.contentType).toBe('image/webp');
    expect(thumbnail.contentLength).toBeGreaterThan(0);
    expect(
      await prisma.bulkCampaignIssue.count({
        where: {
          organizationId,
          campaignId,
          subjectType: 'upload',
          subjectId: bad.id,
          code: 'invalid_media',
        },
      })
    ).toBe(1);
  });

  it('normalizes a WebM deterministically and stores only a canonical private MP4 asset', async () => {
    const video = await generateVideo('webm');
    const initiated = await initiateFiles('normalize-batch-0001', [
      {
        clientUploadId: 'normalize-file-0001',
        originalName: 'source.webm',
        relativePath: 'source.webm',
        body: video,
        mimeType: 'video/webm',
      },
    ]);
    await uploadAll(initiated.sessions[0], video);
    await service.processBatch({ limit: 1 });
    await expect(
      service.get(organizationId, campaignId, initiated.sessions[0].id)
    ).resolves.toMatchObject({
      state: 'READY',
      normalizationApplied: true,
      asset: { mimeType: 'video/mp4', videoCodec: 'h264', normalized: true },
    });
  });

  it('quarantines an exact duplicate and never exposes another tenant asset or thumbnail', async () => {
    const original = await prisma.bulkAsset.findFirstOrThrow({
      where: { organizationId, state: 'READY' },
    });
    const privateRead = await new LocalPrivateMediaStorage(root).open(
      original.storageKey,
      null
    );
    const chunks: Buffer[] = [];
    for await (const chunk of privateRead.body) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const initiated = await initiateFiles('duplicate-batch-0001', [
      {
        clientUploadId: 'duplicate-file-0001',
        originalName: 'duplicate.mp4',
        relativePath: 'duplicate.mp4',
        body,
        mimeType: 'video/mp4',
      },
    ]);
    await uploadAll(initiated.sessions[0], body);
    await service.processBatch({ limit: 1 });
    await expect(
      service.get(organizationId, campaignId, initiated.sessions[0].id)
    ).resolves.toMatchObject({
      state: 'QUARANTINED',
      failureCode: 'duplicate_media',
      assetId: null,
    });
    await expect(
      service.get('another-tenant', campaignId, initiated.sessions[0].id)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.openThumbnail('another-tenant', original.id)
    ).rejects.toMatchObject({ status: 404 });
  });

  it('replays batch and part identities but rejects byte or body drift', async () => {
    const body = Buffer.from('12345678');
    const request = [
      {
        clientUploadId: 'idempotent-file-0001',
        originalName: 'idempotent.mp4',
        relativePath: 'idempotent.mp4',
        body,
        mimeType: 'video/mp4',
      },
    ];
    const first = await initiateFiles('idempotent-batch-0001', request);
    const replay = await initiateFiles('idempotent-batch-0001', request);
    expect(replay.replayed).toBe(true);
    expect(replay.sessions[0].id).toBe(first.sessions[0].id);
    await service.uploadPart({
      organizationId,
      campaignId,
      uploadId: first.sessions[0].id,
      partNumber: 0,
      body,
    });
    await expect(
      service.uploadPart({
        organizationId,
        campaignId,
        uploadId: first.sessions[0].id,
        partNumber: 0,
        body,
      })
    ).resolves.toMatchObject({ replayed: true });
    await expect(
      service.uploadPart({
        organizationId,
        campaignId,
        uploadId: first.sessions[0].id,
        partNumber: 0,
        body: Buffer.from('87654321'),
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'upload_part_mismatch' }),
    });
    await expect(
      initiateFiles('idempotent-batch-0001', [
        { ...request[0], originalName: 'changed.mp4' },
      ])
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'idempotency_key_reused' }),
    });
    await service.abort({
      organizationId,
      campaignId,
      uploadId: first.sessions[0].id,
    });
  });
});
