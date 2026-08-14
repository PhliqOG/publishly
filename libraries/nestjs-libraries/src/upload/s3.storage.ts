import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { IUploadProvider } from './upload.interface';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { parseDataUrl } from '@gitroom/nestjs-libraries/upload/data.url';
import { fromBuffer } from 'file-type';

export const OBJECT_STORAGE_ALLOWED_MIME = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

export type S3StorageConfig = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  forcePathStyle?: boolean;
};

/** S3-compatible object storage with content-addressed, safe object names. */
export class S3Storage implements IUploadProvider {
  private readonly client: S3Client;
  private readonly publicUrl: string;

  constructor(private readonly config: S3StorageConfig) {
    this.publicUrl = config.publicUrl.replace(/\/$/, '');
    this.client = new S3Client({
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  private async validate(body: Buffer) {
    const detected = await fromBuffer(body);
    if (!detected || !OBJECT_STORAGE_ALLOWED_MIME.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }
    return detected as { ext: string; mime: string };
  }

  private keyFor(body: Buffer, extension: string) {
    const digest = crypto.createHash('sha256').update(body).digest('hex');
    return `media/${digest.slice(0, 2)}/${digest}.${extension}`;
  }

  private async put(body: Buffer) {
    const detected = await this.validate(body);
    const key = this.keyFor(body, detected.ext);
    const digest = key.split('/').pop()!.split('.')[0];
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: detected.mime,
        Metadata: { sha256: digest },
      })
    );
    return { key, mime: detected.mime };
  }

  async uploadSimple(source: string) {
    const dataUrl = source.startsWith('data:') ? parseDataUrl(source) : null;
    let body: Buffer;
    if (dataUrl) {
      body = dataUrl.buffer;
    } else {
      if (!(await isSafePublicHttpsUrl(source))) {
        throw new Error('Unsafe URL');
      }
      const response = await fetch(source, {
        // @ts-ignore - undici dispatcher is not represented by lib.dom
        dispatcher: ssrfSafeDispatcher,
      });
      if (!response.ok) {
        throw new Error(`Remote media returned HTTP ${response.status}`);
      }
      const advertised = Number(response.headers.get('content-length') || 0);
      if (advertised > 1024 * 1024 * 1024) {
        throw new Error('Remote media exceeds the 1 GB upload limit.');
      }
      body = Buffer.from(await response.arrayBuffer());
    }
    const uploaded = await this.put(body);
    return `${this.publicUrl}/${uploaded.key}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    const uploaded = await this.put(file.buffer);
    const filename = uploaded.key.split('/').pop()!;
    return {
      filename,
      mimetype: uploaded.mime,
      size: file.buffer.length,
      originalname: filename,
      fieldname: 'file',
      path: `${this.publicUrl}/${uploaded.key}`,
      destination: `${this.publicUrl}/${uploaded.key}`,
      encoding: '7bit',
    };
  }

  async removeFile(filePath: string): Promise<void> {
    const expectedPrefix = `${this.publicUrl}/`;
    if (!filePath.startsWith(expectedPrefix)) {
      throw new Error('Refusing to delete an object outside the configured bucket');
    }
    const key = decodeURIComponent(filePath.slice(expectedPrefix.length));
    if (!key || key.includes('..') || key.startsWith('/')) {
      throw new Error('Invalid object key');
    }
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })
    );
  }
}
