import { ConnectionHealthRepository } from './connection-health.repository';

const now = new Date('2026-08-10T12:00:00.000Z');

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    organizationId: 'org-1',
    providerIdentifier: 'instagram',
    name: 'Main Instagram',
    disabled: false,
    connectionHealthState: 'HEALTHY',
    connectionHealthReason: 'The connection is healthy.',
    connectionHealthChangedAt: new Date('2026-08-01T12:00:00.000Z'),
    lastProviderContactAt: null,
    lastSuccessfulPublishAt: null,
    lastFailedPublishAt: null,
    consecutiveErrors: 0,
    lastConnectionErrorCode: null,
    lastConnectionErrorReason: null,
    staleSince: null,
    deadAccountAt: null,
    ...overrides,
  } as any;
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection.health:integration-1:connection_at_risk:source-1',
    organizationId: 'org-1',
    integrationId: 'integration-1',
    provider: 'instagram',
    type: 'CONNECTION_AT_RISK',
    severity: 'WARNING',
    code: 'provider_unavailable',
    reason: 'The provider is unavailable.',
    daysRemaining: null,
    consecutiveErrors: 1,
    sourceEventId: 'source-1',
    webhookState: 'PENDING',
    webhookFinishedAt: null,
    occurredAt: now,
    ...overrides,
  } as any;
}

function transactionModel(current = integration()) {
  return {
    integration: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue(current),
    },
    connectionHealthEvent: {
      upsert: jest.fn().mockResolvedValue(event()),
    },
  };
}

describe('ConnectionHealthRepository', () => {
  function setup(tx = transactionModel()) {
    const db = {
      model: {
        integration: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
        connectionHealthEvent: {
          update: jest.fn(),
          findMany: jest.fn(),
        },
      },
    };
    const transaction = {
      model: {
        $transaction: jest.fn((callback) => callback(tx)),
      },
    };
    return {
      repository: new ConnectionHealthRepository(db as any, transaction as any),
      db,
      tx,
    };
  }

  it('atomically appends a deterministic event and updates its projection', async () => {
    const tx = transactionModel();
    tx.integration.findFirst.mockResolvedValue({
      id: 'integration-1',
      providerIdentifier: 'instagram',
      name: 'Main Instagram',
    });
    const { repository } = setup(tx);

    const result = await repository.recordEvent({
      id: 'connection.health:integration-1:token-expiring:expiry:14',
      organizationId: 'org-1',
      integrationId: 'integration-1',
      type: 'TOKEN_EXPIRING',
      severity: 'WARNING',
      code: 'token_expiring',
      reason: 'The token expires in 10 days.',
      daysRemaining: 10,
      projection: { tokenHealthState: 'EXPIRING', tokenWarningDays: 14 },
      occurredAt: now,
    });

    expect(tx.connectionHealthEvent.upsert).toHaveBeenCalledWith({
      where: {
        id: 'connection.health:integration-1:token-expiring:expiry:14',
      },
      create: expect.objectContaining({
        provider: 'instagram',
        code: 'token_expiring',
        reason: 'The token expires in 10 days.',
        daysRemaining: 10,
      }),
      update: {},
    });
    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: { tokenHealthState: 'EXPIRING', tokenWarningDays: 14 },
    });
    expect(result).toMatchObject({ connectionName: 'Main Instagram' });
  });

  it('fails loudly if an event targets a missing or cross-tenant connection', async () => {
    const tx = transactionModel();
    tx.integration.findFirst.mockResolvedValue(null);
    const { repository } = setup(tx);

    await expect(
      repository.recordEvent({
        id: 'health-1',
        organizationId: 'org-1',
        integrationId: 'missing',
        type: 'CONNECTION_DEAD',
        severity: 'CRITICAL',
        code: 'connection_missing',
        reason: 'The connection could not be found.',
      })
    ).rejects.toThrow(/was not found while recording health event/i);
    expect(tx.connectionHealthEvent.upsert).not.toHaveBeenCalled();
  });

  it('marks the first connection-level publish error at risk with a webhook event', async () => {
    const tx = transactionModel(integration());
    tx.integration.update.mockResolvedValue(
      integration({ connectionHealthState: 'AT_RISK', consecutiveErrors: 1 })
    );
    const { repository } = setup(tx);

    const result = await repository.applyPublishingFailure({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      code: 'provider_unavailable',
      reason: 'The provider is unavailable.',
      sourceEventId: 'post.failure:1',
      occurredAt: now,
    });

    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        lastProviderContactAt: now,
        lastFailedPublishAt: now,
        consecutiveErrors: 1,
        connectionHealthState: 'AT_RISK',
        lastConnectionErrorCode: 'provider_unavailable',
        connectionHealthReason: 'The provider is unavailable.',
      }),
    });
    expect(tx.connectionHealthEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'CONNECTION_AT_RISK',
          severity: 'WARNING',
          consecutiveErrors: 1,
          sourceEventId: 'post.failure:1',
        }),
      })
    );
    expect(result.event).toBeTruthy();
  });

  it('declares the third consecutive connection-level error dead', async () => {
    const tx = transactionModel(
      integration({ connectionHealthState: 'AT_RISK', consecutiveErrors: 2 })
    );
    const { repository } = setup(tx);

    await repository.applyPublishingFailure({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      code: 'network_error',
      reason: 'The provider connection failed.',
      sourceEventId: 'post.failure:3',
      occurredAt: now,
    });

    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        consecutiveErrors: 3,
        connectionHealthState: 'DEAD',
        deadAccountAt: now,
      }),
    });
    expect(tx.connectionHealthEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'CONNECTION_DEAD',
          severity: 'CRITICAL',
          consecutiveErrors: 3,
        }),
      })
    );
  });

  it('requires reconnect immediately for auth, permission, and account failures', async () => {
    const tx = transactionModel(integration());
    const { repository } = setup(tx);

    await repository.applyPublishingFailure({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      code: 'permission_required',
      reason: 'Grant the missing publish permission.',
      sourceEventId: 'post.failure:permission',
      occurredAt: now,
    });

    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        consecutiveErrors: 1,
        connectionHealthState: 'RECONNECT_REQUIRED',
      }),
    });
    expect(tx.connectionHealthEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'CONNECTION_RECONNECT_REQUIRED',
          code: 'permission_required',
        }),
      })
    );
  });

  it('never downgrades reconnect-required or dead connections on later transient errors', async () => {
    const reconnectTx = transactionModel(
      integration({
        connectionHealthState: 'RECONNECT_REQUIRED',
        consecutiveErrors: 1,
      })
    );
    const { repository: reconnectRepository } = setup(reconnectTx);
    await reconnectRepository.applyPublishingFailure({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      code: 'network_error',
      reason: 'The provider connection failed.',
      sourceEventId: 'post.failure:after-reconnect',
      occurredAt: now,
    });
    expect(reconnectTx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        connectionHealthState: 'RECONNECT_REQUIRED',
        consecutiveErrors: 2,
      }),
    });
    expect(reconnectTx.connectionHealthEvent.upsert).not.toHaveBeenCalled();

    const deadTx = transactionModel(
      integration({ connectionHealthState: 'DEAD', consecutiveErrors: 3 })
    );
    const { repository: deadRepository } = setup(deadTx);
    await deadRepository.applyPublishingFailure({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      code: 'network_error',
      reason: 'The provider connection failed again.',
      sourceEventId: 'post.failure:after-dead',
      occurredAt: now,
    });
    expect(deadTx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        connectionHealthState: 'DEAD',
        consecutiveErrors: 4,
      }),
    });
    expect(deadTx.connectionHealthEvent.upsert).not.toHaveBeenCalled();
  });

  it('does not count rate limits or data problems as dead-account evidence', async () => {
    for (const code of ['rate_limited', 'invalid_media']) {
      const tx = transactionModel(
        integration({ connectionHealthState: 'AT_RISK', consecutiveErrors: 2 })
      );
      const { repository } = setup(tx);

      await repository.applyPublishingFailure({
        organizationId: 'org-1',
        integrationId: 'integration-1',
        code,
        reason: `Failure ${code}`,
        sourceEventId: `post.failure:${code}`,
        occurredAt: now,
      });

      expect(tx.integration.update).toHaveBeenCalledWith({
        where: { id: 'integration-1' },
        data: {
          lastFailedPublishAt: now,
          lastProviderContactAt: now,
        },
      });
      expect(tx.connectionHealthEvent.upsert).not.toHaveBeenCalled();
    }
  });

  it('records sent contact without claiming the post is live', async () => {
    const tx = transactionModel(integration());
    const { repository } = setup(tx);

    const result = await repository.applyPublishingReceipt({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      stage: 'sent',
      sourceEventId: 'post.receipt:sent',
      occurredAt: now,
    });

    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: { lastProviderContactAt: now },
    });
    expect(tx.connectionHealthEvent.upsert).not.toHaveBeenCalled();
    expect(result.event).toBeNull();
  });

  it('uses confirmed-live evidence to recover and reset a dead connection', async () => {
    const tx = transactionModel(
      integration({
        connectionHealthState: 'DEAD',
        consecutiveErrors: 3,
        staleSince: new Date('2026-07-01T12:00:00.000Z'),
        deadAccountAt: new Date('2026-08-01T12:00:00.000Z'),
      })
    );
    const { repository } = setup(tx);

    await repository.applyPublishingReceipt({
      organizationId: 'org-1',
      integrationId: 'integration-1',
      stage: 'confirmed_live',
      sourceEventId: 'post.receipt:confirmed',
      occurredAt: now,
    });

    expect(tx.integration.update).toHaveBeenCalledWith({
      where: { id: 'integration-1' },
      data: expect.objectContaining({
        lastProviderContactAt: now,
        lastSuccessfulPublishAt: now,
        consecutiveErrors: 0,
        lastConnectionErrorCode: null,
        staleSince: null,
        deadAccountAt: null,
        connectionHealthState: 'HEALTHY',
      }),
    });
    expect(tx.connectionHealthEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'CONNECTION_RECOVERED',
          severity: 'RECOVERY',
          code: 'confirmed_live',
        }),
      })
    );
  });

  it('fails loudly when a publishing observation cannot find its connection', async () => {
    const tx = transactionModel();
    tx.integration.findFirst.mockResolvedValue(null);
    const { repository } = setup(tx);

    await expect(
      repository.applyPublishingFailure({
        organizationId: 'org-1',
        integrationId: 'missing',
        code: 'network_error',
        reason: 'Network error.',
        sourceEventId: 'post.failure:missing',
      })
    ).rejects.toThrow(/not found while applying publishing failure/i);
    await expect(
      repository.applyPublishingReceipt({
        organizationId: 'org-1',
        integrationId: 'missing',
        stage: 'confirmed_live',
        sourceEventId: 'post.receipt:missing',
      })
    ).rejects.toThrow(/not found while applying receipt/i);
  });
});
