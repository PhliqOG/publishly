import {
  BULK_UPLOAD_CHUNK_BYTES,
  expectedBulkUploadPartSize,
  normalizeBulkRelativePath,
  validateBulkUploadBatch,
} from './upload.contract';

describe('Bulk Scheduler upload contract', () => {
  it('accepts native folder metadata and preserves deterministic order', () => {
    expect(
      validateBulkUploadBatch({
        files: [
          {
            clientUploadId: 'folder-file-0001',
            originalName: 'launch.mov',
            relativePath: 'summer/day-1/launch.mov',
            byteLength: BULK_UPLOAD_CHUNK_BYTES + 5,
            mimeType: 'video/quicktime',
          },
        ],
      })
    ).toMatchObject({
      valid: true,
      value: { files: [{ relativePath: 'summer/day-1/launch.mov' }] },
    });
  });

  it('rejects traversal, duplicates, non-video declarations, and oversized files', () => {
    expect(() => normalizeBulkRelativePath('../secret.mp4')).toThrow();
    const base = {
      clientUploadId: 'folder-file-0001',
      originalName: 'launch.exe',
      relativePath: 'launch.exe',
      byteLength: 10,
      mimeType: 'application/x-msdownload',
    };
    expect(validateBulkUploadBatch({ files: [base] })).toMatchObject({
      valid: false,
      code: 'invalid_media',
    });
    expect(validateBulkUploadBatch({ files: [{ ...base, mimeType: 'video/mp4' }, { ...base, mimeType: 'video/mp4' }] })).toMatchObject({
      valid: false,
      code: 'invalid_client_upload_id',
    });
  });

  it('requires exact full chunks and an exact final remainder', () => {
    const size = BULK_UPLOAD_CHUNK_BYTES * 2 + 7;
    expect(
      [0, 1, 2].map((partNumber) =>
        expectedBulkUploadPartSize({
          expectedByteLength: size,
          chunkSize: BULK_UPLOAD_CHUNK_BYTES,
          totalParts: 3,
          partNumber,
        })
      )
    ).toEqual([BULK_UPLOAD_CHUNK_BYTES, BULK_UPLOAD_CHUNK_BYTES, 7]);
    expect(
      expectedBulkUploadPartSize({
        expectedByteLength: size,
        chunkSize: BULK_UPLOAD_CHUNK_BYTES,
        totalParts: 3,
        partNumber: 3,
      })
    ).toBeNull();
  });
});
