import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertPrivateStorageConfiguration,
  assertPrivateStorageKey,
  LocalPrivateMediaStorage,
} from './private-media.storage';

async function read(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe('LocalPrivateMediaStorage', () => {
  let root: string;
  let storage: LocalPrivateMediaStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'publishly-private-media-'));
    storage = new LocalPrivateMediaStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores with private permissions and streams a full object without a URL', async () => {
    await storage.put('bulk/a/asset/video.mp4', Buffer.from('0123456789'), 'video/mp4');
    await expect(storage.head('bulk/a/asset/video.mp4')).resolves.toEqual({
      contentLength: 10,
      contentType: 'video/mp4',
    });
    const opened = await storage.open('bulk/a/asset/video.mp4', null);
    expect(opened.contentLength).toBe(10);
    await expect(read(opened.body)).resolves.toEqual(Buffer.from('0123456789'));
  });

  it('streams an exact inclusive range', async () => {
    await storage.put('bulk/a/asset/video.mp4', Buffer.from('0123456789'), 'video/mp4');
    const opened = await storage.open('bulk/a/asset/video.mp4', {
      start: 2,
      end: 5,
    });
    expect(opened).toMatchObject({
      contentLength: 4,
      contentRange: 'bytes 2-5/10',
    });
    await expect(read(opened.body)).resolves.toEqual(Buffer.from('2345'));
  });

  it('composes bounded chunks and imports a file without buffering the result', async () => {
    await storage.put('staging/a/0', Buffer.from('hello '), 'application/octet-stream');
    await storage.put('staging/a/1', Buffer.from('world'), 'application/octet-stream');
    await storage.compose(
      'bulk/a/asset/video.mp4',
      ['staging/a/0', 'staging/a/1'],
      'video/mp4'
    );
    const composed = await storage.open('bulk/a/asset/video.mp4', null);
    await expect(read(composed.body)).resolves.toEqual(Buffer.from('hello world'));

    const source = path.join(root, 'source.mp4');
    await writeFile(source, Buffer.from('streamed file'));
    await storage.putFile('bulk/a/asset/imported.mp4', source, 'video/mp4');
    const imported = await storage.open('bulk/a/asset/imported.mp4', null);
    await expect(read(imported.body)).resolves.toEqual(Buffer.from('streamed file'));
  });

  it('rejects traversal, absolute paths, backslashes, and invalid ranges', async () => {
    for (const key of [
      '../escape.mp4',
      '/absolute.mp4',
      'bulk/../escape.mp4',
      'bulk\\escape.mp4',
    ]) {
      expect(() => assertPrivateStorageKey(key)).toThrow(/Invalid private media/);
    }
    await storage.put('bulk/a/asset/video.mp4', Buffer.from('1234'), 'video/mp4');
    await expect(
      storage.open('bulk/a/asset/video.mp4', { start: 0, end: 4 })
    ).rejects.toThrow(/outside the object/);
  });
});

describe('private media storage configuration', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('places the local fallback outside the public upload directory', () => {
    process.env.BULK_PRIVATE_STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = path.join(os.tmpdir(), 'publishly-public');
    delete process.env.BULK_PRIVATE_UPLOAD_DIRECTORY;
    const result = assertPrivateStorageConfiguration();
    expect(result.provider).toBe('local');
    expect((result as any).root).not.toContain(
      path.resolve(process.env.UPLOAD_DIRECTORY) + path.sep
    );
  });

  it('rejects a local private directory inside public uploads', () => {
    process.env.BULK_PRIVATE_STORAGE_PROVIDER = 'local';
    process.env.UPLOAD_DIRECTORY = path.join(os.tmpdir(), 'publishly-public');
    process.env.BULK_PRIVATE_UPLOAD_DIRECTORY = path.join(
      process.env.UPLOAD_DIRECTORY,
      'private'
    );
    expect(() => assertPrivateStorageConfiguration()).toThrow(/outside/);
  });

  it('requires an object-store bucket distinct from the public bucket', () => {
    process.env.BULK_PRIVATE_STORAGE_PROVIDER = 's3';
    process.env.S3_BUCKET = 'public-media';
    process.env.BULK_PRIVATE_S3_BUCKET = 'public-media';
    process.env.S3_ACCESS_KEY_ID = 'key';
    process.env.S3_SECRET_ACCESS_KEY = 'secret';
    process.env.S3_REGION = 'us-east-1';
    expect(() => assertPrivateStorageConfiguration()).toThrow(/must differ/);
    process.env.BULK_PRIVATE_S3_BUCKET = 'private-media';
    expect(assertPrivateStorageConfiguration()).toMatchObject({
      provider: 's3',
      config: { bucket: 'private-media' },
    });
  });
});
