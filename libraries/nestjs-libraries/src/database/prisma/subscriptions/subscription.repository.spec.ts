import { SubscriptionRepository } from './subscription.repository';

describe('SubscriptionRepository successful-post usage', () => {
  it('counts tenant-scoped confirmations in a half-open billing window', async () => {
    const count = jest.fn().mockResolvedValue(42);
    const empty = { model: {} } as any;
    const repository = new SubscriptionRepository(
      empty,
      empty,
      empty,
      empty,
      empty,
      { model: { successfulPostUsage: { count } } } as any
    );
    const start = new Date('2026-08-01T00:00:00.000Z');
    const end = new Date('2026-09-01T00:00:00.000Z');

    await expect(
      repository.countSuccessfulPostUsage('org-1', start, end)
    ).resolves.toBe(42);
    expect(count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        confirmedAt: { gte: start, lt: end },
      },
    });
  });

  it('surfaces database count failures instead of treating usage as zero', async () => {
    const empty = { model: {} } as any;
    const repository = new SubscriptionRepository(
      empty,
      empty,
      empty,
      empty,
      empty,
      {
        model: {
          successfulPostUsage: {
            count: jest.fn().mockRejectedValue(new Error('usage read failed')),
          },
        },
      } as any
    );

    await expect(
      repository.countSuccessfulPostUsage(
        'org-1',
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-09-01T00:00:00.000Z')
      )
    ).rejects.toThrow('usage read failed');
  });
});
