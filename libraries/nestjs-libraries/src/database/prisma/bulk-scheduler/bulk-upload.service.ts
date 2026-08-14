import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BulkUploadSessionState, Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fromFile } from 'file-type';
import {
  BULK_UPLOAD_CHUNK_BYTES,
  BULK_UPLOAD_STATES,
  expectedBulkUploadPartSize,
  validateBulkUploadBatch,
} from '@gitroom/helpers/bulk-scheduler/upload.contract';
import {
  PrivateMediaStorage,
  PrivateMediaStorageFactory,
} from '@gitroom/nestjs-libraries/upload/private-media.storage';
import {
  canonicalJson,
  sha256,
  validateIdempotencyKey,
} from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import {
  bulkPageLimit,
  decodeBulkCursor,
  encodeBulkCursor,
} from '@gitroom/helpers/bulk-scheduler/campaign.contract';
import { BulkUploadRepository } from './bulk-upload.repository';

const execFileAsync = promisify(execFile);
const PROCESSING_LEASE_MS = 45 * 60 * 1_000;

type VideoProbe = {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec: string;
  pixelFormat: string;
  audioCodec: string | null;
  formatName: string;
};

class UploadDataError extends Error {
  constructor(public readonly code: 'invalid_media' | 'normalization_failed', message: string) {
    super(message);
  }
}

class UploadInfrastructureError extends Error {}

function safeName(value: string) {
  return (
    value
      .replace(/[\\/]/g, '_')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 255) || 'video'
  );
}

function present(session: any) {
  return {
    id: session.id,
    campaignId: session.campaignId,
    clientUploadId: session.clientUploadId,
    originalName: session.originalName,
    relativePath: session.relativePath,
    declaredMimeType: session.declaredMimeType,
    expectedByteLength: session.expectedByteLength,
    chunkSize: session.chunkSize,
    totalParts: session.totalParts,
    receivedParts: session.receivedParts,
    receivedBytes: session.receivedBytes,
    uploadedPartNumbers: Array.isArray(session.parts)
      ? session.parts.map((part: any) => part.partNumber)
      : [],
    position: session.position,
    state: session.state,
    assetId: session.assetId,
    sha256: session.sha256,
    metadata: session.metadata,
    normalizationApplied: session.normalizationApplied,
    failureClass: session.failureClass,
    failureCode: session.failureCode,
    failureReason: session.failureReason,
    attemptCount: session.attemptCount,
    nextAttemptAt: session.nextAttemptAt,
    expiresAt: session.expiresAt,
    completedAt: session.completedAt,
    quarantinedAt: session.quarantinedAt,
    abortedAt: session.abortedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    asset: session.asset
      ? {
          id: session.asset.id,
          originalName: session.asset.originalName,
          mimeType: session.asset.mimeType,
          byteLength: session.asset.byteLength,
          sha256: session.asset.sha256,
          width: session.asset.width,
          height: session.asset.height,
          durationSeconds: session.asset.durationSeconds,
          videoCodec: session.asset.videoCodec,
          audioCodec: session.asset.audioCodec,
          normalized: session.asset.normalized,
        }
      : null,
  };
}

function commandInfrastructureFailure(error: unknown) {
  const candidate = error as NodeJS.ErrnoException;
  return ['ENOENT', 'ENOMEM', 'ENOSPC', 'EACCES'].includes(candidate?.code || '');
}

@Injectable()
export class BulkUploadService {
  private readonly logger = new Logger(BulkUploadService.name);
  private storage?: PrivateMediaStorage;

  constructor(private _repository: BulkUploadRepository) {}

  useStorageForTesting(storage: PrivateMediaStorage) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Bulk upload storage can only be replaced in tests.');
    }
    this.storage = storage;
  }

  private getStorage() {
    this.storage ||= PrivateMediaStorageFactory.create();
    return this.storage;
  }

  async initiate(input: {
    organizationId: string;
    campaignId: string;
    userId?: string;
    idempotencyKey: unknown;
    body: unknown;
    now?: Date;
  }) {
    if (!validateIdempotencyKey(input.idempotencyKey)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason: 'Idempotency-Key must contain 8-200 safe characters.',
      });
    }
    const validation = validateBulkUploadBatch(input.body);
    if (validation.valid === false) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: validation.code,
        reason: validation.reason,
      });
    }
    const now = input.now || new Date();
    const batchKeyHash = sha256(
      `${input.organizationId}:${input.campaignId}:${input.idempotencyKey}`
    );
    const batchRequestHash = sha256(canonicalJson(validation.value));
    const result = await this._repository.initiateBatch({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      userId: input.userId,
      batchKeyHash,
      batchRequestHash,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000),
      files: validation.value.files.map((file) => {
        const id = `bulk_upload_${sha256(
          `${input.organizationId}:${input.campaignId}:${file.clientUploadId}`
        ).slice(0, 32)}`;
        return {
          id,
          clientUploadId: file.clientUploadId,
          originalName: safeName(file.originalName),
          relativePath: file.relativePath,
          declaredMimeType: file.mimeType,
          expectedByteLength: file.byteLength,
          chunkSize: BULK_UPLOAD_CHUNK_BYTES,
          totalParts: Math.ceil(file.byteLength / BULK_UPLOAD_CHUNK_BYTES),
          storagePrefix: `staging/${sha256(input.organizationId).slice(0, 24)}/${sha256(
            input.campaignId
          ).slice(0, 24)}/${id}`,
        };
      }),
    });
    if (result.type === 'not_found') throw new NotFoundException('Campaign not found.');
    if (result.type === 'terminal') {
      throw new ConflictException({
        failureClass: 'user_action_needed',
        code: 'campaign_terminal',
        reason: `A ${result.state.toLowerCase()} campaign cannot accept uploads.`,
      });
    }
    if (result.type === 'idempotency_mismatch') {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'idempotency_key_reused',
        reason: 'This Idempotency-Key was already used for a different file batch.',
      });
    }
    if (result.type === 'client_id_reused') {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'client_upload_id_reused',
        reason: `Client upload ID ${result.clientUploadId} already identifies another file in this campaign.`,
      });
    }
    if (result.type === 'campaign_limit') {
      throw new UnprocessableEntityException({
        failureClass: 'data_problem',
        code: 'campaign_item_limit',
        reason: 'A campaign cannot contain more than 100,000 upload items.',
        currentCount: result.currentCount,
      });
    }
    Sentry.metrics.count('bulk_upload_sessions_initiated', result.sessions.length);
    return {
      replayed: result.type === 'replay',
      sessions: result.sessions.map(present),
    };
  }

  async get(organizationId: string, campaignId: string, uploadId: string) {
    const session = await this._repository.get(organizationId, campaignId, uploadId);
    if (!session) throw new NotFoundException('Upload not found.');
    return present(session);
  }

  async list(input: {
    organizationId: string;
    campaignId: string;
    state?: string;
    cursor?: string;
    limit?: unknown;
  }) {
    if (input.state && !BULK_UPLOAD_STATES.includes(input.state as any)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_upload_state',
        reason: 'The upload state filter is invalid.',
      });
    }
    let cursor;
    let limit;
    try {
      cursor = decodeBulkCursor(input.cursor, 'upload');
      limit = bulkPageLimit(input.limit);
    } catch {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_cursor',
        reason: 'The upload cursor or limit is invalid.',
      });
    }
    const rows = await this._repository.list({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      state: input.state as BulkUploadSessionState | undefined,
      cursor,
      limit,
    });
    if (!rows) throw new NotFoundException('Campaign not found.');
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items.at(-1);
    return {
      items: items.map(present),
      nextCursor:
        hasMore && last
          ? encodeBulkCursor({ kind: 'upload', timestamp: last.createdAt, id: last.id })
          : null,
    };
  }

  async uploadPart(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    partNumber: unknown;
    body: Buffer;
    now?: Date;
  }) {
    const session = await this._repository.get(
      input.organizationId,
      input.campaignId,
      input.uploadId
    );
    if (!session) throw new NotFoundException('Upload not found.');
    const partNumber = Number(input.partNumber);
    const expected = expectedBulkUploadPartSize({
      expectedByteLength: session.expectedByteLength,
      chunkSize: session.chunkSize,
      totalParts: session.totalParts,
      partNumber,
    });
    if (!Buffer.isBuffer(input.body) || expected === null || input.body.length !== expected) {
      throw new UnprocessableEntityException({
        failureClass: 'data_problem',
        code: 'invalid_upload_part',
        reason:
          expected === null
            ? 'The upload part number is outside this session.'
            : `Part ${partNumber} must contain exactly ${expected} bytes.`,
      });
    }
    if (session.expiresAt <= (input.now || new Date())) {
      await this.expireAndClean(session, input.now || new Date());
      throw new HttpException(
        {
          failureClass: 'recoverable',
          code: 'upload_expired',
          reason: 'This upload expired; initiate a new resumable file session.',
        },
        HttpStatus.GONE
      );
    }
    const digest = createHash('sha256').update(input.body).digest('hex');
    const storageKey = `${session.storagePrefix}/parts/${partNumber}/${digest}`;
    await this.getStorage().put(storageKey, input.body, 'application/octet-stream');
    let result;
    try {
      result = await this._repository.recordPart({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        uploadId: input.uploadId,
        partNumber,
        storageKey,
        byteLength: input.body.length,
        sha256: digest,
        now: input.now || new Date(),
      });
    } catch (error) {
      await this.getStorage().remove(storageKey).catch(() => undefined);
      throw error;
    }
    if (result.type === 'not_found') {
      await this.getStorage().remove(storageKey).catch(() => undefined);
      throw new NotFoundException('Upload not found.');
    }
    if (result.type === 'mismatch') {
      await this.getStorage().remove(storageKey).catch(() => undefined);
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'upload_part_mismatch',
        reason: `Part ${partNumber} was already received with different bytes.`,
      });
    }
    if (result.type === 'expired') {
      await this.getStorage().remove(storageKey).catch(() => undefined);
      await this.expireAndClean(result.session, input.now || new Date());
      throw new HttpException(
        { failureClass: 'recoverable', code: 'upload_expired', reason: 'This upload expired.' },
        HttpStatus.GONE
      );
    }
    if (result.type === 'not_uploading') {
      if (result.session.state !== 'READY') {
        await this.getStorage().remove(storageKey).catch(() => undefined);
      }
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'upload_not_accepting_parts',
        reason: `This upload is ${result.session.state.toLowerCase()} and cannot accept new chunks.`,
      });
    }
    Sentry.metrics.count(
      result.type === 'replay' ? 'bulk_upload_part_replayed' : 'bulk_upload_part_stored',
      1
    );
    return {
      uploadId: input.uploadId,
      partNumber,
      byteLength: input.body.length,
      sha256: digest,
      replayed: result.type === 'replay',
    };
  }

  async complete(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    now?: Date;
  }) {
    const result = await this._repository.requestCompletion({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      uploadId: input.uploadId,
      now: input.now || new Date(),
    });
    if (result.type === 'not_found') throw new NotFoundException('Upload not found.');
    if (result.type === 'incomplete') {
      throw new ConflictException({
        failureClass: 'recoverable',
        code: 'upload_incomplete',
        reason: `${result.missingParts.length} upload part(s) are still missing.`,
        missingParts: result.missingParts,
        receivedBytes: result.session.receivedBytes,
        expectedByteLength: result.session.expectedByteLength,
      });
    }
    if (result.type === 'terminal') {
      throw new ConflictException({
        failureClass: result.session.failureClass || 'data_problem',
        code: result.session.failureCode || 'upload_not_completable',
        reason: result.session.failureReason || `This upload is ${result.session.state.toLowerCase()}.`,
      });
    }
    if (result.type === 'race') {
      throw new ConflictException({
        failureClass: 'recoverable',
        code: 'upload_state_race',
        reason: 'The upload changed concurrently. Reload and retry.',
      });
    }
    return { accepted: true, replayed: result.type === 'replay', upload: present(result.session) };
  }

  async abort(input: {
    organizationId: string;
    campaignId: string;
    uploadId: string;
    userId?: string;
  }) {
    const result = await this._repository.abort({ ...input, now: new Date() });
    if (result.type === 'not_found') throw new NotFoundException('Upload not found.');
    if (result.type === 'aborted') await this.cleanupSessionObjects(result.session, true);
    return { replayed: result.type === 'replay', upload: present(result.session) };
  }

  private async expireAndClean(session: any, now: Date) {
    const result = await this._repository.expire({
      organizationId: session.organizationId,
      campaignId: session.campaignId,
      uploadId: session.id,
      now,
    });
    if (result.type === 'expired') await this.cleanupSessionObjects(result.session, true);
  }

  private async cleanupSessionObjects(session: any, includeAssembled: boolean) {
    const keys = (session.parts || []).map((part: any) => part.storageKey);
    if (includeAssembled) keys.push(`${session.storagePrefix}/assembled/source`);
    await Promise.allSettled(keys.map((key: string) => this.getStorage().remove(key)));
  }

  private async probeVideo(filePath: string): Promise<VideoProbe> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        process.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type,codec_name,width,height,pix_fmt:format=duration,format_name',
          '-of',
          'json',
          filePath,
        ],
        { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }
      ));
    } catch (error) {
      if (commandInfrastructureFailure(error)) {
        throw new UploadInfrastructureError('The video inspection worker is unavailable.');
      }
      throw new UploadDataError('invalid_media', 'FFprobe could not decode this video.');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(stdout || '{}');
    } catch {
      throw new UploadInfrastructureError('The video inspection worker returned invalid metadata.');
    }
    const video = parsed.streams?.find((stream: any) => stream.codec_type === 'video');
    const audio = parsed.streams?.find((stream: any) => stream.codec_type === 'audio');
    const width = Number(video?.width);
    const height = Number(video?.height);
    const durationSeconds = Number(parsed.format?.duration);
    if (
      !video ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 16 ||
      height < 16 ||
      width > 8192 ||
      height > 8192 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > 12 * 60 * 60
    ) {
      throw new UploadDataError(
        'invalid_media',
        'The video needs a decodable 16-8192 pixel video stream and a duration no longer than 12 hours.'
      );
    }
    return {
      width,
      height,
      durationSeconds,
      videoCodec: String(video.codec_name || ''),
      pixelFormat: String(video.pix_fmt || ''),
      audioCodec: audio?.codec_name ? String(audio.codec_name) : null,
      formatName: String(parsed.format?.format_name || ''),
    };
  }

  private needsNormalization(mimeType: string, probe: VideoProbe) {
    return (
      mimeType !== 'video/mp4' ||
      probe.videoCodec !== 'h264' ||
      !['yuv420p', 'yuvj420p'].includes(probe.pixelFormat) ||
      (probe.audioCodec !== null && probe.audioCodec !== 'aac')
    );
  }

  private async runFfmpeg(args: string[], operation: string) {
    try {
      await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', args, {
        timeout: 30 * 60 * 1_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      if (commandInfrastructureFailure(error)) {
        throw new UploadInfrastructureError(`The ${operation} worker is unavailable.`);
      }
      throw new UploadDataError('normalization_failed', `The video ${operation} step could not decode this file.`);
    }
  }

  private async digestFile(filePath: string) {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) digest.update(chunk as Buffer);
    return digest.digest('hex');
  }

  private async processClaim(input: {
    organizationId: string;
    uploadId: string;
    claimTokenHash: string;
    now: Date;
  }) {
    const session = await this._repository.getProcessingContext(input);
    if (!session) return { type: 'claim_lost' as const };
    const directory = await mkdtemp(path.join(os.tmpdir(), 'publishly-bulk-upload-'));
    const assembledKey = `${session.storagePrefix}/assembled/source`;
    const inputFile = path.join(directory, 'input.video');
    const normalizedFile = path.join(directory, 'normalized.mp4');
    const thumbnailFile = path.join(directory, 'thumbnail.webp');
    try {
      if (
        session.parts.length !== session.totalParts ||
        session.parts.reduce((sum, part) => sum + part.byteLength, 0) !==
          session.expectedByteLength
      ) {
        throw new UploadDataError('invalid_media', 'The durable part ledger does not match the declared file size.');
      }
      await this.getStorage().compose(
        assembledKey,
        session.parts.map((part) => part.storageKey),
        session.declaredMimeType || 'application/octet-stream'
      );
      const opened = await this.getStorage().open(assembledKey, null);
      if (opened.contentLength !== session.expectedByteLength) {
        throw new UploadDataError('invalid_media', 'The composed file size does not match its upload ledger.');
      }
      await pipeline(opened.body, createWriteStream(inputFile, { mode: 0o600 }));
      const moved = await this._repository.setProcessingState({
        organizationId: input.organizationId,
        uploadId: input.uploadId,
        claimTokenHash: input.claimTokenHash,
        state: 'VALIDATING',
      });
      if (moved.count !== 1) return { type: 'claim_lost' as const };
      const detected = await fromFile(inputFile);
      if (!detected?.mime.startsWith('video/')) {
        throw new UploadDataError('invalid_media', 'Byte inspection did not identify a supported video file.');
      }
      const initialProbe = await this.probeVideo(inputFile);
      let finalFile = inputFile;
      let normalized = false;
      if (this.needsNormalization(detected.mime, initialProbe)) {
        const normalizing = await this._repository.setProcessingState({
          organizationId: input.organizationId,
          uploadId: input.uploadId,
          claimTokenHash: input.claimTokenHash,
          state: 'NORMALIZING',
          metadata: { detectedMimeType: detected.mime, initialProbe } as Prisma.InputJsonValue,
        });
        if (normalizing.count !== 1) return { type: 'claim_lost' as const };
        await this.runFfmpeg(
          [
            '-y',
            '-i',
            inputFile,
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-preset',
            'medium',
            '-crf',
            '23',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-movflags',
            '+faststart',
            normalizedFile,
          ],
          'normalization'
        );
        finalFile = normalizedFile;
        normalized = true;
      }
      const finalProbe = await this.probeVideo(finalFile);
      if (this.needsNormalization('video/mp4', finalProbe)) {
        throw new UploadDataError(
          'normalization_failed',
          'The normalized output did not meet the canonical H.264/AAC MP4 profile.'
        );
      }
      await this.runFfmpeg(
        [
          '-y',
          '-ss',
          '0.1',
          '-i',
          finalFile,
          '-frames:v',
          '1',
          '-vf',
          'scale=512:-2:force_original_aspect_ratio=decrease',
          thumbnailFile,
        ],
        'thumbnail generation'
      );
      const [digest, details, thumbnail] = await Promise.all([
        this.digestFile(finalFile),
        stat(finalFile),
        readFile(thumbnailFile),
      ]);
      if (details.size < 1 || details.size > 1024 * 1024 * 1024) {
        throw new UploadDataError('normalization_failed', 'The canonical video exceeds the 1 GiB asset limit.');
      }
      const duplicate = await this._repository.findDuplicateHash(
        input.organizationId,
        digest
      );
      if (duplicate) {
        const outcome = await this._repository.markProcessingFailure({
          organizationId: input.organizationId,
          uploadId: input.uploadId,
          claimTokenHash: input.claimTokenHash,
          failureClass: 'data_problem',
          code: 'duplicate_media',
          reason: `This file duplicates existing asset ${duplicate.id}; it was not added twice.`,
          quarantine: true,
          now: input.now,
        });
        await this.cleanupSessionObjects(session, true);
        return { type: 'duplicate' as const, outcome };
      }
      const assetId = `bulk_asset_${sha256(`${input.organizationId}:${digest}`).slice(0, 32)}`;
      const organizationSegment = sha256(input.organizationId).slice(0, 32);
      const finalKey = `bulk/${organizationSegment}/${assetId}/${digest}.mp4`;
      const thumbnailKey = `bulk/${organizationSegment}/${assetId}/${digest}.webp`;
      await this.getStorage().putFile(finalKey, finalFile, 'video/mp4');
      await this.getStorage().put(thumbnailKey, thumbnail, 'image/webp');
      const metadata = {
        schemaVersion: 1,
        detectedMimeType: detected.mime,
        initialProbe,
        finalProbe,
        relativePath: session.relativePath,
        normalized,
      } as Prisma.InputJsonValue;
      const result = await this._repository.finalizeReady({
        organizationId: input.organizationId,
        uploadId: input.uploadId,
        claimTokenHash: input.claimTokenHash,
        asset: {
          id: assetId,
          storageKey: finalKey,
          mimeType: 'video/mp4',
          byteLength: details.size,
          sha256: digest,
          width: finalProbe.width,
          height: finalProbe.height,
          durationSeconds: finalProbe.durationSeconds,
          videoCodec: finalProbe.videoCodec,
          audioCodec: finalProbe.audioCodec,
          thumbnailStorageKey: thumbnailKey,
          metadata,
          normalized,
        },
        now: input.now,
      });
      if (result.type === 'ready' || result.type === 'duplicate') {
        await this.cleanupSessionObjects(session, true);
      }
      return result;
    } catch (error) {
      const quarantine = error instanceof UploadDataError;
      const code = quarantine ? error.code : 'upload_processing_failed';
      const reason = quarantine
        ? error.message
        : 'Publishly could not process this private upload. It will retry automatically without losing received chunks.';
      const outcome = await this._repository.markProcessingFailure({
        organizationId: input.organizationId,
        uploadId: input.uploadId,
        claimTokenHash: input.claimTokenHash,
        failureClass: quarantine ? 'data_problem' : 'recoverable',
        code,
        reason,
        quarantine,
        now: input.now,
      });
      if (quarantine || (outcome.type === 'recorded' && outcome.state === 'FINAL_FAILURE')) {
        await this.cleanupSessionObjects(session, true);
      }
      this.logger[quarantine ? 'warn' : 'error']({
        event: 'bulk_upload_processing_outcome',
        organizationId: input.organizationId,
        uploadId: input.uploadId,
        state: outcome.type === 'recorded' ? outcome.state : 'CLAIM_LOST',
        code,
        reason,
      });
      return { type: 'failed' as const, outcome };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async processBatch(input: { now?: Date; limit?: number } = {}) {
    const now = input.now || new Date();
    const claimTokenHash = createHash('sha256')
      .update(randomBytes(32))
      .digest('hex');
    const claimed = await this._repository.claimProcessing({
      now,
      leaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
      claimTokenHash,
      limit: input.limit || 2,
    });
    const outcomes = [];
    for (const session of claimed) {
      outcomes.push(
        await this.processClaim({
          organizationId: session.organizationId,
          uploadId: session.id,
          claimTokenHash,
          now: new Date(),
        })
      );
    }
    Sentry.metrics.count('bulk_upload_processing_claimed', claimed.length);
    return { claimed: claimed.length, outcomes };
  }

  async openThumbnail(organizationId: string, assetId: string) {
    const asset = await this._repository.findAsset(organizationId, assetId);
    if (!asset?.thumbnailStorageKey) throw new NotFoundException('Thumbnail not found.');
    try {
      return await this.getStorage().open(asset.thumbnailStorageKey, null);
    } catch {
      throw new ServiceUnavailableException({
        failureClass: 'recoverable',
        code: 'thumbnail_unavailable',
        reason: 'The private thumbnail could not be read. Retry shortly.',
      });
    }
  }
}
