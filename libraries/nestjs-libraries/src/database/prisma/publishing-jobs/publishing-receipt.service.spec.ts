import { createHmac } from 'crypto';
import { PublishingReceiptService } from './publishing-receipt.service';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class WebhooksService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ getSsrfSafeDispatcher: jest.fn(() => undefined) })
);

const occurredAt = new Date('2026-08-10T13:00:00.000Z');

function event(stage = 'sent', overrides: Record<string, unknown> = {}) {
  return {
    id: `post.receipt:post-1:${stage}:1:abc123`,
    organizationId: 'org-1',
    postId: 'post-1',
    publishingJobId: 'job-1',
    provider: 'instagram',
    stage,
    attempt: 1,
    providerPostId: stage === 'sent' ? 'provider-1' : null,
    providerUrl: stage === 'sent' ? 'https://instagram.com/p/provider-1' : null,
    confirmationMethod: null,
    evidence: null,
    failureId: null,
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
    url: 'https://hooks.example.com/receipts',
    signingSecret: 'whsec_receipt',
    integrations: [],
    ...overrides,
  };
}

describe('PublishingReceiptService', () => {
  let repository: {
    record: jest.Mock;
    findStage: jest.Mock;
    getCurrentAttempt: jest.Mock;
    markWebhookState: jest.Mock;
    listForPost: jest.Mock;
    isConfirmed: jest.Mock;
  };
  let webhooks: {
    getWebhooksForDelivery: jest.Mock;
    recordDelivery: jest.Mock;
  };
  let service: PublishingReceiptService;
  let connectionHealth: { recordPublishingReceipt: jest.Mock };

  beforeEach(() => {
    repository = {
      record: jest.fn((input) => Promise.resolve(event(input.stage))),
      findStage: jest.fn().mockResolvedValue(null),
      getCurrentAttempt: jest.fn().mockResolvedValue({ attempts: 1 }),
      markWebhookState: jest.fn().mockResolvedValue(undefined),
      listForPost: jest.fn(),
      isConfirmed: jest.fn(),
    };
    webhooks = {
      getWebhooksForDelivery: jest.fn().mockResolvedValue([]),
      recordDelivery: jest.fn().mockResolvedValue(undefined),
    };
    connectionHealth = {
      recordPublishingReceipt: jest.fn().mockResolvedValue(undefined),
    };
    service = new PublishingReceiptService(
      repository as any,
      webhooks as any,
      connectionHealth as any
    );
    jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    global.fetch = jest.fn() as any;
  });

  afterEach(() => jest.restoreAllMocks());

  it('reconstructs queued and uploading before a sent receipt', async () => {
    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'sent',
      providerPostId: 'provider-1',
      providerUrl: 'https://instagram.com/p/provider-1',
    });

    expect(repository.record.mock.calls.map(([input]) => input.stage)).toEqual([
      'queued',
      'uploading',
      'sent',
    ]);
    expect(connectionHealth.recordPublishingReceipt).toHaveBeenCalledTimes(3);
    expect(repository.markWebhookState).toHaveBeenCalledTimes(3);
  });

  it('does not duplicate lifecycle stages that already exist', async () => {
    repository.findStage.mockResolvedValue(event('queued'));

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'uploading',
    });

    expect(repository.record).toHaveBeenCalledTimes(1);
    expect(repository.record).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'uploading' })
    );
  });

  it('removes secret evidence keys and bounds strings before persistence', async () => {
    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'queued',
      evidence: {
        accessToken: 'secret',
        providerStatus: 'x'.repeat(2_000),
        count: 4,
      },
    });

    const input = repository.record.mock.calls[0][0];
    expect(input.evidence.accessToken).toBeUndefined();
    expect(input.evidence.providerStatus).toHaveLength(1_000);
    expect(input.evidence.count).toBe(4);
  });

  it('delivers a signed post.receipt event with the exact lifecycle stage', async () => {
    repository.findStage.mockResolvedValue(event('queued'));
    repository.record.mockResolvedValue(
      event('confirmed_live', {
        providerPostId: 'provider-1',
        providerUrl: 'https://instagram.com/p/provider-1',
        confirmationMethod: 'provider_status_api',
        evidence: { providerStatus: 'completed' },
      })
    );
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'confirmed_live',
      providerPostId: 'provider-1',
      providerUrl: 'https://instagram.com/p/provider-1',
      confirmationMethod: 'provider_status_api',
    });

    const [, request] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.type).toBe('post.receipt');
    expect(payload.data).toMatchObject({
      postId: 'post-1',
      stage: 'confirmed_live',
      providerPostId: 'provider-1',
      confirmationMethod: 'provider_status_api',
    });
    const timestamp = request.headers['X-Publishly-Timestamp'];
    const signature = createHmac('sha256', 'whsec_receipt')
      .update(`${timestamp}.${request.body}`)
      .digest('hex');
    expect(request.headers['X-Publishly-Signature']).toBe(
      `t=${timestamp},v1=${signature}`
    );
    expect(repository.markWebhookState).toHaveBeenLastCalledWith(
      expect.stringContaining('confirmed_live'),
      'DELIVERED'
    );
  });

  it('records three receiver rejections and marks the receipt webhook failed', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'queued',
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(webhooks.recordDelivery).toHaveBeenCalledTimes(3);
    expect(repository.markWebhookState).toHaveBeenLastCalledWith(
      expect.any(String),
      'FAILED'
    );
  });

  it('records transport failure even when the attempt ledger is unavailable', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));
    webhooks.recordDelivery.mockRejectedValue(new Error('ledger unavailable'));

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        stage: 'queued',
      })
    ).resolves.toBeDefined();
    expect(repository.markWebhookState).toHaveBeenLastCalledWith(
      expect.any(String),
      'FAILED'
    );
  });

  it('marks hook-discovery failure instead of swallowing it', async () => {
    webhooks.getWebhooksForDelivery.mockRejectedValue(
      new Error('webhook database unavailable')
    );

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'queued',
    });

    expect(repository.markWebhookState).toHaveBeenCalledWith(
      expect.any(String),
      'FAILED'
    );
  });

  it('does not redeliver a deterministic receipt already delivered', async () => {
    repository.record.mockResolvedValue(
      event('queued', { webhookState: 'DELIVERED' })
    );

    await service.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'queued',
    });

    expect(webhooks.getWebhooksForDelivery).not.toHaveBeenCalled();
  });

  it('surfaces receipt persistence failure for activity retry', async () => {
    repository.record.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        stage: 'queued',
      })
    ).rejects.toThrow('database unavailable');
    expect(connectionHealth.recordPublishingReceipt).not.toHaveBeenCalled();
  });

  it('surfaces health persistence failure before webhook delivery so the activity retries it', async () => {
    connectionHealth.recordPublishingReceipt.mockRejectedValue(
      new Error('health database unavailable')
    );

    await expect(
      service.record({
        organizationId: 'org-1',
        postId: 'post-1',
        stage: 'queued',
      })
    ).rejects.toThrow('health database unavailable');

    expect(repository.record).toHaveBeenCalledTimes(1);
    expect(webhooks.getWebhooksForDelivery).not.toHaveBeenCalled();
  });
});
