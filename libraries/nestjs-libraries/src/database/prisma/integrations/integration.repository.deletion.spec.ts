import { IntegrationRepository } from './integration.repository';

describe('IntegrationRepository provider-data deletion', () => {
  it('removes provider-derived data and anonymizes the soft-deleted connection', async () => {
    const tx: any = {
      integration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'integration-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      post: {
        findMany: jest.fn().mockResolvedValue([{ id: 'post-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inboxState: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      analyticsSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      integrationsWebhooks: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      exisingPlugData: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      plugs: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      comments: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      errors: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      publishingReceipt: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      publishingJob: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      calendarReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = Object.create(IntegrationRepository.prototype) as any;
    repository._prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    await expect(
      repository.deleteChannel('org-1', 'integration-1')
    ).resolves.toBe(true);
    expect(tx.analyticsSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { integrationId: 'integration-1' },
    });
    expect(tx.inboxState.deleteMany).toHaveBeenCalled();
    expect(tx.calendarReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          integrationId: { in: ['integration-1'] },
          pinned: false,
        }),
        data: expect.objectContaining({
          state: 'CANCELLED',
          outcomeCode: 'calendar_connection_deleted',
          outcomeReason: expect.any(String),
        }),
      })
    );
    expect(tx.exisingPlugData.deleteMany).toHaveBeenCalledWith({
      where: { integrationId: 'integration-1' },
    });
    expect(tx.plugs.deleteMany).toHaveBeenCalledWith({
      where: { integrationId: 'integration-1' },
    });
    expect(tx.publishingReceipt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerPostId: null,
          providerUrl: null,
        }),
      })
    );
    expect(tx.publishingJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerPostId: null,
          providerUrl: null,
          lastError: null,
        }),
      })
    );
    expect(tx.post.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { releaseId: null, releaseURL: null, error: null },
      })
    );
    expect(tx.integration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rootInternalId: null,
          profile: null,
          picture: null,
          name: 'Deleted connection',
          deletedAt: expect.any(Date),
          platformTruthMetadata: expect.anything(),
        }),
      })
    );
  });
});
