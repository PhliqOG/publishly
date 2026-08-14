import { CloudflareStorage } from './cloudflare.storage';
import { IUploadProvider } from './upload.interface';
import { LocalStorage } from './local.storage';
import { S3Storage } from './s3.storage';

export class UploadFactory {
  static createStorage(): IUploadProvider {
    const storageProvider = process.env.STORAGE_PROVIDER || 'local';

    switch (storageProvider) {
      case 'local':
        return new LocalStorage(process.env.UPLOAD_DIRECTORY!);
      case 'cloudflare':
        return new CloudflareStorage(
          process.env.CLOUDFLARE_ACCOUNT_ID!,
          process.env.CLOUDFLARE_ACCESS_KEY!,
          process.env.CLOUDFLARE_SECRET_ACCESS_KEY!,
          process.env.CLOUDFLARE_REGION!,
          process.env.CLOUDFLARE_BUCKETNAME!,
          process.env.CLOUDFLARE_BUCKET_URL!
        );
      case 's3':
        return new S3Storage({
          endpoint: process.env.S3_ENDPOINT || undefined,
          region: process.env.S3_REGION || 'us-east-1',
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          bucket: process.env.S3_BUCKET!,
          publicUrl: process.env.S3_PUBLIC_URL!,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        });
      default:
        throw new Error(`Invalid storage type ${storageProvider}`);
    }
  }
}

export function getPublicStorageUrl() {
  return (
    (process.env.STORAGE_PROVIDER === 's3'
      ? process.env.S3_PUBLIC_URL
      : process.env.CLOUDFLARE_BUCKET_URL) || ''
  ).replace(/\/$/, '');
}
