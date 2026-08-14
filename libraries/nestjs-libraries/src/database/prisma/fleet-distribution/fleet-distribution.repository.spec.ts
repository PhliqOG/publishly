import { FleetDistributionRepository } from './fleet-distribution.repository';

function setup() {
  const db = {
    model: {
      accountGroup: { findFirst: jest.fn() },
      post: { findMany: jest.fn() },
      fleetDistribution: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      fleetDistributionItem: { updateMany: jest.fn() },
    },
  };
  const tx = {
    fleetDistributionItem: {
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    fleetDistribution: { update: jest.fn() },
  };
  const transaction = {
    model: { $transaction: jest.fn((callback) => callback(tx)) },
  };
  return {
    repository: new FleetDistributionRepository(db as any, transaction as any),
    db,
    tx,
  };
}

describe('FleetDistributionRepository', () => {
  it('loads only a tenant-owned active group and active social memberships', async () => {
    const { repository, db } = setup();
    await repository.getActiveGroup('org-1', 'group-1');
    expect(db.model.accountGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-1',
        organizationId: 'org-1',
        deletedAt: null,
      },
      select: expect.objectContaining({
        integrations: expect.objectContaining({
          where: { integration: { deletedAt: null, type: 'social' } },
          orderBy: { integrationId: 'asc' },
        }),
      }),
    });
  });

  it('queries only collision-relevant queued posts with spacing padding', async () => {
    const { repository, db } = setup();
    await repository.listExistingSlots({
      organizationId: 'org-1',
      integrationIds: ['a', 'b'],
      windowStart: new Date('2026-08-10T12:00:00.000Z'),
      windowEnd: new Date('2026-08-10T13:00:00.000Z'),
      paddingSeconds: 60,
    });
    expect(db.model.post.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        integrationId: { in: ['a', 'b'] },
        deletedAt: null,
        state: 'QUEUE',
        publishDate: {
          gte: new Date('2026-08-10T11:59:00.000Z'),
          lte: new Date('2026-08-10T13:01:00.000Z'),
        },
      },
      select: { integrationId: true, publishDate: true },
      orderBy: [{ publishDate: 'asc' }, { id: 'asc' }],
    });
  });

  it('creates the batch and every allocated identity atomically', async () => {
    const { repository, db } = setup();
    db.model.fleetDistribution.create.mockResolvedValue({ id: 'dist-1' });
    const item = {
      id: 'item-1',
      integrationId: 'integration-1',
      postId: 'post-1',
      postGroup: 'post-group-1',
      scheduledAt: new Date('2026-08-10T12:00:00.000Z'),
    };
    await expect(
      repository.create({
        id: 'dist-1',
        organizationId: 'org-1',
        accountGroupId: 'group-1',
        keyHash: 'key-hash',
        requestHash: 'request-hash',
        windowStart: new Date('2026-08-10T12:00:00.000Z'),
        windowEnd: new Date('2026-08-10T13:00:00.000Z'),
        timezone: 'UTC',
        minimumSpacingSec: 60,
        items: [item],
      })
    ).resolves.toEqual({ created: true, distribution: { id: 'dist-1' } });
    expect(db.model.fleetDistribution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'dist-1',
          organizationId: 'org-1',
          items: { create: [item] },
        }),
      })
    );
  });

  it('does not complete while any allocated item remains', async () => {
    const { repository, tx } = setup();
    tx.fleetDistributionItem.count.mockResolvedValue(2);
    await expect(
      repository.complete('dist-1', new Date('2026-08-10T12:00:00.000Z'))
    ).resolves.toEqual({ completed: false, remaining: 2 });
    expect(tx.fleetDistribution.update).not.toHaveBeenCalled();
  });

  it('persists item and batch failure taxonomy in one transaction', async () => {
    const { repository, tx } = setup();
    tx.fleetDistribution.update.mockResolvedValue({ id: 'dist-1' });
    await repository.recordFailure({
      distributionId: 'dist-1',
      itemId: 'item-2',
      failureClass: 'recoverable',
      code: 'network_error',
      reason: 'The provider network was unavailable before mutation.',
    });
    expect(tx.fleetDistributionItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-2', distributionId: 'dist-1' },
      data: {
        failureClass: 'recoverable',
        failureCode: 'network_error',
        failureReason: 'The provider network was unavailable before mutation.',
      },
    });
    expect(tx.fleetDistribution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: 'FAILED',
          lastFailureCode: 'network_error',
          lastFailureReason: expect.any(String),
        }),
      })
    );
  });
});
