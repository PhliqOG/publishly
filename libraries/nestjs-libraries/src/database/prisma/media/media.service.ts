import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  MediaMetadata,
  MediaRepository,
} from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { getMaxSize } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import { Readable } from 'stream';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fromBuffer } from 'file-type';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
const execFileAsync = promisify(execFile);

const REMOTE_MEDIA_ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
]);

type InspectedMedia = MediaMetadata & {
  mimeType: string;
  sha256: string;
  thumbnailBuffer?: Buffer;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  async cleanupDeletedMedia(retentionDays = 30) {
    const before = new Date(
      Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
    );
    const candidates = await this._mediaRepository.listDeletedBefore(before);
    let removed = 0;
    let retained = 0;
    for (const media of candidates) {
      const references = await this._mediaRepository.hasActivePostReference(
        media.organizationId,
        media.id,
        media.path
      );
      if (references > 0) {
        retained++;
        continue;
      }
      try {
        if (media.thumbnail && media.thumbnail !== media.path) {
          await this.storage.removeFile(media.thumbnail);
        }
        await this.storage.removeFile(media.path);
        await this._mediaRepository.hardDelete(media.organizationId, media.id);
        removed++;
      } catch {
        // Leave the row in place. The next bounded cleanup run retries it and
        // operators retain visibility instead of losing the storage pointer.
        retained++;
      }
    }
    return { scanned: candidates.length, removed, retained };
  }

  getMediaById(organizationId: string, id: string) {
    return this._mediaRepository.getMediaById(organizationId, id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    try {
      const generating = await this._subscriptionService.useCredit(
        org,
        'ai_images',
        async () => {
          if (generatePromptFirst) {
            prompt = await this._openAi.generatePromptForPicture(prompt);
            console.log('Prompt:', prompt);
          }
          return this._openAi.generateImage(prompt);
        }
      );

      return generating;
    } catch (err) {
      throw generationError(err);
    }
  }

  saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    fileSize = 0,
    type = 'image',
    metadata: MediaMetadata = {}
  ) {
    return this._mediaRepository.saveFile(
      org,
      fileName,
      filePath,
      originalName,
      fileSize,
      type,
      metadata
    );
  }

  private async inspectBuffer(buffer: Buffer): Promise<InspectedMedia> {
    const detected = await fromBuffer(buffer);
    if (!detected || !REMOTE_MEDIA_ALLOWED_MIME.has(detected.mime)) {
      throw new HttpException('Unsupported media type', 400);
    }
    const base: InspectedMedia = {
      mimeType: detected.mime,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      metadataStatus: 'READY',
    };

    if (detected.mime.startsWith('image/')) {
      const metadata = await sharp(buffer).metadata();
      const rotatesDimensions = [5, 6, 7, 8].includes(
        Number(metadata.orientation || 0)
      );
      return {
        ...base,
        width: rotatesDimensions ? metadata.height : metadata.width,
        height: rotatesDimensions ? metadata.width : metadata.height,
        thumbnailBuffer: await sharp(buffer, { animated: false })
          .rotate()
          .resize({
            width: 512,
            height: 512,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer(),
      };
    }

    if (detected.mime === 'video/mp4') {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'publishly-media-')
      );
      const input = path.join(directory, `input.${detected.ext}`);
      const preview = path.join(directory, 'preview.webp');
      try {
        await writeFile(input, buffer);
        const { stdout } = await execFileAsync(
          process.env.FFPROBE_PATH || 'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height:format=duration',
            '-of',
            'json',
            input,
          ],
          { timeout: 30_000, maxBuffer: 1024 * 1024 }
        );
        const probe = JSON.parse(stdout || '{}');
        const stream = probe.streams?.[0] || {};

        let thumbnailBuffer: Buffer | undefined;
        try {
          await execFileAsync(
            process.env.FFMPEG_PATH || 'ffmpeg',
            [
              '-y',
              '-ss',
              '0.1',
              '-i',
              input,
              '-frames:v',
              '1',
              '-vf',
              'scale=512:-2:force_original_aspect_ratio=decrease',
              preview,
            ],
            { timeout: 45_000, maxBuffer: 2 * 1024 * 1024 }
          );
          thumbnailBuffer = await readFile(preview);
        } catch (error) {
          // Metadata still remains useful when this ffmpeg build cannot decode
          // a particular codec. The UI can display a neutral video preview.
          this.logger.warn({
            event: 'media_thumbnail_generation_failed',
            code: 'media_thumbnail_partial',
            reason:
              error instanceof Error && error.message
                ? error.message
                : 'FFmpeg could not generate a video thumbnail.',
          });
        }

        return {
          ...base,
          width: Number(stream.width) || null,
          height: Number(stream.height) || null,
          durationSeconds: Number(probe.format?.duration) || null,
          thumbnailBuffer,
          metadataStatus: thumbnailBuffer ? 'READY' : 'PARTIAL',
        };
      } catch (error) {
        this.logger.warn({
          event: 'media_metadata_probe_failed',
          code: 'media_metadata_partial',
          reason:
            error instanceof Error && error.message
              ? error.message
              : 'FFprobe could not inspect the uploaded video.',
        });
        return { ...base, metadataStatus: 'PARTIAL' };
      } finally {
        await rm(directory, { recursive: true, force: true }).catch((error) => {
          this.logger.warn({
            event: 'media_temporary_cleanup_failed',
            code: 'media_temporary_cleanup_failed',
            reason:
              error instanceof Error && error.message
                ? error.message
                : 'The temporary media directory could not be removed.',
          });
        });
      }
    }

    return base;
  }

  async uploadAndSave(
    organizationId: string,
    file: Express.Multer.File,
    originalName = file.originalname
  ) {
    const inspected = await this.inspectBuffer(file.buffer);
    const duplicate = await this._mediaRepository.findDuplicate(
      organizationId,
      inspected.sha256
    );
    if (duplicate) {
      return duplicate;
    }

    const thumbnailSize = inspected.thumbnailBuffer?.length || 0;
    await this.assertStorageQuota(
      organizationId,
      file.buffer.length + thumbnailSize
    );
    const uploaded = await this.storage.uploadFile({
      ...file,
      size: file.buffer.length,
      mimetype: inspected.mimeType,
    });
    let thumbnail: string | null = null;
    if (inspected.thumbnailBuffer) {
      const uploadedThumbnail = await this.storage.uploadFile({
        ...file,
        buffer: inspected.thumbnailBuffer,
        size: inspected.thumbnailBuffer.length,
        mimetype: 'image/webp',
        originalname: 'thumbnail.webp',
      });
      thumbnail = uploadedThumbnail.path;
    }

    const { thumbnailBuffer: _thumbnailBuffer, ...metadata } = inspected;
    return this.saveFile(
      organizationId,
      uploaded.originalname,
      uploaded.path,
      originalName,
      file.buffer.length,
      inspected.mimeType.startsWith('video/') ? 'video' : 'image',
      {
        ...metadata,
        thumbnail,
        thumbnailFileSize: thumbnailSize,
      }
    );
  }

  async uploadDataUrl(
    organizationId: string,
    dataUrl: string,
    originalName = 'generated-image'
  ) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      throw new HttpException('Invalid generated media payload', 400);
    }
    return this.uploadAndSave(organizationId, {
      buffer: parsed.buffer,
      mimetype: parsed.mime,
      size: parsed.buffer.length,
      path: '',
      fieldname: 'file',
      destination: '',
      stream: new Readable(),
      filename: '',
      originalname: originalName,
      encoding: '7bit',
    });
  }

  async assertStorageQuota(organizationId: string, incomingBytes: number) {
    const subscription = await this._subscriptionService.getSubscription(
      organizationId
    );
    const tier =
      subscription?.subscriptionTier ||
      (!process.env.STRIPE_PUBLISHABLE_KEY ? 'ULTIMATE' : 'FREE');
    const limit = Math.floor(pricing[tier].storage_gb * 1024 * 1024 * 1024);
    const used = await this._mediaRepository.getStorageUsage(organizationId);
    if (incomingBytes < 0 || used + incomingBytes > limit) {
      throw new HttpException(
        {
          message: 'Workspace media storage quota exceeded',
          usedBytes: used,
          limitBytes: limit,
        },
        402
      );
    }
    return { usedBytes: used, limitBytes: limit };
  }

  /**
   * Import a public HTTPS asset without trusting its URL, filename, headers,
   * or advertised size. Large files should use the signed multipart uploader;
   * this bounded path exists for the public API and asynchronous CSV imports.
   */
  async importFromUrl(organizationId: string, sourceUrl: string) {
    if (!(await isSafePublicHttpsUrl(sourceUrl))) {
      throw new HttpException('Media URL must be public HTTPS', 400);
    }

    let response: globalThis.Response;
    try {
      response = await fetch(sourceUrl, {
        // @ts-ignore - undici dispatcher is not represented by lib.dom
        dispatcher: ssrfSafeDispatcher,
      });
    } catch {
      throw new HttpException('Failed to fetch media URL', 400);
    }
    if (
      !response.ok ||
      !response.body ||
      !response.url.startsWith('https://')
    ) {
      throw new HttpException('Failed to fetch media URL', 400);
    }

    const parsedLimit = Number(process.env.REMOTE_MEDIA_MAX_BYTES);
    const configuredLimit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? parsedLimit
        : 100 * 1024 * 1024;
    const hardLimit = Math.max(
      1,
      Math.min(configuredLimit, getMaxSize('video/mp4'))
    );
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > hardLimit) {
      throw new HttpException(
        'Remote media is too large; use signed multipart upload',
        400
      );
    }

    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > hardLimit) {
        await reader.cancel();
        throw new HttpException(
          'Remote media is too large; use signed multipart upload',
          400
        );
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const detected = await fromBuffer(buffer);
    if (!detected || !REMOTE_MEDIA_ALLOWED_MIME.has(detected.mime)) {
      throw new HttpException('Unsupported media type', 400);
    }
    if (buffer.length > getMaxSize(detected.mime)) {
      throw new HttpException('Media exceeds the allowed size', 400);
    }

    return this.uploadAndSave(organizationId, {
      buffer,
      mimetype: detected.mime,
      size: buffer.length,
      path: '',
      fieldname: 'file',
      destination: '',
      stream: new Readable(),
      filename: '',
      originalname: `remote.${detected.ext}`,
      encoding: '7bit',
    });
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const totalCredits = await this._subscriptionService.checkCredits(
        org,
        'ai_videos'
      );

      if (totalCredits.credits <= 0) {
        throw new SubscriptionException({
          action: AuthorizationActions.Create,
          section: Sections.VIDEOS_PER_MONTH,
        });
      }

      const video = this._videoManager.getVideoByName(body.type);
      if (!video) {
        throw new Error(`Video type ${body.type} not found`);
      }

      if (!video.trial && org.isTrailing) {
        throw new HttpException(
          'This video is not available in trial mode',
          406
        );
      }

      console.log(body.customParams);
      await video.instance.processAndValidate(body.customParams);
      console.log('no err');

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            body.output,
            body.customParams
          );

          return String(loadedData).startsWith('data:')
            ? this.uploadDataUrl(org.id, loadedData, 'generated-video.mp4')
            : this.importFromUrl(org.id, loadedData);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
