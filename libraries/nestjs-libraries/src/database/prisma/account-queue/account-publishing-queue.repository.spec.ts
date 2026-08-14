import { AccountPublishingQueueRepository } from './account-publishing-queue.repository';

const now = new Date('2026-08-10T12:00:00.000Z');

function post() {
  return {
    id: 'post-1',
    state: 'QUEUE',
    publishDate: new Date('2026-08-10T11:00:00.000Z'),
    integrationId: 'integration-1',
    integration: {
      id: 'integration-1',
      organizationId: 'org-1',
      deletedAt: null,
      disabled: false,
    },
  };
}

function queueItem() {
  return {
    postId: 'post-1',
    integrationId: 'integration-1',
    status: 'WAITING',
    terminalCode: null,
    terminalReason: null,
  };
}

function setup() {
  const tx = {
    post: { findFirst: jest.fn().mockResolvedValue(post()) },
    accountPublishingQueueItem: {
      upsert: jest.fn().mockResolvedValue(queueItem()),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    accountPublishingQueueState: {
      upsert: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
  };
  const db = {
    model: {
      integration: { findFirst: jest.fn() },
      accountPublishingQueueState: { findUnique: jest.fn() },
      accountPublishingQueueItem: { findMany: jest.fn() },
    },
  };
  const transaction = {
    model: { $transaction: jest.fn((callback) => callback(tx)) },
  };
  return {
    repository: new AccountPublishingQueueRepository(
      db as any,
      transaction as any
    ),
    tx,
    db,
  };
}

function head(postId = 'post-1') {
  return {
    postId,
    scheduledAt: new Date('2026-08-10T11:00:00.000Z'),
    createdAt: new Date('2026-08-09T12:00:00.000Z'),
  };
}

describe('AccountPublishingQueueRepository', () => {
  it('keeps stable FIFO ordering and does not lease a later post', async () => {
    const { repository, tx } = setup();
    tx.accountPublishingQueueItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([head('earlier-post'), head('post-1')]);

    await expect(
      repository.acquire({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
        leaseSeconds: 1_800,
      })
    ).resolves.toMatchObject({
      ok: true,
      acquired: false,
      position: 2,
      code: 'waiting_for_account_queue',
      reason: expect.any(String),
    });
    expect(tx.accountPublishingQueueState.updateMany).not.toHaveBeenCalled();
  });

  it('atomically leases only the FIFO head and can resume the same lease', async () => {
    const { repository, tx } = setup();
    tx.accountPublishingQueueItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([head()]);

    const acquired = await repository.acquire({
      organizationId: 'org-1',
      postId: 'post-1',
      now,
      leaseSeconds: 1_800,
    });

    expect(acquired).toMatchObject({
      ok: true,
      acquired: true,
      integrationId: 'integration-1',
      resumed: false,
      leaseUntil: new Date('2026-08-10T12:30:00.000Z'),
    });
    expect((acquired as any).leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(tx.accountPublishingQueueState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integrationId: 'integration-1',
          organizationId: 'org-1',
        }),
      })
    );

    const resumedSetup = setup();
    resumedSetup.tx.accountPublishingQueueItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([head()]);
    resumedSetup.tx.accountPublishingQueueState.findUnique.mockResolvedValue({
      leasePostId: 'post-1',
      leaseToken: '11111111-1111-4111-8111-111111111111',
      leaseUntil: new Date('2026-08-10T12:20:00.000Z'),
      cooldownReason: null,
    });
    await expect(
      resumedSetup.repository.acquire({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
        leaseSeconds: 1_800,
      })
    ).resolves.toMatchObject({
      acquired: true,
      resumed: true,
      leaseToken: '11111111-1111-4111-8111-111111111111',
    });
    expect(
      resumedSetup.tx.accountPublishingQueueState.updateMany
    ).not.toHaveBeenCalled();
  });

  it('reports lease races and ambiguous cooldowns without overlapping mutations', async () => {
    const race = setup();
    race.tx.accountPublishingQueueItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([head()]);
    race.tx.accountPublishingQueueState.updateMany.mockResolvedValue({
      count: 0,
    });
    await expect(
      race.repository.acquire({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
        leaseSeconds: 1_800,
      })
    ).resolves.toMatchObject({
      acquired: false,
      code: 'account_queue_race_lost',
      reason: expect.any(String),
    });

    const cooldown = setup();
    cooldown.tx.accountPublishingQueueItem.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([head()]);
    cooldown.tx.accountPublishingQueueState.findUnique.mockResolvedValue({
      leasePostId: 'ambiguous-post',
      leaseToken: '22222222-2222-4222-8222-222222222222',
      leaseUntil: new Date('2026-08-10T12:15:00.000Z'),
      cooldownReason: 'The preceding provider mutation has an unknown outcome.',
    });
    await expect(
      cooldown.repository.acquire({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
        leaseSeconds: 1_800,
      })
    ).resolves.toMatchObject({
      acquired: false,
      delaySeconds: 900,
      code: 'account_queue_cooldown',
      reason: 'The preceding provider mutation has an unknown outcome.',
    });
  });

  it('reconciles an accepted orphan head before leasing the next post', async () => {
    const { repository, tx } = setup();
    tx.accountPublishingQueueItem.findMany
      .mockResolvedValueOnce([
        {
          postId: 'accepted-post',
          post: {
            state: 'QUEUE',
            deletedAt: null,
            publishingJob: { state: 'PROCESSING', deliveryStage: 'sent' },
          },
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([head()]);

    await expect(
      repository.acquire({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
        leaseSeconds: 1_800,
      })
    ).resolves.toMatchObject({ acquired: true });
    expect(tx.accountPublishingQueueItem.updateMany).toHaveBeenCalledWith({
      where: { postId: 'accepted-post', status: 'WAITING' },
      data: expect.objectContaining({
        status: 'COMPLETED',
        terminalCode: 'provider_accepted',
        terminalReason: expect.any(String),
      }),
    });
  });

  it('releases accepted and failed posts while retaining an ambiguity cooldown', async () => {
    const accepted = setup();
    accepted.tx.accountPublishingQueueItem.findFirst.mockResolvedValue({
      integrationId: 'integration-1',
      status: 'WAITING',
    });
    accepted.tx.accountPublishingQueueState.findUnique.mockResolvedValue({
      leasePostId: 'post-1',
      leaseToken: '11111111-1111-4111-8111-111111111111',
      leaseUntil: new Date('2026-08-10T12:30:00.000Z'),
    });
    await expect(
      accepted.repository.release({
        organizationId: 'org-1',
        postId: 'post-1',
        leaseToken: '11111111-1111-4111-8111-111111111111',
        outcome: 'COMPLETED',
        code: 'provider_accepted',
        reason: 'Provider accepted the post.',
        now,
        ambiguousCooldownSeconds: 1_800,
      })
    ).resolves.toMatchObject({ ok: true, status: 'COMPLETED' });
    expect(accepted.tx.accountPublishingQueueState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leasePostId: null,
          leaseToken: null,
          leaseUntil: null,
        }),
      })
    );

    const ambiguous = setup();
    ambiguous.tx.accountPublishingQueueItem.findFirst.mockResolvedValue({
      integrationId: 'integration-1',
      status: 'WAITING',
    });
    ambiguous.tx.accountPublishingQueueState.findUnique.mockResolvedValue({
      leasePostId: 'post-1',
      leaseToken: '11111111-1111-4111-8111-111111111111',
      leaseUntil: new Date('2026-08-10T12:30:00.000Z'),
    });
    await expect(
      ambiguous.repository.release({
        organizationId: 'org-1',
        postId: 'post-1',
        leaseToken: '11111111-1111-4111-8111-111111111111',
        outcome: 'AMBIGUOUS',
        code: 'outcome_unknown',
        reason: 'Provider outcome is unknown.',
        now,
        ambiguousCooldownSeconds: 1_800,
      })
    ).resolves.toMatchObject({
      ok: true,
      status: 'AMBIGUOUS',
      cooldownUntil: new Date('2026-08-10T12:30:00.000Z'),
    });
    expect(
      ambiguous.tx.accountPublishingQueueState.update
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cooldownReason: 'Provider outcome is unknown.',
          leaseUntil: new Date('2026-08-10T12:30:00.000Z'),
        }),
      })
    );
  });

  it('refuses a stale release token and leaves the queue untouched', async () => {
    const { repository, tx } = setup();
    tx.accountPublishingQueueItem.findFirst.mockResolvedValue({
      integrationId: 'integration-1',
      status: 'WAITING',
    });
    tx.accountPublishingQueueState.findUnique.mockResolvedValue({
      leasePostId: 'post-1',
      leaseToken: 'different-token',
      leaseUntil: new Date('2026-08-10T12:30:00.000Z'),
    });
    await expect(
      repository.release({
        organizationId: 'org-1',
        postId: 'post-1',
        leaseToken: '11111111-1111-4111-8111-111111111111',
        outcome: 'FAILED',
        code: 'bad_media',
        reason: 'Media is invalid.',
        now,
        ambiguousCooldownSeconds: 1_800,
      })
    ).resolves.toEqual({ ok: false, code: 'account_queue_lease_lost' });
    expect(tx.accountPublishingQueueItem.update).not.toHaveBeenCalled();
    expect(tx.accountPublishingQueueState.update).not.toHaveBeenCalled();
  });

  it('periodically repairs terminal orphans and clears expired cooldown leases', async () => {
    const { repository, tx } = setup();
    tx.accountPublishingQueueItem.findMany.mockResolvedValue([
      {
        postId: 'accepted-post',
        post: {
          state: 'QUEUE',
          deletedAt: null,
          publishingJob: { state: 'PROCESSING', deliveryStage: 'sent' },
        },
      },
      {
        postId: 'failed-post',
        post: {
          state: 'ERROR',
          deletedAt: null,
          publishingJob: { state: 'FAILED', deliveryStage: 'failed' },
        },
      },
    ]);
    tx.accountPublishingQueueItem.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    tx.accountPublishingQueueState.updateMany.mockResolvedValue({ count: 3 });

    await expect(repository.reconcileTerminalOrphans(now)).resolves.toEqual({
      scanned: 2,
      repaired: 2,
      expiredLeasesCleared: 3,
    });
    expect(tx.accountPublishingQueueItem.updateMany).toHaveBeenNthCalledWith(
      1,
      {
        where: { postId: 'accepted-post', status: 'WAITING' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          terminalCode: 'provider_accepted',
          terminalReason: expect.any(String),
        }),
      }
    );
    expect(tx.accountPublishingQueueState.updateMany).toHaveBeenCalledWith({
      where: { leaseUntil: { lte: now } },
      data: {
        leasePostId: null,
        leaseToken: null,
        leaseUntil: null,
        cooldownReason: null,
      },
    });
  });
});
