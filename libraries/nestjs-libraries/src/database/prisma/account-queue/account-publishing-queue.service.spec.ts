import { AccountPublishingQueueService } from './account-publishing-queue.service';

describe('AccountPublishingQueueService', () => {
  const repository = {
    acquire: jest.fn(),
    release: jest.fn(),
    getQueue: jest.fn(),
  };
  const service = new AccountPublishingQueueService(repository as any);

  beforeEach(() => jest.clearAllMocks());

  it('surfaces a tenant-owned acquire result with a durable 30-minute lease', async () => {
    repository.acquire.mockResolvedValue({
      ok: true,
      acquired: true,
      leaseToken: '11111111-1111-4111-8111-111111111111',
    });
    const now = new Date('2026-08-10T12:00:00.000Z');
    await expect(
      service.acquire('org-1', 'post-1', now)
    ).resolves.toMatchObject({
      acquired: true,
    });
    expect(repository.acquire).toHaveBeenCalledWith({
      organizationId: 'org-1',
      postId: 'post-1',
      now,
      leaseSeconds: 1_800,
    });
  });

  it('classifies missing posts and terminal queue entries', async () => {
    repository.acquire.mockResolvedValueOnce({
      ok: false,
      code: 'post_not_found',
    });
    await expect(service.acquire('org-1', 'missing')).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({
        code: 'post_not_found',
        reason: expect.any(String),
      }),
    });

    repository.acquire.mockResolvedValueOnce({
      ok: false,
      code: 'queue_item_terminal',
      status: 'AMBIGUOUS',
      terminalReason: 'The provider outcome is unknown.',
    });
    await expect(service.acquire('org-1', 'post-1')).rejects.toMatchObject({
      status: 400,
      response: expect.objectContaining({
        code: 'queue_item_terminal',
        reason: 'The provider outcome is unknown.',
        status: 'AMBIGUOUS',
      }),
    });
  });

  it('requires a valid lease and always fills terminal code and reason', async () => {
    await expect(
      service.release('org-1', 'post-1', 'bad', 'FAILED')
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'invalid_account_queue_lease',
        reason: expect.any(String),
      }),
    });

    repository.release.mockResolvedValue({
      ok: true,
      status: 'AMBIGUOUS',
    });
    const now = new Date('2026-08-10T12:00:00.000Z');
    await service.release(
      'org-1',
      'post-1',
      '11111111-1111-4111-8111-111111111111',
      'AMBIGUOUS',
      undefined,
      undefined,
      now
    );
    expect(repository.release).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'outcome_unknown',
        reason: expect.stringMatching(/unknown/i),
        ambiguousCooldownSeconds: 1_800,
      })
    );
  });

  it('classifies lost leases instead of replaying a provider mutation', async () => {
    repository.release.mockResolvedValue({
      ok: false,
      code: 'account_queue_lease_lost',
    });
    await expect(
      service.release(
        'org-1',
        'post-1',
        '11111111-1111-4111-8111-111111111111',
        'COMPLETED'
      )
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'account_queue_lease_lost',
        reason: expect.stringMatching(/will not be replayed/i),
      }),
    });
  });
});
