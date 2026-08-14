jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.service',
  () => ({ BulkImportService: class BulkImportService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class PostsService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.service',
  () => ({ AuditLogService: class AuditLogService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign.service',
  () => ({ BulkCampaignService: class BulkCampaignService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-campaign-execution.service',
  () => ({
    BulkCampaignExecutionService: class BulkCampaignExecutionService {},
  })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/bulk-upload.service',
  () => ({ BulkUploadService: class BulkUploadService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.service',
  () => ({ CalendarReservationService: class CalendarReservationService {} })
);

import { BulkImportController } from './bulk-import.controller';

const tupleId = 'instagram.professional.reel.video';

describe('BulkImportController controlled canary preflight', () => {
  const originalEnvironment = { ...process.env };
  const integration: any = {
    id: 'ig-canary-1',
    organizationId: 'org-canary',
    name: 'Publishly Provider Canary',
    providerIdentifier: 'instagram',
    disabled: false,
    refreshNeeded: false,
    inBetweenSteps: false,
    deletedAt: null,
    tokenHealthState: 'HEALTHY',
    connectionHealthState: 'HEALTHY',
    token: 'must-never-leave-the-server',
    refreshToken: 'also-private',
  };

  function controller(overrides: Record<string, unknown> = {}) {
    const integrations = {
      getIntegrationById: jest
        .fn()
        .mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'integration')
            ? overrides.integration
            : integration
        ),
      getIntegrationsList: jest.fn().mockResolvedValue([integration]),
    };
    const reservations = {
      resolveWriterMode: jest
        .fn()
        .mockResolvedValue(overrides.writerMode || 'AUTHORITATIVE'),
    };
    return {
      instance: new BulkImportController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        integrations as any,
        reservations as any
      ),
      integrations,
      reservations,
    };
  }

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      PUBLISHLY_BUILD_REVISION: 'revision-under-test',
      BULK_SCHEDULER_CANARY_MODE: 'true',
      BULK_SCHEDULER_CANARY_TUPLES: tupleId,
      BULK_SCHEDULER_CANARY_INTEGRATIONS: integration.id,
      BULK_SCHEDULER_MATERIALIZER_ENABLED: 'true',
      BULK_SCHEDULER_KILL_ALL: 'false',
      BULK_SCHEDULER_KILL_INSTAGRAM_PROFESSIONAL_REEL_VIDEO: 'false',
    };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('returns exact non-secret tuple, runtime, tenant, and destination evidence', async () => {
    const { instance } = controller();
    const result = await instance.getSchedulerCanaryPreflight(
      { id: 'org-canary' } as any,
      tupleId,
      integration.id
    );

    expect(result).toMatchObject({
      organizationId: 'org-canary',
      buildRevision: 'revision-under-test',
      canaryMode: true,
      materializerEnabled: true,
      calendarWriterMode: 'AUTHORITATIVE',
      tuple: {
        id: tupleId,
        provider: 'instagram',
        defaultEligible: false,
        privateTransportReady: true,
        confirmationImplemented: true,
        ambiguityRecoveryImplemented: true,
      },
      integration: {
        id: integration.id,
        name: integration.name,
        providerIdentifier: 'instagram',
      },
      decision: { eligible: true, code: 'eligible' },
    });
    expect(result.matrixHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(integration.token);
    expect(JSON.stringify(result)).not.toContain(integration.refreshToken);
  });

  it('rejects a cross-provider destination before returning canary readiness', async () => {
    const { instance } = controller({
      integration: { ...integration, providerIdentifier: 'facebook' },
    });
    await expect(
      instance.getSchedulerCanaryPreflight(
        { id: 'org-canary' } as any,
        tupleId,
        integration.id
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        failureClass: 'data_problem',
        code: 'canary_provider_mismatch',
        reason: expect.any(String),
      }),
    });
  });

  it('does not find an integration from another tenant', async () => {
    const { instance, integrations } = controller({ integration: null });
    await expect(
      instance.getSchedulerCanaryPreflight(
        { id: 'other-org' } as any,
        tupleId,
        integration.id
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        failureClass: 'user_action_needed',
        code: 'canary_integration_not_found',
        reason: expect.any(String),
      }),
    });
    expect(integrations.getIntegrationById).toHaveBeenCalledWith(
      'other-org',
      integration.id
    );
  });
});
