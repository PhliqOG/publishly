import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { ProviderMediaController } from './provider-media.controller';

class ResponseSink extends Writable {
  statusCode = 200;
  headers = new Map<string, string>();
  chunks: Buffer[] = [];
  headersSent = false;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

describe('ProviderMediaController', () => {
  it('streams GET bytes with private/no-store, range, and content headers', async () => {
    const media = {
      statusCode: 206,
      contentType: 'video/mp4',
      contentLength: 4,
      contentRange: 'bytes 10-13/1000',
      etag: 'etag-1',
      filename: 'launch.mp4',
      body: Readable.from(Buffer.from('0123')),
      completeServed: jest.fn(),
      completeFailed: jest.fn(),
    };
    const service = { openProviderMedia: jest.fn().mockResolvedValue(media) };
    const controller = new ProviderMediaController(service as any);
    const response = new ResponseSink();

    await controller.get(
      'capability-is-never-logged',
      'bytes=10-13',
      'adapter-internal-secret',
      {} as any,
      response as any
    );
    expect(service.openProviderMedia).toHaveBeenCalledWith({
      capability: 'capability-is-never-logged',
      method: 'GET',
      rangeHeader: 'bytes=10-13',
      internalToken: 'adapter-internal-secret',
    });
    expect(response.statusCode).toBe(206);
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
    expect(response.headers.get('content-range')).toBe('bytes 10-13/1000');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-length')).toBe('4');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(Buffer.concat(response.chunks)).toEqual(Buffer.from('0123'));
    expect(media.completeServed).toHaveBeenCalledTimes(1);
    expect(media.completeFailed).not.toHaveBeenCalled();
  });

  it('serves HEAD metadata without a body and completes its durable event', async () => {
    const media = {
      statusCode: 200,
      contentType: 'video/mp4',
      contentLength: 1000,
      filename: 'launch.mp4',
      body: null as null,
      completeServed: jest.fn(),
      completeFailed: jest.fn(),
    };
    const service = { openProviderMedia: jest.fn().mockResolvedValue(media) };
    const controller = new ProviderMediaController(service as any);
    const response = new ResponseSink();
    await controller.head(
      'capability-is-never-logged',
      undefined,
      undefined,
      response as any
    );
    expect(service.openProviderMedia).toHaveBeenCalledWith({
      capability: 'capability-is-never-logged',
      method: 'HEAD',
      rangeHeader: undefined,
      internalToken: undefined,
    });
    expect(Buffer.concat(response.chunks)).toHaveLength(0);
    expect(media.completeServed).toHaveBeenCalledTimes(1);
  });
});

describe('provider media route architecture', () => {
  const root = process.cwd();
  const main = readFileSync(path.join(root, 'apps/backend/src/main.ts'), 'utf8');
  const moduleSource = readFileSync(
    path.join(root, 'apps/backend/src/api/api.module.ts'),
    'utf8'
  );
  const controller = readFileSync(
    path.join(root, 'apps/backend/src/api/routes/provider-media.controller.ts'),
    'utf8'
  );

  it('redacts the capability before request logging', () => {
    expect(main).toContain('path: redactProviderMediaSecrets(');
    expect(main).not.toContain(
      "path: String(req.originalUrl || req.url || '').split('?')[0]"
    );
  });

  it('registers a capability-only route outside cookie/API-key authentication', () => {
    expect(moduleSource).toContain('ProviderMediaController');
    const authenticatedList = moduleSource.slice(
      moduleSource.indexOf('const authenticatedController'),
      moduleSource.indexOf('@Module')
    );
    expect(authenticatedList).not.toContain('ProviderMediaController');
    expect(controller).toContain("@Controller('/provider-media')");
    expect(controller).not.toContain('storageKey');
    expect(controller).not.toContain('redirect');
  });
});
