import { createHmac } from 'crypto';
import { PublishingFailureService } from './publishing-failure.service';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class WebhooksService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ getSsrfSafeDispatcher: jest.fn(() => undefined) })
);

const occurredAt = new Date('2026-08-10T12:00:00.000Z');

function failureEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post.failure:post-1:failed:1:invalid_media',
    organizationId: 'org-1',
    postId: 'post-1',
    publishingJobId: 'job-1',
    provider: 'tiktok',
    failureClass: 'data_problem',
    failureCode: 'invalid_media',
    reason: 'The video dimensions are invalid.',
    willRetry: false,
    attempt: 1,
    webhookState: 'PENDING',
    webhookFinishedAt: null,
    occurredAt,
    integrationId: 'integration-1',
    postGroup: 'group-1',
    ...overrides,
  };
}

function hook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hook-1',
    name: 'Operations',
    url: 'https://hooks.example.com/publishly',
    signingSecret: 'whsec_test',
    integrations: [],
    ...overrides,
  };
}

describe('PublishingFailureService', () => {
  let repository: {
    record: jest.Mock;
    markWebhookState: jest.Mock;
    listForPost: jest.Mock;
  };
  let webhooks: {
    getWebhooksForDelivery: jest.Mock;
    recordDelivery: jest.Mock;
  };
  let service: PublishingFailureService;
  let receipts: { record: jest.Mock };
  let connectionHealth: { recordPublishingFailure: jest.Mock };
  let publishingAttempts: { markPostFailure: jest.Mock };

  beforeEach(() => {
    repository = {
      record: jest.fn().mockResolvedValue(failureEvent()),
      markWebhookState: jest.fn().mockResolvedValue(undefined),
      listForPost: jest.fn(),
    };
    webhooks = {
      getWebhooksForDelivery: jest.fn().mockResolvedValue([]),
      recordDelivery: jest.fn().mockResolvedValue(undefined),
    };
    receipts = { record: jest.fn().mockResolvedValue(undefined) };
    connectionHealth = {
      recordPublishingFailure: jest.fn().mockResolvedValue(undefined),
    };
    publishingAttempts = {
      markPostFailure: jest.fn().mockResolvedValue({ type: 'not_campaign' }),
    };
    service = new PublishingFailureService(
      repository as any,
      webhooks as any,
      receipts as any,
      connectionHealth as any,
      publishingAttempts as any
    );
    jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    global.fetch = jest.fn() as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('persists a normalized failure before marking an unconfigured webhook', async () => {
    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      error: undefined,
    });

    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        postId: 'post-1',
        state: 'FAILED',
        failure: expect.objectContaining({
          failureClass: 'recoverable',
          code: 'internal_error',
          reason: expect.stringMatching(/unexpected internal error/i),
          willRetry: false,
        }),
      })
    );
    expect(receipts.record).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'failed',
      attempt: 1,
      failureId: failureEvent().id,
      evidence: {
        failureClass: 'data_problem',
        failureCode: 'invalid_media',
        reason: 'The video dimensions are invalid.',
        willRetry: false,
      },
    });
    expect(publishingAttempts.markPostFailure).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      failureEventId: failureEvent().id,
      failureClass: 'data_problem',
      failureCode: 'invalid_media',
      failureReason: 'The video dimensions are invalid.',
      willRetry: false,
      now: occurredAt,
    });
    expect(connectionHealth.recordPublishingFailure).toHaveBeenCalledWith(
      failureEvent()
    );
    expect(repository.markWebhookState).toHaveBeenCalledWith(
      failureEvent().id,
      'NOT_CONFIGURED'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('delivers a signed machine-readable post.failure event', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      code: 'invalid_media',
      reason: 'The video dimensions are invalid.',
    });

    const [, request] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload).toEqual({
      specversion: '1.0',
      id: failureEvent().id,
      type: 'post.failure',
      time: occurredAt.toISOString(),
      data: {
        postId: 'post-1',
        postGroup: 'group-1',
        integrationId: 'integration-1',
        provider: 'tiktok',
        attempt: 1,
        willRetry: false,
        failure: {
          class: 'data_problem',
          code: 'invalid_media',
          reason: 'The video dimensions are invalid.',
        },
      },
    });
    const timestamp = request.headers['X-Publishly-Timestamp'];
    const expected = createHmac('sha256', 'whsec_test')
      .update(`${timestamp}.${request.body}`)
      .digest('hex');
    expect(request.headers['X-Publishly-Signature']).toBe(
      `t=${timestamp},v1=${expected}`
    );
    expect(webhooks.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: failureEvent().id,
        eventType: 'post.failure',
        attempt: 1,
        status: 'DELIVERED',
        statusCode: 204,
      })
    );
    expect(repository.markWebhookState).toHaveBeenCalledWith(
      failureEvent().id,
      'DELIVERED'
    );
  });

  it('only sends to hooks assigned to the post connection or all connections', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([
      hook({
        id: 'wrong-hook',
        integrations: [{ integration: { id: 'integration-2' } }],
      }),
      hook({
        id: 'right-hook',
        integrations: [{ integration: { id: 'integration-1' } }],
      }),
    ]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      code: 'invalid_media',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(webhooks.recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ webhookId: 'right-hook' })
    );
  });

  it('records every receiver rejection and marks delivery failed after three attempts', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      code: 'provider_unavailable',
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(webhooks.recordDelivery).toHaveBeenCalledTimes(3);
    expect(webhooks.recordDelivery).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        attempt: 3,
        status: 'FAILED',
        statusCode: 503,
        error: 'HTTP 503',
      })
    );
    expect(repository.markWebhookState).toHaveBeenCalledWith(
      failureEvent().id,
      'FAILED'
    );
  });

  it('records transport exceptions without losing the persisted post failure', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    webhooks.recordDelivery.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        state: 'FAILED',
        code: 'provider_unavailable',
      })
    ).resolves.toMatchObject({ id: failureEvent().id });

    expect(repository.record).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(repository.markWebhookState).toHaveBeenCalledWith(
      failureEvent().id,
      'FAILED'
    );
  });

  it('marks hook-discovery failures rather than swallowing them', async () => {
    webhooks.getWebhooksForDelivery.mockRejectedValue(
      new Error('webhook database unavailable')
    );

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      code: 'internal_error',
    });

    expect(repository.markWebhookState).toHaveBeenCalledWith(
      failureEvent().id,
      'FAILED'
    );
  });

  it('does not redeliver a deterministic event already marked delivered', async () => {
    repository.record.mockResolvedValue(
      failureEvent({ webhookState: 'DELIVERED' })
    );

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      code: 'invalid_media',
    });

    expect(webhooks.getWebhooksForDelivery).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces a persistence failure so the caller can retry it', async () => {
    repository.record.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        state: 'FAILED',
        error: {},
      })
    ).rejects.toThrow('database unavailable');
    expect(webhooks.getWebhooksForDelivery).not.toHaveBeenCalled();
  });

  it('surfaces failed-receipt persistence failure after preserving the classified failure', async () => {
    receipts.record.mockRejectedValue(
      new Error('receipt database unavailable')
    );

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        state: 'FAILED',
        code: 'invalid_media',
      })
    ).rejects.toThrow('receipt database unavailable');
    expect(repository.record).toHaveBeenCalledTimes(1);
    expect(connectionHealth.recordPublishingFailure).not.toHaveBeenCalled();
    expect(webhooks.getWebhooksForDelivery).not.toHaveBeenCalled();
  });

  it('surfaces health persistence failure before webhook delivery so the activity retries it', async () => {
    connectionHealth.recordPublishingFailure.mockRejectedValue(
      new Error('health database unavailable')
    );

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        state: 'FAILED',
        code: 'provider_unavailable',
      })
    ).rejects.toThrow('health database unavailable');

    expect(repository.record).toHaveBeenCalledTimes(1);
    expect(receipts.record).toHaveBeenCalledTimes(1);
    expect(webhooks.getWebhooksForDelivery).not.toHaveBeenCalled();
  });
});
