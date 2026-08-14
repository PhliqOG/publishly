import { PostConfirmationService } from './post-confirmation.service';

jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManager {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/publishing-jobs/publishing-receipt.service',
  () => ({ PublishingReceiptService: class PublishingReceiptService {} })
);
jest.mock('@gitroom/helpers/auth/crypto.v2', () => ({
  withOpenToken: jest.fn((integration) => ({
    ...integration,
    token: 'opened-token',
  })),
}));

const post = {
  id: 'post-1',
  organizationId: 'org-1',
  integration: {
    id: 'integration-1',
    providerIdentifier: 'instagram',
    token: 'sealed-token',
  },
} as any;

describe('PostConfirmationService', () => {
  let provider: { identifier: string; confirmPost: jest.Mock };
  let manager: { getSocialIntegration: jest.Mock };
  let receipts: {
    isConfirmed: jest.Mock;
    record: jest.Mock;
  };
  let service: PostConfirmationService;

  beforeEach(() => {
    provider = {
      identifier: 'instagram',
      confirmPost: jest.fn(),
    };
    manager = {
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    receipts = {
      isConfirmed: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue({ id: 'receipt-confirmed' }),
    };
    service = new PostConfirmationService(manager as any, receipts as any);
  });

  it('is idempotent when this provider post already has confirmed_live evidence', async () => {
    receipts.isConfirmed.mockResolvedValue({ id: 'existing-confirmation' });

    await expect(
      service.ensureConfirmed(
        post,
        'provider-1',
        'https://instagram.com/p/provider-1'
      )
    ).resolves.toEqual({ id: 'existing-confirmation' });
    expect(provider.confirmPost).not.toHaveBeenCalled();
    expect(receipts.record).not.toHaveBeenCalled();
  });

  it('records confirmed_live only after the independent provider read confirms', async () => {
    provider.confirmPost.mockResolvedValue({
      status: 'confirmed',
      method: 'instagram_media_read',
      providerPostId: 'provider-1',
      providerUrl: 'https://instagram.com/p/provider-1',
      evidence: { mediaType: 'IMAGE' },
    });

    await service.ensureConfirmed(
      post,
      'provider-1',
      'https://instagram.com/p/provider-1'
    );

    expect(provider.confirmPost).toHaveBeenCalledWith(
      'opened-token',
      'provider-1',
      'https://instagram.com/p/provider-1',
      expect.objectContaining({ token: 'opened-token' })
    );
    expect(receipts.record).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'confirmed_live',
      providerPostId: 'provider-1',
      providerUrl: 'https://instagram.com/p/provider-1',
      confirmationMethod: 'instagram_media_read',
      evidence: { mediaType: 'IMAGE' },
    });
  });

  it.each(['pending', 'not_found'] as const)(
    'classifies %s confirmation as a retryable read failure',
    async (status) => {
      provider.confirmPost.mockResolvedValue({
        status,
        method: 'instagram_media_read',
        reason: 'The media is not visible yet.',
      });

      await expect(
        service.ensureConfirmed(
          post,
          'provider-1',
          'https://instagram.com/p/provider-1'
        )
      ).rejects.toMatchObject({
        type: 'bad_body',
        message: 'The media is not visible yet.',
        details: [
          expect.objectContaining({
            failure: {
              failureClass: 'recoverable',
              failureCode: 'status_check_failed',
              failureReason: 'The media is not visible yet.',
              willRetry: false,
            },
          }),
        ],
      });
      expect(receipts.record).not.toHaveBeenCalled();
    }
  );

  it('classifies an unsupported verifier as explicit user action, never success', async () => {
    provider.confirmPost.mockResolvedValue({
      status: 'unsupported',
      method: 'canonical_platform_url',
      reason: 'The URL identifies only a channel.',
    });

    await expect(
      service.ensureConfirmed(
        post,
        'provider-1',
        'https://social.example.com/channel'
      )
    ).rejects.toMatchObject({
      details: [
        expect.objectContaining({
          failure: expect.objectContaining({
            failureClass: 'user_action_needed',
            failureCode: 'provider_configuration_required',
          }),
        }),
      ],
    });
  });

  it('surfaces provider read exceptions for Temporal activity retry', async () => {
    provider.confirmPost.mockRejectedValue(new Error('provider read crashed'));

    await expect(
      service.ensureConfirmed(
        post,
        'provider-1',
        'https://instagram.com/p/provider-1'
      )
    ).rejects.toThrow('provider read crashed');
  });

  it('surfaces confirmed receipt persistence failure instead of marking Post published', async () => {
    provider.confirmPost.mockResolvedValue({
      status: 'confirmed',
      method: 'instagram_media_read',
    });
    receipts.record.mockRejectedValue(new Error('receipt database unavailable'));

    await expect(
      service.ensureConfirmed(
        post,
        'provider-1',
        'https://instagram.com/p/provider-1'
      )
    ).rejects.toThrow('receipt database unavailable');
  });
});
