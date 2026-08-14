import { createHmac } from 'crypto';
import { ConnectionHealthService } from './connection-health.service';

jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class WebhooksService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({ getSsrfSafeDispatcher: jest.fn(() => undefined) })
);

const now = new Date('2026-08-10T12:00:00.000Z');

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    internalId: 'provider-account-1',
    organizationId: 'org-1',
    name: 'Main Facebook Page',
    picture: null,
    providerIdentifier: 'facebook',
    type: 'social',
    token: 'encrypted-token',
    disabled: false,
    tokenExpiration: new Date('2026-10-01T12:00:00.000Z'),
    tokenIssuedAt: new Date('2026-08-01T12:00:00.000Z'),
    tokenLifetimeDays: 60,
    tokenHealthState: 'HEALTHY',
    tokenHealthReason: 'The token is healthy.',
    tokenHealthCheckedAt: null,
    tokenHealthChangedAt: new Date('2026-08-01T12:00:00.000Z'),
    tokenWarningDays: null,
    refreshToken: null,
    profile: null,
    deletedAt: null,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: now,
    inBetweenSteps: false,
    refreshNeeded: false,
    rateLimitedUntil: null,
    rateLimitReason: null,
    rateLimitObservedAt: null,
    connectionHealthState: 'HEALTHY',
    connectionHealthReason: 'The connection is healthy.',
    connectionHealthChangedAt: new Date('2026-08-01T12:00:00.000Z'),
    platformTruthState: 'NOT_APPLICABLE',
    platformPublishingMode: 'NOT_APPLICABLE',
    platformAuditState: 'NOT_APPLICABLE',
    platformTruthCode: null,
    platformTruthReason: null,
    platformTruthCheckedAt: null,
    platformTruthChangedAt: null,
    platformAccountType: null,
    platformLinkedResourceId: null,
    platformTruthMetadata: null,
    lastProviderContactAt: now,
    lastSuccessfulPublishAt: null,
    lastFailedPublishAt: null,
    consecutiveErrors: 0,
    lastConnectionErrorCode: null,
    lastConnectionErrorReason: null,
    staleSince: null,
    deadAccountAt: null,
    postingTimes: '[]',
    customInstanceDetails: null,
    customerId: null,
    rootInternalId: null,
    additionalSettings: '[]',
    ...overrides,
  } as any;
}

function healthEvent(
  type = 'TOKEN_EXPIRING',
  overrides: Record<string, unknown> = {}
) {
  return {
    id: `connection.health:integration-1:${type.toLowerCase()}:source-1`,
    organizationId: 'org-1',
    integrationId: 'integration-1',
    provider: 'facebook',
    type,
    severity: 'WARNING',
    code: 'token_expiring',
    reason: 'The facebook token expires in 10 day(s).',
    daysRemaining: 10,
    consecutiveErrors: null,
    sourceEventId: null,
    webhookState: 'PENDING',
    webhookFinishedAt: null,
    occurredAt: now,
    ...overrides,
  } as any;
}

function hook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hook-1',
    name: 'Fleet alerts',
    url: 'https://hooks.example.com/health',
    signingSecret: 'whsec_health',
    integrations: [],
    ...overrides,
  };
}

describe('ConnectionHealthService', () => {
  let repository: {
    listActive: jest.Mock;
    get: jest.Mock;
    recordEvent: jest.Mock;
    updateProjection: jest.Mock;
    applyPublishingFailure: jest.Mock;
    applyPublishingReceipt: jest.Mock;
    markWebhookState: jest.Mock;
    listEvents: jest.Mock;
  };
  let webhooks: {
    getWebhooksForDelivery: jest.Mock;
    recordDelivery: jest.Mock;
  };
  let service: ConnectionHealthService;

  beforeEach(() => {
    repository = {
      listActive: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(null),
      recordEvent: jest.fn().mockImplementation((input) =>
        Promise.resolve(
          healthEvent(input.type, {
            id: input.id,
            organizationId: input.organizationId,
            integrationId: input.integrationId,
            type: input.type,
            severity: input.severity,
            code: input.code,
            reason: input.reason,
            daysRemaining: input.daysRemaining ?? null,
            consecutiveErrors: input.consecutiveErrors ?? null,
            sourceEventId: input.sourceEventId ?? null,
            occurredAt: input.occurredAt ?? now,
          })
        )
      ),
      updateProjection: jest.fn().mockResolvedValue({ count: 1 }),
      applyPublishingFailure: jest.fn(),
      applyPublishingReceipt: jest.fn(),
      markWebhookState: jest.fn().mockResolvedValue(undefined),
      listEvents: jest.fn().mockResolvedValue([]),
    };
    webhooks = {
      getWebhooksForDelivery: jest.fn().mockResolvedValue([]),
      recordDelivery: jest.fn().mockResolvedValue(undefined),
    };
    service = new ConnectionHealthService(repository as any, webhooks as any);
    jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    global.fetch = jest.fn() as any;
  });

  afterEach(() => jest.restoreAllMocks());

  it('crosses a token threshold once and delivers a signed token.expiring webhook', async () => {
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

    await service.evaluateConnection(
      connection({ tokenExpiration: new Date('2026-08-20T12:00:00.000Z') }),
      now
    );

    expect(repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TOKEN_EXPIRING',
        severity: 'WARNING',
        code: 'token_expiring',
        daysRemaining: 10,
        projection: expect.objectContaining({
          tokenHealthState: 'EXPIRING',
          tokenWarningDays: 14,
        }),
      })
    );
    const [, request] = (global.fetch as jest.Mock).mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload).toMatchObject({
      type: 'token.expiring',
      data: {
        integrationId: 'integration-1',
        provider: 'facebook',
        severity: 'warning',
        code: 'token_expiring',
        daysRemaining: 10,
      },
    });
    const timestamp = request.headers['X-Publishly-Timestamp'];
    const signature = createHmac('sha256', 'whsec_health')
      .update(`${timestamp}.${request.body}`)
      .digest('hex');
    expect(request.headers['X-Publishly-Signature']).toBe(
      `t=${timestamp},v1=${signature}`
    );
    expect(repository.markWebhookState).toHaveBeenCalledWith(
      expect.any(String),
      'DELIVERED'
    );
  });

  it('keeps an already-warned token expiring without duplicating its event', async () => {
    await service.evaluateConnection(
      connection({
        tokenExpiration: new Date('2026-08-20T12:00:00.000Z'),
        tokenHealthState: 'EXPIRING',
        tokenWarningDays: 14,
      }),
      now
    );

    expect(repository.recordEvent).not.toHaveBeenCalled();
    expect(repository.updateProjection).toHaveBeenCalledWith(
      'org-1',
      'integration-1',
      expect.objectContaining({ tokenHealthState: 'EXPIRING' })
    );
  });

  it('classifies an expired token with an exact non-empty reason', async () => {
    await service.evaluateConnection(
      connection({ tokenExpiration: new Date('2026-08-08T12:00:00.000Z') }),
      now
    );

    expect(repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TOKEN_EXPIRED',
        severity: 'CRITICAL',
        code: 'token_expired',
        daysRemaining: -2,
        reason: expect.stringMatching(/expired 2 day\(s\) ago/i),
        projection: expect.objectContaining({
          tokenHealthState: 'EXPIRED',
          tokenWarningDays: 0,
        }),
      })
    );
  });

  it('makes refresh-needed and disabled connections explicit without probing staleness', async () => {
    await service.evaluateConnection(connection({ refreshNeeded: true }), now);
    expect(repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CONNECTION_RECONNECT_REQUIRED',
        code: 'reconnect_required',
        reason: expect.stringMatching(/reconnect/i),
      })
    );

    repository.recordEvent.mockClear();
    await service.evaluateConnection(connection({ disabled: true }), now);
    expect(repository.recordEvent).not.toHaveBeenCalled();
    expect(repository.updateProjection).toHaveBeenLastCalledWith(
      'org-1',
      'integration-1',
      expect.objectContaining({ connectionHealthState: 'DISABLED' })
    );
  });

  it.each([
    [14, 'CONNECTION_STALE', 'AT_RISK'],
    [30, 'CONNECTION_DEAD', 'DEAD'],
  ])(
    'emits the correct stale transition after %i days',
    async (days, eventType, state) => {
      await service.evaluateConnection(
        connection({
          lastProviderContactAt: new Date(now.getTime() - days * 86_400_000),
        }),
        now
      );

      expect(repository.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: eventType,
          reason: expect.stringContaining(`${days} days`),
          projection: expect.objectContaining({ connectionHealthState: state }),
        })
      );
    }
  );

  it('evaluates the whole fleet, logs every failed connection, and then fails for durable retry', async () => {
    repository.listActive.mockResolvedValue([
      connection({ id: 'bad-1' }),
      connection({ id: 'good-1' }),
      connection({ id: 'bad-2' }),
    ]);
    const evaluate = jest
      .spyOn(service, 'evaluateConnection')
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('webhook ledger unavailable'));

    await expect(service.evaluateAll(now)).rejects.toThrow(
      /2 connection\(s\).*bad-1.*bad-2/i
    );
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it('turns publishing observations into health changes and ignores non-contact receipt stages', async () => {
    const atRiskEvent = healthEvent('CONNECTION_AT_RISK', {
      severity: 'WARNING',
      code: 'provider_unavailable',
      reason: 'The provider is unavailable.',
    });
    repository.applyPublishingFailure.mockResolvedValue({
      integration: connection({ connectionHealthState: 'AT_RISK' }),
      event: atRiskEvent,
    });
    repository.applyPublishingReceipt.mockResolvedValue({
      integration: connection(),
      event: null,
    });

    await service.recordPublishingFailure({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      id: 'post.failure:1',
      failureCode: 'provider_unavailable',
      reason: 'The provider is unavailable.',
      occurredAt: now,
    });
    await service.recordPublishingReceipt({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      id: 'post.receipt:queued',
      stage: 'queued',
      occurredAt: now,
    });
    await service.recordPublishingReceipt({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      id: 'post.receipt:sent',
      stage: 'sent',
      occurredAt: now,
    });

    expect(repository.applyPublishingFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'provider_unavailable' })
    );
    expect(repository.applyPublishingReceipt).toHaveBeenCalledTimes(1);
    expect(repository.applyPublishingReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'sent' })
    );
  });

  it('persists the original refresh failure reason and emits reconnect-required', async () => {
    await service.recordTokenInvalidation(
      connection(),
      new Error('OAuth refresh token revoked by provider'),
      now
    );

    expect(repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CONNECTION_RECONNECT_REQUIRED',
        code: 'reconnect_required',
        reason: expect.stringMatching(/revoked by provider/i),
        projection: expect.objectContaining({
          refreshNeeded: true,
          tokenHealthState: 'RECONNECT_REQUIRED',
          connectionHealthState: 'RECONNECT_REQUIRED',
          consecutiveErrors: { increment: 1 },
        }),
      })
    );
  });

  it('records token refresh and recovery as separate durable events', async () => {
    const previouslyDead = connection({
      connectionHealthState: 'DEAD',
      consecutiveErrors: 3,
      deadAccountAt: new Date('2026-08-09T12:00:00.000Z'),
    });
    repository.get.mockResolvedValue(
      connection({ tokenIssuedAt: new Date('2026-08-10T11:59:00.000Z') })
    );

    await service.recordTokenRefreshed(previouslyDead, now);

    expect(
      repository.recordEvent.mock.calls.map(([input]) => input.type)
    ).toEqual(['TOKEN_REFRESHED', 'CONNECTION_RECOVERED']);
  });

  it('persists and webhooks a private-only TikTok limitation with no secrets', async () => {
    const tiktok = connection({
      providerIdentifier: 'tiktok',
      platformTruthState: 'UNKNOWN',
      platformPublishingMode: 'UNKNOWN',
      platformAuditState: 'UNKNOWN',
      platformTruthCode: 'tiktok_truth_not_checked',
      platformTruthReason: 'Not checked.',
    });
    repository.get.mockResolvedValue(tiktok);
    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

    await service.recordPlatformTruth(tiktok, {
      state: 'LIMITED',
      publishingMode: 'SELF_ONLY',
      auditState: 'UNAUDITED',
      code: 'tiktok_self_only_unaudited',
      reason: 'TikTok permits private-only publishing for this app.',
      checkedAt: now,
      metadata: {
        privacyLevelOptions: ['SELF_ONLY'],
        maxVideoDurationSeconds: 60,
      },
    });

    expect(repository.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PLATFORM_LIMITATION',
        severity: 'CRITICAL',
        code: 'tiktok_self_only_unaudited',
        projection: expect.objectContaining({
          platformTruthState: 'LIMITED',
          platformPublishingMode: 'SELF_ONLY',
          platformAuditState: 'UNAUDITED',
        }),
      })
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    const payload = JSON.parse(request.body);
    expect(payload).toMatchObject({
      type: 'platform.limitation',
      data: {
        platformTruthState: 'LIMITED',
        code: 'tiktok_self_only_unaudited',
      },
    });
    expect(request.body).not.toContain('encrypted-token');
  });

  it('updates an unchanged truth check without duplicating its event', async () => {
    const ready = connection({
      providerIdentifier: 'instagram',
      platformTruthState: 'READY',
      platformPublishingMode: 'PUBLIC_CAPABLE',
      platformAuditState: 'NOT_APPLICABLE',
      platformTruthCode: 'instagram_graph_ready',
      platformTruthReason: 'ready',
      platformAccountType: 'BUSINESS',
      platformLinkedResourceId: 'page-1',
      platformTruthMetadata: { facebookPageLinked: true },
    });
    repository.get.mockResolvedValue(ready);

    await expect(
      service.recordPlatformTruth(ready, {
        state: 'READY',
        publishingMode: 'PUBLIC_CAPABLE',
        auditState: 'NOT_APPLICABLE',
        code: 'instagram_graph_ready',
        reason: 'ready',
        checkedAt: now,
        accountType: 'BUSINESS',
        linkedResourceId: 'page-1',
        metadata: { facebookPageLinked: true },
      })
    ).resolves.toMatchObject({ changed: false, event: null });
    expect(repository.recordEvent).not.toHaveBeenCalled();
    expect(repository.updateProjection).toHaveBeenCalledWith(
      'org-1',
      'integration-1',
      expect.objectContaining({ platformTruthCheckedAt: now })
    );
  });

  it('records webhook discovery failure and retries receiver rejection three times', async () => {
    webhooks.getWebhooksForDelivery.mockRejectedValueOnce(
      new Error('webhook database unavailable')
    );
    await service.evaluateConnection(
      connection({ tokenExpiration: new Date('2026-08-20T12:00:00.000Z') }),
      now
    );
    expect(repository.markWebhookState).toHaveBeenLastCalledWith(
      expect.any(String),
      'FAILED'
    );

    webhooks.getWebhooksForDelivery.mockResolvedValue([hook()]);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });
    repository.recordEvent.mockClear();
    await service.evaluateConnection(
      connection({
        tokenExpiration: new Date('2026-08-17T12:00:00.000Z'),
        tokenWarningDays: 14,
      }),
      now
    );

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(webhooks.recordDelivery).toHaveBeenCalledTimes(3);
    expect(repository.markWebhookState).toHaveBeenLastCalledWith(
      expect.any(String),
      'FAILED'
    );
  });

  it('surfaces projection disappearance instead of silently completing the sweep', async () => {
    repository.updateProjection.mockResolvedValue({ count: 0 });

    await expect(service.evaluateConnection(connection(), now)).rejects.toThrow(
      /disappeared while updating/i
    );
  });
});
