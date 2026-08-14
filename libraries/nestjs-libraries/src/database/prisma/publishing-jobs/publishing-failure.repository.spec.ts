import { PublishingFailureRepository } from './publishing-failure.repository';

const normalizedFailure = {
  failureClass: 'data_problem' as const,
  code: 'invalid_media' as const,
  reason: 'The video dimensions are invalid.',
  willRetry: false,
};

function transactionModel(overrides: Record<string, unknown> = {}) {
  return {
    publishingJob: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'job-1',
        attempts: 2,
        provider: 'instagram',
        post: { integrationId: 'integration-1', group: 'group-1' },
      }),
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    publishingFailure: {
      upsert: jest.fn().mockResolvedValue({
        id: 'post.failure:post-1:failed:2:invalid_media',
        organizationId: 'org-1',
        postId: 'post-1',
        publishingJobId: 'job-1',
        provider: 'instagram',
        failureClass: 'data_problem',
        failureCode: 'invalid_media',
        reason: normalizedFailure.reason,
        willRetry: false,
        attempt: 2,
        webhookState: 'PENDING',
        occurredAt: new Date('2026-08-10T12:00:00Z'),
      }),
    },
    post: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
}

describe('PublishingFailureRepository', () => {
  function setup(tx: ReturnType<typeof transactionModel>) {
    const db = {
      model: {
        publishingFailure: {
          update: jest.fn(),
          findMany: jest.fn(),
        },
      },
    };
    const transaction = {
      model: {
        $transaction: jest.fn((callback) => callback(tx)),
      },
    };
    return {
      repository: new PublishingFailureRepository(db as any, transaction as any),
      db,
      transaction,
    };
  }

  it('atomically appends the failure, updates latest job fields, and marks a failed post', async () => {
    const tx = transactionModel();
    const { repository } = setup(tx);

    const result = await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      failure: normalizedFailure,
    });

    expect(tx.publishingFailure.upsert).toHaveBeenCalledWith({
      where: { id: 'post.failure:post-1:failed:2:invalid_media' },
      create: expect.objectContaining({
        id: 'post.failure:post-1:failed:2:invalid_media',
        failureClass: 'data_problem',
        failureCode: 'invalid_media',
        reason: normalizedFailure.reason,
      }),
      update: {},
    });
    expect(tx.publishingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        state: 'FAILED',
        lastError: normalizedFailure.reason,
        failureClass: 'data_problem',
        failureCode: 'invalid_media',
        failureReason: normalizedFailure.reason,
        nextAttemptAt: null,
      }),
    });
    expect(tx.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post-1', organizationId: 'org-1' },
      data: { state: 'ERROR', error: normalizedFailure.reason },
    });
    expect(result).toMatchObject({
      integrationId: 'integration-1',
      postGroup: 'group-1',
    });
  });

  it('creates a missing legacy job from the tenant-owned post before recording', async () => {
    const tx = transactionModel();
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
    });
    const { repository } = setup(tx);

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'FAILED',
      failure: normalizedFailure,
    });

    expect(tx.publishingJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postId: 'post-1' },
        create: expect.objectContaining({
          organizationId: 'org-1',
          integrationId: 'integration-1',
          provider: 'tiktok',
          idempotencyKey: 'publish:post-1',
        }),
      })
    );
  });

  it('fails loudly when neither a job nor its tenant-owned post exists', async () => {
    const tx = transactionModel();
    tx.publishingJob.findFirst.mockResolvedValue(null);
    tx.post.findFirst.mockResolvedValue(null);
    const { repository } = setup(tx);

    await expect(
      repository.record({
        organizationId: 'org-1',
        postId: 'missing-post',
        state: 'FAILED',
        failure: normalizedFailure,
      })
    ).rejects.toThrow(
      'Post missing-post was not found while recording a classified failure'
    );
    expect(tx.publishingFailure.upsert).not.toHaveBeenCalled();
  });

  it('keeps the post queued and records the next attempt for recoverable failures', async () => {
    const tx = transactionModel();
    const { repository } = setup(tx);
    const nextAttemptAt = new Date('2026-08-10T12:05:00Z');

    await repository.record({
      organizationId: 'org-1',
      postId: 'post-1',
      state: 'RETRYING',
      failure: {
        failureClass: 'recoverable',
        code: 'rate_limited',
        reason: 'The platform rate limit is active.',
        willRetry: true,
      },
      nextAttemptAt,
    });

    expect(tx.publishingJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: expect.objectContaining({
        state: 'RETRYING',
        completedAt: null,
        nextAttemptAt,
      }),
    });
    expect(tx.post.updateMany).not.toHaveBeenCalled();
  });
});
