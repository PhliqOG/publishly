import { PublishingReceiptRepository } from './publishing-receipt.repository';

function txModel() {
  return {
    publishingJob: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'job-1',
        attempts: 0,
        provider: 'instagram',
        deliveryStage: 'queued',
        post: { integrationId: 'integration-1', group: 'group-1' },
      }),
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ attempts: 1 }),
    },
    publishingReceipt: {
      upsert: jest.fn((input) =>
        Promise.resolve({
          ...input.create,
          webhookState: 'PENDING',
          webhookFinishedAt: null,
          occurredAt: new Date('2026-08-10T13:00:00Z'),
        })
      ),
    },
    successfulPostUsage: {
      upsert: jest.fn().mockResolvedValue({ id: 'usage-1' }),
    },
    post: {
      findFirst: jest.fn(),
    },
  };
}

function setup(tx: ReturnType<typeof txModel>) {
  const db = {
    model: {
      publishingJob: { findFirst: jest.fn() },
      publishingReceipt: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      post: {},
    },
  };
  const transaction = {
    model: { $transaction: jest.fn((callback) => callback(tx)) },
  };
  return {
    repository: new PublishingReceiptRepository(db as any, transaction as any),
    db,
  };
}

describe('PublishingReceiptRepository', () => {
  it('atomically claims an uploading attempt and uses the incremented attempt in the event ID', async () => {
    const tx = txModel();
    const { repository } = setup(tx);

    const result = await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'uploading',
    });

    expect(tx.publishingJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'job-1' }),
        data: expect.objectContaining({
          attempts: { increment: 1 },
          state: 'PROCESSING',
          deliveryStage: 'uploading',
        }),
      })
    );
    expect(tx.publishingReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: expect.stringMatching(
            /^post\.receipt:post-1:uploading:1:[a-f0-9]{16}$/
          ),
        },
        create: expect.objectContaining({ stage: 'uploading', attempt: 1 }),
        update: {},
      })
    );
    expect(result).toMatchObject({
      attempt: 1,
      integrationId: 'integration-1',
      postGroup: 'group-1',
    });
  });

  it('does not increment the attempt when another replay already claimed uploading', async () => {
    const tx = txModel();
    tx.publishingJob.updateMany.mockResolvedValue({ count: 0 });
    tx.publishingJob.findUniqueOrThrow.mockResolvedValue({ attempts: 4 });
    const { repository } = setup(tx);

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'uploading',
    });

    expect(tx.publishingReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ attempt: 4 }),
      })
    );
  });

  it('projects provider acceptance as sent without declaring the post live', async () => {
    const tx = txModel();
    tx.publishingJob.findFirst.mockResolvedValue({
      id: 'job-1',
      attempts: 2,
      provider: 'instagram',
      deliveryStage: 'uploading',
      post: { integrationId: 'integration-1', group: 'group-1' },
    });
    const { repository } = setup(tx);

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'sent',
      providerPostId: 'ig-1',
      providerUrl: 'https://instagram.com/p/ig-1',
    });

    expect(tx.publishingJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
        deliveryStage: { notIn: ['confirmed_live', 'failed'] },
      },
      data: expect.objectContaining({
        state: 'PROCESSING',
        deliveryStage: 'sent',
        providerPostId: 'ig-1',
      }),
    });
    expect(tx.publishingJob.update).not.toHaveBeenCalled();
  });

  it('projects an independently verified receipt as confirmed_live', async () => {
    const tx = txModel();
    const { repository } = setup(tx);

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'confirmed_live',
      providerPostId: 'ig-1',
      providerUrl: 'https://instagram.com/p/ig-1',
      confirmationMethod: 'provider_status_api',
    });

    expect(tx.publishingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        deliveryStage: 'confirmed_live',
        confirmedLiveAt: expect.any(Date),
        providerPostId: 'ig-1',
      }),
    });
    expect(tx.successfulPostUsage.upsert).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
      create: {
        organizationId: 'org-1',
        postId: 'post-1',
        receiptId: expect.stringMatching(
          /^post\.receipt:post-1:confirmed_live:0:[a-f0-9]{16}$/
        ),
        provider: 'instagram',
        confirmedAt: new Date('2026-08-10T13:00:00.000Z'),
      },
      update: {},
    });
  });

  it.each(['queued', 'uploading', 'sent', 'failed'] as const)(
    'does not meter a %s receipt',
    async (stage) => {
      const tx = txModel();
      const { repository } = setup(tx);

      await repository.record({
        organizationId: 'org-1',
        postId: 'post-1',
        stage,
        ...(stage === 'failed' ? { failureId: 'failure-1' } : {}),
      });

      expect(tx.successfulPostUsage.upsert).not.toHaveBeenCalled();
    }
  );

  it('fails the confirmation transaction when the successful-post meter cannot be written', async () => {
    const tx = txModel();
    tx.successfulPostUsage.upsert.mockRejectedValue(
      new Error('billing usage ledger unavailable')
    );
    const { repository } = setup(tx);

    await expect(
      repository.record({
        organizationId: 'org-1',
        postId: 'post-1',
        stage: 'confirmed_live',
        providerPostId: 'ig-1',
      })
    ).rejects.toThrow('billing usage ledger unavailable');
    expect(tx.publishingJob.update).not.toHaveBeenCalled();
  });

  it('links a failed receipt to its classified failure and projects failed', async () => {
    const tx = txModel();
    const { repository } = setup(tx);

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'failed',
      attempt: 2,
      failureId: 'post.failure:post-1:failed:2:outcome_unknown',
    });

    expect(tx.publishingReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          stage: 'failed',
          attempt: 2,
          failureId: 'post.failure:post-1:failed:2:outcome_unknown',
        }),
      })
    );
    expect(tx.publishingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        deliveryStage: 'failed',
        stageUpdatedAt: expect.any(Date),
      },
    });
  });

  it('repairs a missing legacy publishing job from the tenant-owned post', async () => {
    const tx = txModel();
    tx.publishingJob.findFirst.mockResolvedValue(null);
    tx.post.findFirst.mockResolvedValue({
      integrationId: 'integration-1',
      group: 'group-1',
      integration: { providerIdentifier: 'TikTok-business' },
    });
    tx.publishingJob.upsert.mockResolvedValue({
      id: 'job-legacy',
      attempts: 0,
      provider: 'tiktok',
      deliveryStage: null,
    });
    const { repository } = setup(tx);

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      stage: 'queued',
    });

    expect(tx.publishingJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          integrationId: 'integration-1',
          provider: 'tiktok',
          idempotencyKey: 'publish:post-1',
        }),
      })
    );
  });

  it('fails loudly when receipt ownership cannot be resolved', async () => {
    const tx = txModel();
    tx.publishingJob.findFirst.mockResolvedValue(null);
    tx.post.findFirst.mockResolvedValue(null);
    const { repository } = setup(tx);

    await expect(
      repository.record({
        organizationId: 'org-1',
        postId: 'missing',
        stage: 'queued',
      })
    ).rejects.toThrow(
      'Post missing was not found while recording a delivery receipt'
    );
  });
});
