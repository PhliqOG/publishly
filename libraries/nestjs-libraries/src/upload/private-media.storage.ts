import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  open as openFsFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

export type PrivateMediaRange = { start: number; end: number } | null;

export type PrivateMediaHead = {
  contentLength: number;
  contentType: string;
  etag?: string;
};

export type PrivateMediaRead = PrivateMediaHead & {
  body: Readable;
  contentRange?: string;
};

export interface PrivateMediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  compose(key: string, partKeys: string[], contentType: string): Promise<void>;
  head(key: string): Promise<PrivateMediaHead>;
  open(key: string, range: PrivateMediaRange): Promise<PrivateMediaRead>;
  remove(key: string): Promise<void>;
}

export function assertPrivateStorageKey(key: string) {
  if (
    !key ||
    key.length > 500 ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    !/^[A-Za-z0-9._/-]+$/.test(key)
  ) {
    throw new Error('Invalid private media storage key.');
  }
  return key;
}

export class LocalPrivateMediaStorage implements PrivateMediaStorage {
  private readonly root: string;

  constructor(root: string) {
    if (!root) throw new Error('BULK_PRIVATE_UPLOAD_DIRECTORY is required.');
    this.root = path.resolve(root);
  }

  private resolve(key: string) {
    assertPrivateStorageKey(key);
    const resolved = path.resolve(this.root, ...key.split('/'));
    if (resolved === this.root || !resolved.startsWith(this.root + path.sep)) {
      throw new Error('Private media path escaped its storage root.');
    }
    return resolved;
  }

  async put(key: string, body: Buffer, _contentType: string) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body, { flag: 'w', mode: 0o600 });
  }

  async putFile(key: string, filePath: string, _contentType: string) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(filePath, target);
    await chmod(target, 0o600);
  }

  async compose(key: string, partKeys: string[], _contentType: string) {
    if (!partKeys.length) throw new Error('Private media composition needs parts.');
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const output = await openFsFile(target, 'w', 0o600);
    try {
      for (const partKey of partKeys) {
        const input = await openFsFile(this.resolve(partKey), 'r');
        try {
          for await (const chunk of input.createReadStream({ autoClose: false })) {
            await output.write(chunk as Buffer);
          }
        } finally {
          await input.close();
        }
      }
    } catch (error) {
      await output.close().catch(() => undefined);
      await unlink(target).catch(() => undefined);
      throw error;
    }
    await output.close();
    await chmod(target, 0o600);
  }

  async head(key: string): Promise<PrivateMediaHead> {
    const details = await stat(this.resolve(key));
    if (!details.isFile()) throw new Error('Private media object is not a file.');
    const extension = path.extname(key).toLowerCase();
    const contentType =
      extension === '.mp4'
        ? 'video/mp4'
        : extension === '.webp'
        ? 'image/webp'
        : 'application/octet-stream';
    return { contentLength: details.size, contentType };
  }

  async open(key: string, range: PrivateMediaRange): Promise<PrivateMediaRead> {
    const metadata = await this.head(key);
    const selected = range || { start: 0, end: metadata.contentLength - 1 };
    if (
      selected.start < 0 ||
      selected.end < selected.start ||
      selected.end >= metadata.contentLength
    ) {
      throw new Error('Private media byte range is outside the object.');
    }
    return {
      contentLength: selected.end - selected.start + 1,
      contentType: metadata.contentType,
      ...(range
        ? {
            contentRange: `bytes ${selected.start}-${selected.end}/${metadata.contentLength}`,
          }
        : {}),
      body: createReadStream(this.resolve(key), {
        start: selected.start,
        end: selected.end,
      }),
    };
  }

  async remove(key: string) {
    try {
      await unlink(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

export type PrivateS3MediaStorageConfig = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
};

export class PrivateS3MediaStorage implements PrivateMediaStorage {
  private readonly client: S3Client;

  constructor(private readonly config: PrivateS3MediaStorageConfig) {
    if (!config.bucket) throw new Error('BULK_PRIVATE_S3_BUCKET is required.');
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

  async put(key: string, body: Buffer, contentType: string) {
    assertPrivateStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
        Metadata: { publishlyPrivate: 'true' },
      })
    );
  }

  async putFile(key: string, filePath: string, contentType: string) {
    assertPrivateStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        CacheControl: 'private, no-store',
        Metadata: { publishlyPrivate: 'true' },
      })
    );
  }

  async compose(key: string, partKeys: string[], contentType: string) {
    assertPrivateStorageKey(key);
    partKeys.forEach(assertPrivateStorageKey);
    if (!partKeys.length) throw new Error('Private media composition needs parts.');
    const started = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: contentType,
        CacheControl: 'private, no-store',
        Metadata: { publishlyPrivate: 'true' },
      })
    );
    if (!started.UploadId) throw new Error('Private multipart composition returned no upload ID.');
    try {
      const completedParts = [];
      for (let index = 0; index < partKeys.length; index += 1) {
        const copySource = `/${encodeURIComponent(this.config.bucket)}/${partKeys[
          index
        ]
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`;
        const copied = await this.client.send(
          new UploadPartCopyCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: started.UploadId,
            PartNumber: index + 1,
            CopySource: copySource,
          })
        );
        const etag = copied.CopyPartResult?.ETag;
        if (!etag) throw new Error('Private multipart composition returned no ETag.');
        completedParts.push({ ETag: etag, PartNumber: index + 1 });
      }
      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: started.UploadId,
          MultipartUpload: { Parts: completedParts },
        })
      );
    } catch (error) {
      await this.client
        .send(
          new AbortMultipartUploadCommand({
            Bucket: this.config.bucket,
            Key: key,
            UploadId: started.UploadId,
          })
        )
        .catch(() => undefined);
      throw error;
    }
  }

  async head(key: string): Promise<PrivateMediaHead> {
    assertPrivateStorageKey(key);
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key })
    );
    const contentLength = Number(result.ContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
      throw new Error('Private media object has an invalid content length.');
    }
    return {
      contentLength,
      contentType: result.ContentType || 'application/octet-stream',
      etag: result.ETag,
    };
  }

  async open(key: string, range: PrivateMediaRange): Promise<PrivateMediaRead> {
    assertPrivateStorageKey(key);
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      })
    );
    if (!result.Body) throw new Error('Private media object returned no body.');
    const contentLength = Number(result.ContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new Error('Private media object returned an invalid content length.');
    }
    return {
      contentLength,
      contentType: result.ContentType || 'application/octet-stream',
      etag: result.ETag,
      contentRange: result.ContentRange,
      body: result.Body as Readable,
    };
  }

  async remove(key: string) {
    assertPrivateStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key })
    );
  }
}

function privateLocalRoot() {
  if (process.env.BULK_PRIVATE_UPLOAD_DIRECTORY) {
    return path.resolve(process.env.BULK_PRIVATE_UPLOAD_DIRECTORY);
  }
  const publicRoot = path.resolve(process.env.UPLOAD_DIRECTORY || './uploads');
  return path.resolve(path.dirname(publicRoot), 'publishly-private-media');
}

export function assertPrivateStorageConfiguration() {
  const provider = (
    process.env.BULK_PRIVATE_STORAGE_PROVIDER ||
    process.env.STORAGE_PROVIDER ||
    'local'
  ).toLowerCase();
  if (provider === 'local') {
    const privateRoot = privateLocalRoot();
    const publicRoot = path.resolve(process.env.UPLOAD_DIRECTORY || './uploads');
    if (
      privateRoot === publicRoot ||
      privateRoot.startsWith(publicRoot + path.sep)
    ) {
      throw new Error(
        'BULK_PRIVATE_UPLOAD_DIRECTORY must be outside the public upload directory.'
      );
    }
    return { provider, root: privateRoot } as const;
  }
  if (provider !== 's3' && provider !== 'cloudflare') {
    throw new Error(`Invalid private media storage provider ${provider}.`);
  }
  const bucket = process.env.BULK_PRIVATE_S3_BUCKET || '';
  const publicBucket =
    provider === 'cloudflare'
      ? process.env.CLOUDFLARE_BUCKETNAME
      : process.env.S3_BUCKET;
  if (!bucket || bucket === publicBucket) {
    throw new Error(
      'BULK_PRIVATE_S3_BUCKET is required and must differ from the public media bucket.'
    );
  }
  const accessKeyId =
    process.env.BULK_PRIVATE_S3_ACCESS_KEY_ID ||
    (provider === 'cloudflare'
      ? process.env.CLOUDFLARE_ACCESS_KEY
      : process.env.S3_ACCESS_KEY_ID) ||
    '';
  const secretAccessKey =
    process.env.BULK_PRIVATE_S3_SECRET_ACCESS_KEY ||
    (provider === 'cloudflare'
      ? process.env.CLOUDFLARE_SECRET_ACCESS_KEY
      : process.env.S3_SECRET_ACCESS_KEY) ||
    '';
  const region =
    process.env.BULK_PRIVATE_S3_REGION ||
    (provider === 'cloudflare'
      ? process.env.CLOUDFLARE_REGION
      : process.env.S3_REGION) ||
    'us-east-1';
  if (!accessKeyId || !secretAccessKey || !region) {
    throw new Error('Private S3 credentials and region are required.');
  }
  const endpoint =
    process.env.BULK_PRIVATE_S3_ENDPOINT ||
    (provider === 'cloudflare' && process.env.CLOUDFLARE_ACCOUNT_ID
      ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : process.env.S3_ENDPOINT || undefined);
  return {
    provider,
    config: {
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      bucket,
      forcePathStyle:
        process.env.BULK_PRIVATE_S3_FORCE_PATH_STYLE === 'true' ||
        process.env.S3_FORCE_PATH_STYLE === 'true',
    },
  } as const;
}

export class PrivateMediaStorageFactory {
  static create(): PrivateMediaStorage {
    const configuration = assertPrivateStorageConfiguration();
    if (configuration.provider === 'local') {
      return new LocalPrivateMediaStorage(configuration.root);
    }
    return new PrivateS3MediaStorage(configuration.config);
  }
}
