jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
  socialIntegrationList: [],
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class OpenaiService {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionService {} })
);
jest.mock('@gitroom/nestjs-libraries/videos/video.manager', () => ({
  VideoManager: class VideoManager {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: {
    createStorage: () => ({
      uploadFile: jest.fn(),
      uploadSimple: jest.fn(),
      removeFile: jest.fn(),
    }),
  },
}));
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ ssrfSafeDispatcher: undefined })
);

import { MediaService } from './media.service';
import { Readable } from 'stream';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==',
  'base64'
);

function fixture(buffer = PNG_1X1): Express.Multer.File {
  return {
    buffer,
    mimetype: 'image/png',
    size: buffer.length,
    path: '',
    fieldname: 'file',
    destination: '',
    stream: new Readable(),
    filename: '',
    originalname: 'pixel.png',
    encoding: '7bit',
  };
}

describe('MediaService pipeline', () => {
  function setup(duplicate: any = null) {
    const repository = {
      findDuplicate: jest.fn().mockResolvedValue(duplicate),
      getStorageUsage: jest.fn().mockResolvedValue(0),
      saveFile: jest
        .fn()
        .mockImplementation(
          (
            organizationId,
            name,
            path,
            originalName,
            fileSize,
            type,
            metadata
          ) => ({
            id: 'media-1',
            organizationId,
            name,
            path,
            originalName,
            fileSize,
            type,
            ...metadata,
          })
        ),
    };
    const subscriptions = {
      getSubscription: jest.fn().mockResolvedValue(null),
    };
    const service = new MediaService(
      repository as any,
      {} as any,
      subscriptions as any,
      {} as any
    );
    const storage = {
      uploadFile: jest
        .fn()
        .mockImplementation(async (file: Express.Multer.File) => ({
          originalname: file.originalname,
          path: `https://media.test/${file.originalname}`,
        })),
      uploadSimple: jest.fn(),
      removeFile: jest.fn(),
    };
    (service as any).storage = storage;
    return { service, repository, subscriptions, storage };
  }

  it('sniffs media, records dimensions/hash, and generates a thumbnail', async () => {
    const { service, repository, storage } = setup();
    const result: any = await service.uploadAndSave('org-1', fixture());

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.mimeType).toBe('image/png');
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.metadataStatus).toBe('READY');
    expect(result.thumbnail).toBe('https://media.test/thumbnail.webp');
    expect(storage.uploadFile).toHaveBeenCalledTimes(2);
    expect(repository.saveFile).toHaveBeenCalledTimes(1);
  });

  it('returns the existing tenant media row for an exact duplicate', async () => {
    const existing = {
      id: 'existing',
      path: 'https://media.test/existing.png',
    };
    const { service, repository, storage } = setup(existing);

    await expect(service.uploadAndSave('org-1', fixture())).resolves.toBe(
      existing
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
    expect(repository.saveFile).not.toHaveBeenCalled();
  });

  it('rejects executable or unknown bytes before storage', async () => {
    const { service, storage } = setup();
    await expect(
      service.uploadAndSave('org-1', fixture(Buffer.from('<html>bad</html>')))
    ).rejects.toThrow('Unsupported media type');
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });
});
