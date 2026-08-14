import 'reflect-metadata';
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository',
  () => ({ PostsRepository: class PostsRepository {} })
);
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (value: string) => value },
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaService {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkService {},
}));
jest.mock('@gitroom/nestjs-libraries/openai/openai.service', () => ({
  OpenaiService: class OpenaiService {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-job.repository',
  () => ({ PublishingJobRepository: class PublishingJobRepository {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-failure.service',
  () => ({ PublishingFailureService: class PublishingFailureService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-receipt.service',
  () => ({ PublishingReceiptService: class PublishingReceiptService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/post-confirmation.service',
  () => ({ PostConfirmationService: class PostConfirmationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/platform-truth/platform-truth.service',
  () => ({ PlatformTruthService: class PlatformTruthService {} })
);
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));
import { PostsService } from './posts.service';

const integration = {
  id: 'integration-1',
  organizationId: 'org-1',
  providerIdentifier: 'instagram',
  name: 'Storefront',
  additionalSettings: '[]',
};

const instagramReady = {
  state: 'READY' as const,
  publishingMode: 'PUBLIC_CAPABLE' as const,
  auditState: 'NOT_APPLICABLE' as const,
  code: 'instagram_graph_ready',
  reason: 'Instagram publishing requirements are verified.',
  checkedAt: new Date('2026-08-10T12:00:00.000Z'),
  accountType: 'BUSINESS',
  metadata: { facebookPageLinked: true },
};

function makeService(overrides?: {
  provider?: Record<string, any>;
  media?: any;
  truth?: any;
}) {
  const provider = {
    dto: undefined,
    maxLength: jest.fn().mockReturnValue(2_200),
    checkValidity: jest.fn().mockResolvedValue(true),
    ...(overrides?.provider || {}),
  };
  const media = {
    getMediaById: jest.fn().mockResolvedValue(
      overrides && 'media' in overrides
        ? overrides.media
        : {
            id: 'media-1',
            path: 'uploads/photo.jpg',
            mimeType: 'image/jpeg',
            width: 1_080,
            height: 1_080,
            durationSeconds: null,
            fileSize: 400_000,
            metadataStatus: 'READY',
          }
    ),
  };
  const truth = {
    refreshIntegration: jest.fn().mockResolvedValue(
      overrides?.truth || {
        snapshot: instagramReady,
        response: {
          state: 'READY',
          publishingMode: 'PUBLIC_CAPABLE',
          auditState: 'NOT_APPLICABLE',
          code: 'instagram_graph_ready',
          reason: instagramReady.reason,
        },
        failure: null,
      }
    ),
  };
  const service = new PostsService(
    {} as any,
    { getSocialIntegration: jest.fn().mockReturnValue(provider) } as any,
    { getIntegrationById: jest.fn().mockResolvedValue(integration) } as any,
    media as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    truth as any
  );
  return { service, provider, media, truth };
}

const imagePost = {
  integration: { id: 'integration-1' },
  value: [
    {
      content: 'A verified post',
      image: [{ id: 'media-1', path: 'uploads/photo.jpg' }],
    },
  ],
  settings: { post_type: 'post' },
};

describe('PostsService platform-truth compose preflight', () => {
  it('resolves tenant-owned media and returns redacted verified truth', async () => {
    const { service, media } = makeService();
    const [result] = await service.validatePosts('org-1', [imagePost]);

    expect(media.getMediaById).toHaveBeenCalledWith('org-1', 'media-1');
    expect(result.errors).toBe(true);
    expect(result.preflightFailure).toBeNull();
    expect(result.platformTruth).toMatchObject({
      state: 'READY',
      code: 'instagram_graph_ready',
    });
  });

  it.each([
    ['missing tenant row', null],
    [
      'mismatched submitted path',
      {
        id: 'media-1',
        path: 'uploads/different.jpg',
        mimeType: 'image/jpeg',
        width: 1_080,
        height: 1_080,
        fileSize: 100,
        metadataStatus: 'READY',
      },
    ],
    [
      'pending metadata',
      {
        id: 'media-1',
        path: 'uploads/photo.jpg',
        mimeType: 'image/jpeg',
        width: null,
        height: null,
        fileSize: 100,
        metadataStatus: 'PENDING',
      },
    ],
  ])('fails closed for %s', async (_label, storedMedia) => {
    const { service } = makeService({ media: storedMedia });
    const [result] = await service.validatePosts('org-1', [imagePost]);

    expect(result.errors).toBe(
      'Publishly cannot verify this Instagram media file. Upload or re-upload it through Publishly before scheduling.'
    );
    expect(result.preflightFailure).toEqual({
      failureClass: 'data_problem',
      code: 'instagram_media_metadata_unavailable',
      reason:
        'Publishly cannot verify this Instagram media file. Upload or re-upload it through Publishly before scheduling.',
    });
  });

  it('surfaces a platform-truth outage as a recoverable compose failure', async () => {
    const outage = {
      state: 'UNKNOWN' as const,
      publishingMode: 'UNKNOWN' as const,
      auditState: 'NOT_APPLICABLE' as const,
      code: 'instagram_platform_truth_unavailable',
      reason: 'Meta capability lookup timed out.',
      checkedAt: new Date(),
    };
    const { service } = makeService({
      truth: {
        snapshot: outage,
        response: { ...outage, checkedAt: outage.checkedAt.toISOString() },
        failure: {
          failureClass: 'recoverable',
          code: outage.code,
          reason: outage.reason,
        },
      },
    });
    const [result] = await service.validatePosts('org-1', [imagePost]);

    expect(result.preflightFailure).toEqual({
      failureClass: 'recoverable',
      code: outage.code,
      reason: outage.reason,
    });
    expect(result.errors).toBe(outage.reason);
  });

  it('blocks public intent when TikTok reports unaudited SELF_ONLY', async () => {
    const tiktok = {
      ...integration,
      providerIdentifier: 'tiktok',
      name: 'Creator',
    };
    const { service } = makeService({
      truth: {
        snapshot: {
          state: 'LIMITED',
          publishingMode: 'SELF_ONLY',
          auditState: 'UNAUDITED',
          code: 'tiktok_self_only_unaudited',
          reason: 'Every direct post is private-only.',
          checkedAt: new Date(),
          metadata: { privacyLevelOptions: ['SELF_ONLY'] },
        },
        response: {
          state: 'LIMITED',
          publishingMode: 'SELF_ONLY',
          auditState: 'UNAUDITED',
          code: 'tiktok_self_only_unaudited',
          reason: 'Every direct post is private-only.',
          privacyLevelOptions: ['SELF_ONLY'],
        },
        failure: null,
      },
    });
    (service as any)._integrationService.getIntegrationById.mockResolvedValue(
      tiktok
    );
    const [result] = await service.validatePosts('org-1', [
      {
        ...imagePost,
        settings: {
          content_posting_method: 'DIRECT_POST',
          privacy_level: 'PUBLIC_TO_EVERYONE',
          publish_consent: true,
        },
      },
    ]);

    expect(result.preflightFailure).toMatchObject({
      failureClass: 'user_action_needed',
      code: 'tiktok_self_only_unaudited',
    });
    expect(result.errors).not.toBe('');
  });

  it('classifies provider validator exceptions with a non-empty reason', async () => {
    const { service } = makeService({
      provider: { checkValidity: jest.fn().mockRejectedValue(new Error()) },
    });
    const [result] = await service.validatePosts('org-1', [imagePost]);

    expect(result.mediaFailure).toMatchObject({
      failureClass: 'data_problem',
      code: 'instagram_media_invalid',
    });
    expect(result.mediaFailure?.reason).toEqual(expect.any(String));
    expect(result.mediaFailure?.reason.length).toBeGreaterThan(0);
  });
});
