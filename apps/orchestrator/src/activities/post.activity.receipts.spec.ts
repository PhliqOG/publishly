import { PostActivity } from './post.activity';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  () => ({
    NotificationService: class NotificationService {},
    NotificationType: {},
  })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class WebhooksService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionService {} })
);
jest.mock('@gitroom/helpers/auth/crypto.v2', () => ({
  withOpenToken: jest.fn((integration) => ({
    ...integration,
    token: 'opened-token',
  })),
}));

const integration = {
  id: 'integration-1',
  organizationId: 'org-1',
  internalId: 'provider-account-1',
  providerIdentifier: 'testprovider',
  token: 'sealed-token',
} as any;

const post = {
  id: 'post-1',
  content: 'hello',
  settings: '{}',
  image: '[]',
} as any;

describe('PostActivity delivery receipts', () => {
  let provider: {
    editor: 'normal';
    post: jest.Mock;
    postPending: jest.Mock;
    checkPostStatus: jest.Mock;
    finalizePost: jest.Mock;
  };
  let posts: {
    updateTags: jest.Mock;
    updateMedia: jest.Mock;
    hydratePublishingValue: jest.Mock;
    recordDeliveryReceipt: jest.Mock;
  };
  let activity: PostActivity;

  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    provider = {
      editor: 'normal',
      post: jest.fn(),
      postPending: jest.fn(),
      checkPostStatus: jest.fn(),
      finalizePost: jest.fn(),
    };
    posts = {
      updateTags: jest.fn().mockResolvedValue([post]),
      updateMedia: jest.fn().mockResolvedValue([]),
      hydratePublishingValue: jest.fn().mockImplementation(
        (_organizationId, _postId, value) =>
          Promise.resolve({ value, replacements: [] })
      ),
      recordDeliveryReceipt: jest.fn().mockResolvedValue({ id: 'receipt-1' }),
    };
    const manager = {
      getSocialIntegration: jest.fn().mockReturnValue(provider),
    };
    const temporal = {
      client: {
        getRawClient: jest.fn().mockReturnValue({
          workflow: { start: jest.fn().mockResolvedValue(undefined) },
        }),
      },
    };
    activity = new PostActivity(
      posts as any,
      {} as any,
      manager as any,
      {} as any,
      {} as any,
      temporal as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('keeps the legacy webhook activity as a no-op for Temporal replay', async () => {
    await expect(
      activity.sendWebhooks('post-1', 'org-1', 'integration-1')
    ).resolves.toBeUndefined();
    expect(posts.recordDeliveryReceipt).not.toHaveBeenCalled();
  });

  it('records sent immediately after provider acceptance and correlates pending status reads', async () => {
    provider.postPending.mockResolvedValue([
      {
        id: 'post-1',
        postId: '',
        releaseURL: '',
        status: 'pending',
        pendingData: { publishId: 'publish-1' },
      },
    ]);

    const [result] = await activity.postSocialPending(integration, [post]);

    expect(posts.recordDeliveryReceipt).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'sent',
      providerPostId: null,
      providerUrl: null,
      evidence: { providerStatus: 'pending' },
    });
    expect(result.pendingData.__publishlyReceipt).toEqual({ postId: 'post-1' });
  });

  it('does not record sent if the provider mutation throws before acceptance', async () => {
    provider.postPending.mockRejectedValue(new Error('provider unavailable'));

    await expect(
      activity.postSocialPending(integration, [post])
    ).rejects.toThrow('provider unavailable');
    expect(posts.recordDeliveryReceipt).not.toHaveBeenCalled();
  });

  it('surfaces sent-receipt persistence failure after provider acceptance', async () => {
    provider.postPending.mockResolvedValue([
      {
        id: 'post-1',
        postId: 'provider-1',
        releaseURL: 'https://social.example/posts/provider-1',
        status: 'success',
      },
    ]);
    posts.recordDeliveryReceipt.mockRejectedValue(
      new Error('receipt database unavailable')
    );

    await expect(
      activity.postSocialPending(integration, [post])
    ).rejects.toThrow('receipt database unavailable');
  });

  it('does not replay a legacy mutation when its immediate sent receipt write fails', async () => {
    provider.post.mockResolvedValue([
      {
        id: 'post-1',
        postId: 'provider-1',
        releaseURL: 'https://social.example/posts/provider-1',
        status: 'success',
      },
    ]);
    posts.recordDeliveryReceipt.mockRejectedValue(
      new Error('receipt database unavailable')
    );

    await expect(
      activity.postSocial(integration, [post])
    ).resolves.toHaveLength(1);
    expect(provider.post).toHaveBeenCalledTimes(1);
  });

  it('records confirmed_live only when a later platform status read says completed', async () => {
    provider.checkPostStatus.mockResolvedValue({
      status: 'completed',
      postId: 'provider-1',
      releaseURL: 'https://social.example/posts/provider-1',
    });

    await activity.checkPostStatus(integration, {
      publishId: 'publish-1',
      __publishlyReceipt: { postId: 'post-1' },
    });

    expect(posts.recordDeliveryReceipt).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'confirmed_live',
      providerPostId: 'provider-1',
      providerUrl: 'https://social.example/posts/provider-1',
      confirmationMethod: 'provider_status_api',
      evidence: { providerStatus: 'completed' },
    });
  });

  it('preserves correlation across pending status state', async () => {
    provider.checkPostStatus.mockResolvedValue({
      status: 'pending',
      pendingData: { publishId: 'publish-1', providerState: 'processing' },
    });

    const result = await activity.checkPostStatus(integration, {
      publishId: 'publish-1',
      __publishlyReceipt: { postId: 'post-1' },
    });

    expect((result as any).pendingData.__publishlyReceipt).toEqual({
      postId: 'post-1',
    });
    expect(posts.recordDeliveryReceipt).not.toHaveBeenCalled();
  });

  it('does not trust finalize create completion as independent confirmation', async () => {
    provider.finalizePost.mockResolvedValue({
      status: 'completed',
      postId: 'provider-1',
      releaseURL: 'https://social.example/posts/provider-1',
    });

    await activity.finalizePost(integration, {
      __publishlyReceipt: { postId: 'post-1' },
    });

    expect(posts.recordDeliveryReceipt).not.toHaveBeenCalled();
  });
});
