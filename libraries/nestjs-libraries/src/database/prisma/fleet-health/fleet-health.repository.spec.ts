import { FleetHealthRepository } from './fleet-health.repository';

function setup() {
  const db = {
    model: {
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      publishingJob: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      accountTag: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      accountGroup: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      integrationAccountTag: {},
      integrationAccountGroup: {},
    },
  };
  const tx = {
    accountTag: { findFirst: jest.fn(), update: jest.fn() },
    accountGroup: { findFirst: jest.fn(), update: jest.fn() },
    integration: { findMany: jest.fn() },
    integrationAccountTag: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    integrationAccountGroup: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const transaction = {
    model: { $transaction: jest.fn((callback) => callback(tx)) },
  };
  return {
    repository: new FleetHealthRepository(db as any, transaction as any),
    db,
    tx,
  };
}

describe('FleetHealthRepository', () => {
  it('applies tenant, group, and tenant-owned account-tag filters together', async () => {
    const { repository, db } = setup();

    await repository.listConnections('org-1', {
      groupId: 'group-1',
      tagId: 'tag-1',
    });

    expect(db.model.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          type: 'social',
          accountGroups: {
            some: {
              accountGroup: {
                id: 'group-1',
                organizationId: 'org-1',
                deletedAt: null,
              },
            },
          },
          accountTags: {
            some: {
              accountTag: {
                id: 'tag-1',
                organizationId: 'org-1',
                deletedAt: null,
              },
            },
          },
        },
        select: expect.objectContaining({
          tokenHealthState: true,
          connectionHealthState: true,
          accountGroups: expect.any(Object),
          accountTags: expect.any(Object),
        }),
      })
    );
  });

  it('groups only confirmed-live and final-failed outcomes by completion window', async () => {
    const { repository, db } = setup();
    const since = new Date('2026-07-11T12:00:00.000Z');

    await repository.aggregateTerminalOutcomes(
      'org-1',
      ['integration-1', 'integration-2'],
      since
    );

    expect(db.model.publishingJob.groupBy).toHaveBeenCalledWith({
      by: ['integrationId', 'state', 'deliveryStage'],
      where: {
        organizationId: 'org-1',
        integrationId: { in: ['integration-1', 'integration-2'] },
        completedAt: { gte: since },
        OR: [
          { state: 'PUBLISHED', deliveryStage: 'confirmed_live' },
          { state: 'FAILED', deliveryStage: 'failed' },
        ],
      },
      _count: { _all: true },
      _sum: { attempts: true },
    });
  });

  it('groups only active queue states and returns the oldest queued job', async () => {
    const { repository, db } = setup();

    await repository.aggregateQueue('org-1', ['integration-1']);

    expect(db.model.publishingJob.groupBy).toHaveBeenCalledWith({
      by: ['integrationId'],
      where: {
        organizationId: 'org-1',
        integrationId: { in: ['integration-1'] },
        state: { in: ['QUEUED', 'PROCESSING', 'RETRYING'] },
      },
      _count: { _all: true },
      _min: { createdAt: true },
    });
  });

  it('does not query aggregate tables for an empty filtered fleet', async () => {
    const { repository, db } = setup();

    await expect(
      repository.aggregateTerminalOutcomes('org-1', [], new Date())
    ).resolves.toEqual([]);
    await expect(repository.aggregateQueue('org-1', [])).resolves.toEqual([]);
    expect(db.model.publishingJob.groupBy).not.toHaveBeenCalled();
  });

  it('upserts tags by tenant and normalized name', async () => {
    const { repository, db } = setup();
    db.model.accountTag.upsert.mockResolvedValue({ id: 'tag-1' });

    await repository.createTag({
      organizationId: 'org-1',
      name: 'Priority',
      normalizedName: 'priority',
      color: '#AA44FF',
    });

    expect(db.model.accountTag.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_normalizedName: {
          organizationId: 'org-1',
          normalizedName: 'priority',
        },
      },
      create: {
        organizationId: 'org-1',
        name: 'Priority',
        normalizedName: 'priority',
        color: '#AA44FF',
      },
      update: { name: 'Priority', color: '#AA44FF', deletedAt: null },
      select: { id: true, name: true, color: true },
    });
  });

  it('upserts canonical groups and revives archived names', async () => {
    const { repository, db } = setup();
    db.model.accountGroup.upsert.mockResolvedValue({ id: 'group-1' });

    await repository.createGroup({
      organizationId: 'org-1',
      name: 'East Coast',
      normalizedName: 'east coast',
      color: '#22AA88',
    });

    expect(db.model.accountGroup.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_normalizedName: {
          organizationId: 'org-1',
          normalizedName: 'east coast',
        },
      },
      create: {
        organizationId: 'org-1',
        name: 'East Coast',
        normalizedName: 'east coast',
        color: '#22AA88',
      },
      update: { name: 'East Coast', color: '#22AA88', deletedAt: null },
      select: { id: true, name: true, color: true },
    });
  });

  it('atomically rejects cross-tenant tag assignment before mutation', async () => {
    const { repository, tx } = setup();
    tx.accountTag.findFirst.mockResolvedValue({
      id: 'tag-1',
      name: 'Priority',
      color: '#AA44FF',
    });
    tx.integration.findMany.mockResolvedValue([{ id: 'owned-1' }]);

    await expect(
      repository.assignTag({
        organizationId: 'org-1',
        accountTagId: 'tag-1',
        integrationIds: ['owned-1', 'foreign-1'],
        mode: 'add',
      })
    ).resolves.toEqual({ ok: false, code: 'connection_not_found' });
    expect(tx.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      })
    );
    expect(tx.integrationAccountTag.createMany).not.toHaveBeenCalled();
    expect(tx.integrationAccountTag.deleteMany).not.toHaveBeenCalled();
  });

  it('bulk adds and removes only validated tenant-owned tag assignments', async () => {
    const { repository, tx } = setup();
    tx.accountTag.findFirst.mockResolvedValue({
      id: 'tag-1',
      name: 'Priority',
      color: '#AA44FF',
    });
    tx.integration.findMany.mockResolvedValue([
      { id: 'owned-1' },
      { id: 'owned-2' },
    ]);
    tx.integrationAccountTag.createMany.mockResolvedValue({ count: 2 });
    tx.integrationAccountTag.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.assignTag({
        organizationId: 'org-1',
        accountTagId: 'tag-1',
        integrationIds: ['owned-1', 'owned-2'],
        mode: 'add',
      })
    ).resolves.toMatchObject({ ok: true, affected: 2, requested: 2 });
    expect(tx.integrationAccountTag.createMany).toHaveBeenCalledWith({
      data: [
        { integrationId: 'owned-1', accountTagId: 'tag-1' },
        { integrationId: 'owned-2', accountTagId: 'tag-1' },
      ],
      skipDuplicates: true,
    });

    await expect(
      repository.assignTag({
        organizationId: 'org-1',
        accountTagId: 'tag-1',
        integrationIds: ['owned-1', 'owned-2'],
        mode: 'remove',
      })
    ).resolves.toMatchObject({ ok: true, affected: 1, requested: 2 });
    expect(tx.integrationAccountTag.deleteMany).toHaveBeenCalledWith({
      where: {
        accountTagId: 'tag-1',
        integrationId: { in: ['owned-1', 'owned-2'] },
      },
    });
  });

  it('atomically validates and mutates many-to-many group assignments', async () => {
    const { repository, tx } = setup();
    tx.accountGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      name: 'East Coast',
      color: '#22AA88',
    });
    tx.integration.findMany.mockResolvedValue([
      { id: 'owned-1' },
      { id: 'owned-2' },
    ]);
    tx.integrationAccountGroup.createMany.mockResolvedValue({ count: 2 });
    tx.integrationAccountGroup.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.assignGroup({
        organizationId: 'org-1',
        accountGroupId: 'group-1',
        integrationIds: ['owned-1', 'owned-2'],
        mode: 'add',
      })
    ).resolves.toMatchObject({ ok: true, affected: 2, requested: 2 });
    expect(tx.integrationAccountGroup.createMany).toHaveBeenCalledWith({
      data: [
        { integrationId: 'owned-1', accountGroupId: 'group-1' },
        { integrationId: 'owned-2', accountGroupId: 'group-1' },
      ],
      skipDuplicates: true,
    });

    tx.integration.findMany.mockResolvedValueOnce([{ id: 'owned-1' }]);
    await expect(
      repository.assignGroup({
        organizationId: 'org-1',
        accountGroupId: 'group-1',
        integrationIds: ['owned-1', 'foreign-1'],
        mode: 'remove',
      })
    ).resolves.toEqual({ ok: false, code: 'connection_not_found' });
    expect(tx.integrationAccountGroup.deleteMany).not.toHaveBeenCalled();
  });

  it('archives only tenant-owned active primitives', async () => {
    const { repository, db } = setup();
    const archivedAt = new Date('2026-08-10T12:00:00.000Z');

    await repository.archiveTag('org-1', 'tag-1', archivedAt);
    await repository.archiveGroup('org-1', 'group-1', archivedAt);

    expect(db.model.accountTag.updateMany).toHaveBeenCalledWith({
      where: { id: 'tag-1', organizationId: 'org-1', deletedAt: null },
      data: { deletedAt: archivedAt },
    });
    expect(db.model.accountGroup.updateMany).toHaveBeenCalledWith({
      where: { id: 'group-1', organizationId: 'org-1', deletedAt: null },
      data: { deletedAt: archivedAt },
    });
  });
});
