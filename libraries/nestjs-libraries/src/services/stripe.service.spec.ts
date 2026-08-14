jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  () => ({ OrganizationService: class OrganizationService {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  () => ({ UsersService: class UsersService {} })
);
jest.mock('@gitroom/nestjs-libraries/track/track.service', () => ({
  TrackService: class TrackService {},
}));

import { StripeService } from './stripe.service';

describe('StripeService plan catalog', () => {
  it('returns exactly the four public plans without a Stripe request', async () => {
    const service = Object.create(StripeService.prototype) as StripeService;

    const packages = await service.getPackages();
    expect(packages).toMatchObject({
      FREE: { display_name: 'Free', month_price: 0 },
      STANDARD: {
        display_name: 'Starter',
        month_price: 29,
        posts_per_month: 2_000,
      },
      TEAM: {
        display_name: 'Growth',
        month_price: 99,
        posts_per_month: 15_000,
        priority_retries: true,
        dead_account_detection: true,
        sla: true,
      },
      PRO: {
        display_name: 'Scale',
        month_price: 299,
        posts_per_month: 100_000,
      },
    });
    expect(Object.keys(packages)).toEqual(['FREE', 'STANDARD', 'TEAM', 'PRO']);
    expect(packages).not.toHaveProperty('ULTIMATE');
  });
});
