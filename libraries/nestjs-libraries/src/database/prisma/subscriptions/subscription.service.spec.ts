jest.mock('./subscription.repository', () => ({
  SubscriptionRepository: class SubscriptionRepository {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class OrganizationService {} })
);

import { SubscriptionService } from './subscription.service';
import { UNLIMITED_CHANNELS } from './pricing';

describe('SubscriptionService successful-post billing', () => {
  let repository: any;
  let integrations: any;
  let organizations: any;
  let service: SubscriptionService;

  beforeEach(() => {
    repository = {
      getSubscriptionByOrganizationId: jest.fn(),
      countSuccessfulPostUsage: jest.fn(),
      getSubscriptionByOrgId: jest.fn(),
      getSubscriptionByCustomerId: jest.fn(),
      getOrganizationByCustomerId: jest.fn(),
      createOrUpdateSubscription: jest.fn(),
    };
    integrations = {
      getIntegrationsList: jest.fn().mockResolvedValue([]),
      disableIntegrations: jest.fn(),
      changeActiveCron: jest.fn(),
    };
    organizations = {
      disableOrEnableNonSuperAdminUsers: jest.fn(),
    };
    service = new SubscriptionService(repository, integrations, organizations);
  });

  it('counts only durable successful usage inside the subscription anniversary window', async () => {
    repository.getSubscriptionByOrganizationId.mockResolvedValue({
      subscriptionTier: 'TEAM',
      createdAt: new Date('2026-01-31T12:00:00.000Z'),
    });
    repository.countSuccessfulPostUsage.mockResolvedValue(125);

    const usage = await service.getSuccessfulPostUsage(
      'org-1',
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2026-03-30T12:00:00.000Z')
    );

    expect(repository.countSuccessfulPostUsage).toHaveBeenCalledWith(
      'org-1',
      new Date('2026-02-28T12:00:00.000Z'),
      new Date('2026-03-31T12:00:00.000Z')
    );
    expect(usage).toMatchObject({
      metric: 'confirmed_live_destinations',
      tier: 'TEAM',
      used: 125,
      limit: 15_000,
      remaining: 14_875,
    });
  });

  it('uses the organization creation anchor and Free allowance without a subscription', async () => {
    repository.getSubscriptionByOrganizationId.mockResolvedValue(null);
    repository.countSuccessfulPostUsage.mockResolvedValue(50);

    await expect(
      service.getSuccessfulPostUsage(
        'org-1',
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-08-10T00:00:00.000Z')
      )
    ).resolves.toMatchObject({
      tier: 'FREE',
      used: 50,
      limit: 50,
      remaining: 0,
      exhausted: true,
    });
  });

  it('derives the unlimited account sentinel server-side and maps legacy ULTIMATE to Scale', async () => {
    repository.createOrUpdateSubscription.mockResolvedValue({ id: 'sub-1' });

    await service.createOrUpdateSubscription(
      false,
      'sub-1',
      'customer-1',
      'ULTIMATE',
      'MONTHLY',
      null,
      'lifetime-code',
      'org-1'
    );

    expect(repository.createOrUpdateSubscription).toHaveBeenCalledWith(
      false,
      'sub-1',
      'customer-1',
      UNLIMITED_CHANNELS,
      'PRO',
      'MONTHLY',
      null,
      'lifetime-code',
      { id: 'org-1' }
    );
  });

  it('never disables paid-plan connections but enforces Free five-account cap', async () => {
    const connections = Array.from({ length: 500 }, (_, index) => ({
      id: `connection-${index}`,
      disabled: false,
    }));
    repository.getSubscriptionByOrgId.mockResolvedValue({
      subscriptionTier: 'TEAM',
    });
    integrations.getIntegrationsList.mockResolvedValue(connections);

    await service.modifySubscriptionByOrg('org-1', 'PRO');
    expect(integrations.disableIntegrations).not.toHaveBeenCalled();

    await service.modifySubscriptionByOrg('org-1', 'FREE');
    expect(integrations.disableIntegrations).toHaveBeenCalledWith('org-1', 495);
  });

  it('fails visibly when a paid webhook cannot resolve its organization', async () => {
    repository.getOrganizationByCustomerId.mockResolvedValue(null);
    repository.getSubscriptionByCustomerId.mockResolvedValue(null);

    await expect(
      service.createOrUpdateSubscription(
        false,
        'sub-missing',
        'customer-missing',
        'STANDARD',
        'MONTHLY',
        null
      )
    ).rejects.toThrow(/could not resolve/i);
    expect(repository.createOrUpdateSubscription).not.toHaveBeenCalled();
  });
});
