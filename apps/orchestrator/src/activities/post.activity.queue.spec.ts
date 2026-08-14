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

describe('PostActivity account queue V109 methods', () => {
  const queue = {
    acquire: jest.fn(),
    release: jest.fn(),
    reconcileTerminalOrphans: jest.fn(),
  };
  const activity = Object.assign(Object.create(PostActivity.prototype), {
    _accountPublishingQueue: queue,
  }) as PostActivity;

  beforeEach(() => jest.clearAllMocks());

  it('delegates acquire and release without swallowing durable-store errors', async () => {
    queue.acquire.mockResolvedValue({
      acquired: true,
      leaseToken: '11111111-1111-4111-8111-111111111111',
    });
    await expect(
      activity.acquireAccountPublishingQueueV109('org-1', 'post-1')
    ).resolves.toMatchObject({ acquired: true });
    expect(queue.acquire).toHaveBeenCalledWith('org-1', 'post-1');

    queue.release.mockResolvedValue({ status: 'COMPLETED' });
    await expect(
      activity.releaseAccountPublishingQueueV109(
        'org-1',
        'post-1',
        '11111111-1111-4111-8111-111111111111',
        'COMPLETED',
        'provider_accepted',
        'The provider accepted the post.'
      )
    ).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(queue.release).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      '11111111-1111-4111-8111-111111111111',
      'COMPLETED',
      'provider_accepted',
      'The provider accepted the post.'
    );

    queue.release.mockRejectedValueOnce(
      new Error('queue database unavailable')
    );
    await expect(
      activity.releaseAccountPublishingQueueV109(
        'org-1',
        'post-1',
        '11111111-1111-4111-8111-111111111111',
        'AMBIGUOUS'
      )
    ).rejects.toThrow('queue database unavailable');

    queue.reconcileTerminalOrphans.mockResolvedValue({ repaired: 2 });
    await expect(
      activity.reconcileAccountPublishingQueuesV109()
    ).resolves.toEqual({ repaired: 2 });
    expect(queue.reconcileTerminalOrphans).toHaveBeenCalledTimes(1);
  });
});
