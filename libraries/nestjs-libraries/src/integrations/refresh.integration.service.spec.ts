import { open as openSealed } from '@gitroom/helpers/auth/crypto.v2';
import {
  RefreshIntegrationService,
  TokenRefreshWorkflowStartError,
} from './refresh.integration.service';

jest.mock('@gitroom/helpers/auth/crypto.v2', () => ({
  open: jest.fn(() => 'decrypted-refresh-token'),
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service',
  () => ({ ConnectionHealthService: class ConnectionHealthService {} })
);
jest.mock('nestjs-temporal-core', () => ({
  TemporalService: class TemporalService {},
}));

function integration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'integration-1',
    internalId: 'page-1',
    rootInternalId: 'root-1',
    organizationId: 'org-1',
    providerIdentifier: 'facebook',
    name: 'Main Page',
    picture: 'https://images.example.com/page.jpg',
    refreshToken: 'sealed-refresh-token',
    connectionHealthState: 'HEALTHY',
    consecutiveErrors: 0,
    staleSince: null,
    deadAccountAt: null,
    ...overrides,
  } as any;
}

function token(overrides: Record<string, unknown> = {}) {
  return {
    id: 'root-1',
    name: 'Main Page',
    username: 'main-page',
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    expiresIn: 3600,
    ...overrides,
  } as any;
}

describe('RefreshIntegrationService', () => {
  let provider: {
    oneTimeToken?: boolean;
    refreshToken: jest.Mock;
    reConnect?: jest.Mock;
    refreshCron?: boolean;
  };
  let manager: { getSocialIntegration: jest.Mock };
  let integrations: {
    createOrUpdateIntegration: jest.Mock;
    refreshNeeded: jest.Mock;
    informAboutRefreshError: jest.Mock;
    setBetweenRefreshSteps: jest.Mock;
    purgeExternallyRevokedChannel: jest.Mock;
  };
  let health: {
    recordTokenInvalidation: jest.Mock;
    recordTokenRefreshed: jest.Mock;
  };
  let service: RefreshIntegrationService;
  let temporal: {
    client: { getRawClient: jest.Mock };
  };

  beforeEach(() => {
    provider = {
      refreshToken: jest.fn().mockResolvedValue(token()),
      reConnect: jest.fn().mockResolvedValue({
        id: 'page-1',
        name: 'Main Page',
        username: 'main-page',
        accessToken: 'page-access-token',
      }),
    };
    manager = { getSocialIntegration: jest.fn(() => provider) };
    integrations = {
      createOrUpdateIntegration: jest.fn().mockResolvedValue(undefined),
      refreshNeeded: jest.fn().mockResolvedValue(undefined),
      informAboutRefreshError: jest.fn().mockResolvedValue(undefined),
      setBetweenRefreshSteps: jest.fn().mockResolvedValue(undefined),
      purgeExternallyRevokedChannel: jest.fn().mockResolvedValue(true),
    };
    health = {
      recordTokenInvalidation: jest.fn().mockResolvedValue(undefined),
      recordTokenRefreshed: jest.fn().mockResolvedValue(undefined),
    };
    temporal = {
      client: {
        getRawClient: jest.fn(() => ({
          workflow: {
            start: jest.fn().mockResolvedValue({ workflowId: 'refresh-1' }),
          },
        })),
      },
    };
    service = new RefreshIntegrationService(
      manager as any,
      integrations as any,
      temporal as any,
      health as any
    );
  });

  it('persists a refreshed token horizon before recording recovery', async () => {
    const current = integration();

    await expect(service.refresh(current)).resolves.toMatchObject({
      accessToken: 'page-access-token',
    });

    expect(openSealed).toHaveBeenCalledWith('sealed-refresh-token');
    expect(integrations.createOrUpdateIntegration).toHaveBeenCalledWith(
      undefined,
      false,
      'org-1',
      'Main Page',
      'https://images.example.com/page.jpg',
      'social',
      'page-1',
      'facebook',
      'page-access-token',
      'new-refresh-token',
      3600
    );
    expect(health.recordTokenRefreshed).toHaveBeenCalledWith(current);
  });

  it('retains a thrown provider reason, flags reconnect, and notifies the operator', async () => {
    provider.refreshToken.mockRejectedValue(
      new Error('OAuth refresh token was revoked by the provider')
    );
    const current = integration();

    await expect(service.refresh(current)).resolves.toBe(false);

    expect(health.recordTokenInvalidation).toHaveBeenCalledWith(
      current,
      expect.stringMatching(/revoked by the provider/i)
    );
    expect(integrations.refreshNeeded).toHaveBeenCalledWith(
      'org-1',
      'integration-1'
    );
    expect(integrations.informAboutRefreshError).toHaveBeenCalledWith(
      'org-1',
      current,
      expect.stringMatching(/revoked by the provider/i)
    );
    expect(integrations.createOrUpdateIntegration).not.toHaveBeenCalled();
  });

  it('classifies an empty provider refresh response with a non-empty reason', async () => {
    provider.refreshToken.mockResolvedValue(false);

    await expect(service.refresh(integration(), 'Token expired')).resolves.toBe(
      false
    );

    expect(health.recordTokenInvalidation).toHaveBeenCalledWith(
      expect.any(Object),
      'Token expired'
    );
  });

  it('records a reconnect lookup failure instead of letting it escape unobserved', async () => {
    provider.reConnect!.mockRejectedValue(
      new Error('The page is no longer linked to this account')
    );

    await expect(service.refresh(integration())).resolves.toBe(false);

    expect(health.recordTokenInvalidation).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringMatching(/no longer linked/i)
    );
    expect(integrations.refreshNeeded).toHaveBeenCalledTimes(1);
    expect(integrations.createOrUpdateIntegration).not.toHaveBeenCalled();
  });

  it('surfaces health-ledger failure so a durable caller retries the invalidation', async () => {
    provider.refreshToken.mockRejectedValue(new Error('Token revoked'));
    health.recordTokenInvalidation.mockRejectedValue(
      new Error('health ledger unavailable')
    );

    await expect(service.refresh(integration())).rejects.toThrow(
      'health ledger unavailable'
    );
    expect(integrations.refreshNeeded).not.toHaveBeenCalled();
    expect(integrations.informAboutRefreshError).not.toHaveBeenCalled();
  });

  it('surfaces token-write failure and never claims the connection recovered', async () => {
    integrations.createOrUpdateIntegration.mockRejectedValue(
      new Error('token database unavailable')
    );

    await expect(service.refresh(integration())).rejects.toThrow(
      'token database unavailable'
    );
    expect(health.recordTokenRefreshed).not.toHaveBeenCalled();
  });

  it('purges YouTube provider data after an authoritative invalid_grant', async () => {
    provider.refreshToken.mockRejectedValue({
      response: {
        data: {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        },
      },
    });
    const current = integration({ providerIdentifier: 'youtube' });

    await expect(service.refresh(current)).resolves.toBe(false);

    expect(integrations.purgeExternallyRevokedChannel).toHaveBeenCalledWith(
      'org-1',
      'integration-1'
    );
    expect(
      health.recordTokenInvalidation.mock.invocationCallOrder[0]
    ).toBeLessThan(
      integrations.purgeExternallyRevokedChannel.mock.invocationCallOrder[0]
    );
    expect(
      integrations.informAboutRefreshError.mock.invocationCallOrder[0]
    ).toBeLessThan(
      integrations.purgeExternallyRevokedChannel.mock.invocationCallOrder[0]
    );
  });

  it('retains YouTube data when refresh failed for a transient outage', async () => {
    provider.refreshToken.mockRejectedValue(
      new Error('Google token endpoint unavailable (HTTP 503)')
    );

    await expect(
      service.refresh(integration({ providerIdentifier: 'youtube' }))
    ).resolves.toBe(false);

    expect(integrations.purgeExternallyRevokedChannel).not.toHaveBeenCalled();
  });

  it('does not allocate a workflow for providers without scheduled refresh', async () => {
    await expect(
      service.startRefreshWorkflow(integration(), {
        refreshCron: false,
      } as any)
    ).resolves.toBe(false);
    expect(temporal.client.getRawClient).not.toHaveBeenCalled();
  });

  it('classifies, records, and notifies a durable refresh scheduler failure', async () => {
    temporal.client.getRawClient.mockReturnValue({
      workflow: {
        start: jest.fn().mockRejectedValue(new Error('Temporal unavailable')),
      },
    });
    const current = integration({ providerIdentifier: 'youtube' });

    await expect(
      service.startRefreshWorkflow(current, { refreshCron: true } as any)
    ).rejects.toMatchObject({
      name: 'TokenRefreshWorkflowStartError',
      failureClass: 'recoverable',
      code: 'token_refresh_scheduler_unavailable',
      retryable: true,
      message: expect.stringMatching(/Temporal unavailable/i),
    });
    expect(health.recordTokenInvalidation).toHaveBeenCalledWith(
      current,
      expect.stringMatching(/could not start durable youtube token monitoring/i)
    );
    expect(integrations.informAboutRefreshError).toHaveBeenCalledWith(
      'org-1',
      current,
      expect.stringMatching(/could not start durable youtube token monitoring/i)
    );
  });

  it('treats a missing Temporal workflow handle as an observable failure', async () => {
    temporal.client.getRawClient.mockReturnValue(undefined);

    await expect(
      service.startRefreshWorkflow(integration(), {
        refreshCron: true,
      } as any)
    ).rejects.toBeInstanceOf(TokenRefreshWorkflowStartError);
    expect(health.recordTokenInvalidation).toHaveBeenCalledTimes(1);
  });
});
