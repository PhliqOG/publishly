jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service',
  () => ({ WebhooksService: class WebhooksService {} })
);

import { PermissionsService } from './permissions.service';
import { AuthorizationActions, Sections } from './permission.exception.class';

describe('PermissionsService workspace roles', () => {
  const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;

  afterEach(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
    }
  });

  function service() {
    return new PermissionsService(
      {
        getSubscription: jest.fn(),
        getSubscriptionByOrganizationId: jest.fn(),
        getSuccessfulPostUsage: jest.fn().mockResolvedValue({
          used: 0,
          limit: 50,
          remaining: 50,
          exhausted: false,
        }),
      } as any,
      { getIntegrationsList: jest.fn(), getIntegrationById: jest.fn() } as any,
      { getTotal: jest.fn() } as any
    );
  }

  it('denies member-only accounts from admin actions when Stripe is disabled', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const ability = await service().check('org-1', new Date(), 'USER', [
      [AuthorizationActions.Update, Sections.ADMIN],
    ]);

    expect(ability.can(AuthorizationActions.Update, Sections.ADMIN)).toBe(
      false
    );
  });

  it.each(['ADMIN', 'SUPERADMIN'] as const)(
    'allows %s role to perform admin actions without billing',
    async (role) => {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
      const ability = await service().check('org-1', new Date(), role, [
        [AuthorizationActions.Update, Sections.ADMIN],
      ]);

      expect(ability.can(AuthorizationActions.Update, Sections.ADMIN)).toBe(
        true
      );
    }
  );

  it('keeps non-admin product capabilities enabled in billing-free installs', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const ability = await service().check('org-1', new Date(), 'USER', [
      [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
    ]);

    expect(
      ability.can(AuthorizationActions.Create, Sections.POSTS_PER_MONTH)
    ).toBe(true);
  });

  it('reserves owner actions for the workspace owner role', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const adminAbility = await service().check('org-1', new Date(), 'ADMIN', [
      [AuthorizationActions.Delete, Sections.OWNER],
    ]);
    const ownerAbility = await service().check(
      'org-1',
      new Date(),
      'SUPERADMIN',
      [[AuthorizationActions.Delete, Sections.OWNER]]
    );

    expect(adminAbility.can(AuthorizationActions.Delete, Sections.OWNER)).toBe(
      false
    );
    expect(ownerAbility.can(AuthorizationActions.Delete, Sections.OWNER)).toBe(
      true
    );
  });

  it('allows post creation based on confirmed-live usage, not created post rows', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    const subscriptions = {
      getSubscriptionByOrganizationId: jest.fn().mockResolvedValue(null),
      getSuccessfulPostUsage: jest.fn().mockResolvedValue({
        used: 49,
        limit: 50,
        remaining: 1,
        exhausted: false,
      }),
    };
    const permissions = new PermissionsService(
      subscriptions as any,
      { getIntegrationsList: jest.fn() } as any,
      { getTotal: jest.fn() } as any
    );

    const ability = await permissions.check(
      'org-1',
      new Date('2026-01-01T00:00:00.000Z'),
      'USER',
      [[AuthorizationActions.Create, Sections.POSTS_PER_MONTH]]
    );

    expect(
      ability.can(AuthorizationActions.Create, Sections.POSTS_PER_MONTH)
    ).toBe(true);
    expect(subscriptions.getSuccessfulPostUsage).toHaveBeenCalledWith(
      'org-1',
      new Date('2026-01-01T00:00:00.000Z')
    );
  });

  it('blocks new post creation once successful-live usage reaches the plan allowance', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    const permissions = new PermissionsService(
      {
        getSubscriptionByOrganizationId: jest.fn().mockResolvedValue(null),
        getSuccessfulPostUsage: jest.fn().mockResolvedValue({
          used: 50,
          limit: 50,
          remaining: 0,
          exhausted: true,
        }),
      } as any,
      { getIntegrationsList: jest.fn() } as any,
      { getTotal: jest.fn() } as any
    );

    const ability = await permissions.check(
      'org-1',
      new Date('2026-01-01T00:00:00.000Z'),
      'USER',
      [[AuthorizationActions.Create, Sections.POSTS_PER_MONTH]]
    );

    expect(
      ability.can(AuthorizationActions.Create, Sections.POSTS_PER_MONTH)
    ).toBe(false);
  });

  it('fails closed when successful-post usage cannot be read', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    const permissions = new PermissionsService(
      {
        getSubscriptionByOrganizationId: jest.fn().mockResolvedValue(null),
        getSuccessfulPostUsage: jest
          .fn()
          .mockRejectedValue(new Error('usage ledger unavailable')),
      } as any,
      { getIntegrationsList: jest.fn() } as any,
      { getTotal: jest.fn() } as any
    );

    await expect(
      permissions.check('org-1', new Date(), 'USER', [
        [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
      ])
    ).rejects.toThrow('usage ledger unavailable');
  });

  it('uses the server plan account invariant instead of a stale paid subscription count', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    const integrations = Array.from({ length: 500 }, (_, index) => ({
      id: `connection-${index}`,
      refreshNeeded: false,
    }));
    const permissions = new PermissionsService(
      {
        getSubscriptionByOrganizationId: jest.fn().mockResolvedValue({
          subscriptionTier: 'STANDARD',
          totalChannels: 1,
        }),
      } as any,
      { getIntegrationsList: jest.fn().mockResolvedValue(integrations) } as any,
      { getTotal: jest.fn() } as any
    );

    const ability = await permissions.check('org-1', new Date(), 'USER', [
      [AuthorizationActions.Create, Sections.CHANNEL],
    ]);

    expect(ability.can(AuthorizationActions.Create, Sections.CHANNEL)).toBe(
      true
    );
  });
});
