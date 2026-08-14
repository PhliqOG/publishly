import { S3Storage } from './s3.storage';

/** Backward-compatible R2 adapter; new deployments may use STORAGE_PROVIDER=s3. */
class CloudflareStorage extends S3Storage {
  constructor(
    accountID: string,
    accessKey: string,
    secretKey: string,
    region: string,
    bucketName: string,
    uploadUrl: string
  ) {
    super({
      endpoint: `https://${accountID}.r2.cloudflarestorage.com`,
      region,
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      bucket: bucketName,
      publicUrl: uploadUrl,
    });
  }
}

export { CloudflareStorage };
export default CloudflareStorage;
