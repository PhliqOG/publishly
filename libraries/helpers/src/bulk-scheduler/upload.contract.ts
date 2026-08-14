export const BULK_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const BULK_UPLOAD_MAX_FILE_BYTES = 1024 * 1024 * 1024;
export const BULK_UPLOAD_MAX_BATCH_FILES = 250;
export const BULK_UPLOAD_MAX_BATCH_BYTES = 20 * 1024 * 1024 * 1024;

export const BULK_UPLOAD_STATES = [
  'INITIATED',
  'UPLOADING',
  'ASSEMBLING',
  'VALIDATING',
  'NORMALIZING',
  'READY',
  'QUARANTINED',
  'FAILED',
  'RETRYABLE_FAILURE',
  'FINAL_FAILURE',
  'ABORTED',
  'EXPIRED',
] as const;

export type BulkUploadState = (typeof BULK_UPLOAD_STATES)[number];

export type BulkUploadFileRequest = {
  clientUploadId: string;
  originalName: string;
  relativePath: string;
  byteLength: number;
  mimeType?: string;
};

export type BulkUploadBatchRequest = { files: BulkUploadFileRequest[] };

const DECLARED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'application/octet-stream',
]);

function cleanString(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function normalizeBulkRelativePath(value: string) {
  const normalized = value.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (
    !normalized ||
    normalized.length > 500 ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('invalid_upload_relative_path');
  }
  return normalized;
}

export function validateBulkUploadBatch(
  input: unknown
):
  | { valid: true; value: BulkUploadBatchRequest }
  | { valid: false; code: string; reason: string } {
  if (!input || typeof input !== 'object' || !Array.isArray((input as any).files)) {
    return {
      valid: false,
      code: 'invalid_upload_batch',
      reason: 'files must be an array of native video file descriptors.',
    };
  }
  const files = (input as any).files as unknown[];
  if (!files.length || files.length > BULK_UPLOAD_MAX_BATCH_FILES) {
    return {
      valid: false,
      code: 'invalid_upload_batch_size',
      reason: `Each upload batch must contain 1-${BULK_UPLOAD_MAX_BATCH_FILES} files.`,
    };
  }
  const clientIds = new Set<string>();
  let totalBytes = 0;
  const normalized: BulkUploadFileRequest[] = [];
  for (const raw of files) {
    if (!raw || typeof raw !== 'object') {
      return { valid: false, code: 'invalid_upload_file', reason: 'Every upload file needs metadata.' };
    }
    const file = raw as Record<string, unknown>;
    if (
      !cleanString(file.clientUploadId, 200) ||
      !/^[A-Za-z0-9._:-]{8,200}$/.test(file.clientUploadId as string) ||
      clientIds.has(file.clientUploadId as string)
    ) {
      return {
        valid: false,
        code: 'invalid_client_upload_id',
        reason: 'Every file needs a unique 8-200 character clientUploadId.',
      };
    }
    if (!cleanString(file.originalName, 255)) {
      return { valid: false, code: 'invalid_upload_filename', reason: 'Every file needs a filename of at most 255 characters.' };
    }
    let relativePath: string;
    try {
      relativePath = normalizeBulkRelativePath(String(file.relativePath || file.originalName));
    } catch {
      return { valid: false, code: 'invalid_upload_relative_path', reason: 'Folder paths must be relative and cannot contain traversal segments.' };
    }
    if (
      !Number.isInteger(file.byteLength) ||
      (file.byteLength as number) < 1 ||
      (file.byteLength as number) > BULK_UPLOAD_MAX_FILE_BYTES
    ) {
      return { valid: false, code: 'invalid_media_size', reason: 'Each video must be between 1 byte and 1 GiB.' };
    }
    const mimeType = typeof file.mimeType === 'string' && file.mimeType.trim()
      ? file.mimeType.trim().toLowerCase()
      : undefined;
    if (mimeType && !DECLARED_VIDEO_MIMES.has(mimeType)) {
      return { valid: false, code: 'invalid_media', reason: `Declared media type ${mimeType} is not an accepted video input.` };
    }
    totalBytes += file.byteLength as number;
    if (totalBytes > BULK_UPLOAD_MAX_BATCH_BYTES) {
      return { valid: false, code: 'upload_batch_too_large', reason: 'One initiation batch cannot declare more than 20 GiB.' };
    }
    clientIds.add(file.clientUploadId as string);
    normalized.push({
      clientUploadId: file.clientUploadId as string,
      originalName: (file.originalName as string).trim(),
      relativePath,
      byteLength: file.byteLength as number,
      ...(mimeType ? { mimeType } : {}),
    });
  }
  return { valid: true, value: { files: normalized } };
}

export function expectedBulkUploadPartSize(input: {
  expectedByteLength: number;
  chunkSize: number;
  totalParts: number;
  partNumber: number;
}) {
  if (
    !Number.isInteger(input.partNumber) ||
    input.partNumber < 0 ||
    input.partNumber >= input.totalParts
  ) {
    return null;
  }
  if (input.partNumber < input.totalParts - 1) return input.chunkSize;
  return input.expectedByteLength - input.chunkSize * (input.totalParts - 1);
}
