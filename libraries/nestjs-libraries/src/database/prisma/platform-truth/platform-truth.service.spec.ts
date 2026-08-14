import { PlatformTruthService } from './platform-truth.service';
import { PlatformTruthInspectionError } from '@gitroom/nestjs-libraries/reliability/platform.truth';

jest.mock('@gitroom/helpers/auth/crypto.v2', () => ({
  open: jest.fn(() => 'opened-token'),
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository',
  () => ({ IntegrationRepository: class IntegrationRepository {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/connection-health/connection-health.service',
  () => ({ ConnectionHealthService: class ConnectionHealthService {} })
);
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManager {},
}));

const integration = {
  id: 'integration-1',
  organizationId: 'org-1',
  providerIdentifier: 'tiktok',
  token: 'sealed-token',
  internalId: 'creator-1',
} as any;

const ready = {
  state: 'READY' as const,
  publishingMode: 'PUBLIC_CAPABLE' as const,
  auditState: 'AUDITED' as const,
  code: 'tiktok_public_posting_ready',
  reason: 'TikTok public posting is ready.',
  checkedAt: new Date('2026-08-10T12:00:00.000Z'),
  metadata: { privacyLevelOptions: ['PUBLIC_TO_EVERYONE' as const] },
};

describe('PlatformTruthService', () => {
  let repository: {
    getIntegrationById: jest.Mock;
    listPlatformTruthConnections: jest.Mock;
  };
  let provider: { inspectPlatformTruth: jest.Mock };
  let manager: { getSocialIntegration: jest.Mock };
  let health: { recordPlatformTruth: jest.Mock };
  let service: PlatformTruthService;

  beforeEach(() => {
    repository = {
      getIntegrationById: jest.fn().mockResolvedValue(integration),
      listPlatformTruthConnections: jest.fn().mockResolvedValue([integration]),
    };
    provider = { inspectPlatformTruth: jest.fn().mockResolvedValue(ready) };
    manager = { getSocialIntegration: jest.fn(() => provider) };
    health = { recordPlatformTruth: jest.fn().mockResolvedValue(undefined) };
    service = new PlatformTruthService(
      repository as any,
      manager as any,
      health as any
    );
  });

  it('opens the token, records the snapshot, and returns only redacted truth', async () => {
    const result = await service.refreshConnection('org-1', 'integration-1');
    expect(provider.inspectPlatformTruth).toHaveBeenCalledWith(
      'opened-token',
      integration
    );
    expect(health.recordPlatformTruth).toHaveBeenCalledWith(integration, ready);
    expect(result).toMatchObject({
      snapshot: ready,
      response: {
        state: 'READY',
        publishingMode: 'PUBLIC_CAPABLE',
        code: 'tiktok_public_posting_ready',
      },
      failure: null,
    });
    expect(JSON.stringify(result.response)).not.toContain('opened-token');
    expect(JSON.stringify(result.response)).not.toContain('sealed-token');
  });

  it('persists a classified UNKNOWN snapshot when provider inspection is recoverable', async () => {
    provider.inspectPlatformTruth.mockRejectedValue(
      new PlatformTruthInspectionError(
        'recoverable',
        'tiktok_creator_info_rate_limited',
        'TikTok creator-info is rate limited.'
      )
    );
    const result = await service.refreshIntegration(integration);
    expect(result).toMatchObject({
      snapshot: {
        state: 'UNKNOWN',
        code: 'tiktok_creator_info_rate_limited',
      },
      failure: {
        failureClass: 'recoverable',
        code: 'tiktok_creator_info_rate_limited',
      },
    });
    expect(health.recordPlatformTruth).toHaveBeenCalledWith(
      integration,
      expect.objectContaining({ state: 'UNKNOWN' })
    );
  });

  it('persists INVALID for credential or permission action', async () => {
    provider.inspectPlatformTruth.mockRejectedValue(
      new PlatformTruthInspectionError(
        'user_action_needed',
        'tiktok_publish_permission_required',
        'Reconnect with video.publish.'
      )
    );
    await expect(
      service.refreshIntegration(integration)
    ).resolves.toMatchObject({
      snapshot: {
        state: 'INVALID',
        code: 'tiktok_publish_permission_required',
      },
      failure: { failureClass: 'user_action_needed' },
    });
  });

  it('never hides a projection persistence failure', async () => {
    health.recordPlatformTruth.mockRejectedValue(
      new Error('platform truth database unavailable')
    );
    await expect(service.refreshIntegration(integration)).rejects.toThrow(
      'platform truth database unavailable'
    );
  });

  it('enforces tenant ownership when refreshing one connection', async () => {
    repository.getIntegrationById.mockResolvedValue(null);
    await expect(
      service.refreshConnection('other-org', 'integration-1')
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'connection_not_found' }),
    });
    expect(provider.inspectPlatformTruth).not.toHaveBeenCalled();
  });

  it('continues the fleet and then fails when a durable projection write fails', async () => {
    repository.listPlatformTruthConnections.mockResolvedValue([
      integration,
      { ...integration, id: 'integration-2' },
      { ...integration, id: 'integration-3' },
    ]);
    jest
      .spyOn(service, 'refreshIntegration')
      .mockRejectedValueOnce(new Error('write failed one'))
      .mockResolvedValueOnce({ snapshot: ready } as any)
      .mockRejectedValueOnce(new Error('write failed three'));

    await expect(service.evaluateAll()).rejects.toThrow(
      /2 connection\(s\).*integration-1.*integration-3/i
    );
  });
});
