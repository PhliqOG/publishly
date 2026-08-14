import { PublishingRetryService } from './publishing-retry.service';

jest.mock('./publishing-failure.service', () => ({
  PublishingFailureService: class PublishingFailureService {},
}));

describe('PublishingRetryService', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');
  let db: any;
  let failures: any;
  let service: PublishingRetryService;

  beforeEach(() => {
    db = {
      model: {
        post: { findFirst: jest.fn() },
        integration: { updateMany: jest.fn() },
      },
    };
    failures = { record: jest.fn() };
    service = new PublishingRetryService(db, failures);
  });

  it('queues a known connection gate and emits an observable retry failure', async () => {
    db.model.post.findFirst.mockResolvedValue({
      integrationId: 'connection-1',
      integration: {
        rateLimitedUntil: new Date('2026-08-10T12:05:00.000Z'),
        rateLimitReason: 'X rate limit reached',
      },
    });
    await expect(
      service.waitForConnectionGate({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
      })
    ).resolves.toEqual({
      delaySeconds: 300,
      nextAttemptAt: '2026-08-10T12:05:00.000Z',
      reason: 'X rate limit reached',
    });
    expect(failures.record).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'RETRYING',
        code: 'rate_limited',
        eventId: 'post.failure:post-1:rate-gate:2026-08-10T12:05:00.000Z',
      })
    );
  });

  it('clears an expired gate and does not emit a false failure', async () => {
    db.model.post.findFirst.mockResolvedValue({
      integrationId: 'connection-1',
      integration: {
        rateLimitedUntil: new Date('2026-08-10T11:59:00.000Z'),
        rateLimitReason: 'old limit',
      },
    });
    db.model.integration.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.waitForConnectionGate({
        organizationId: 'org-1',
        postId: 'post-1',
        now,
      })
    ).resolves.toBeNull();
    expect(db.model.integration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { rateLimitedUntil: null, rateLimitReason: null },
      })
    );
    expect(failures.record).not.toHaveBeenCalled();
  });

  it('persists provider Retry-After as a connection gate and retry event', async () => {
    db.model.post.findFirst.mockResolvedValue({
      integrationId: 'connection-1',
    });
    db.model.integration.updateMany.mockResolvedValue({ count: 1 });
    const error = {
      details: [
        {
          failure: {
            failureClass: 'recoverable',
            failureCode: 'rate_limited',
            failureReason: 'Provider said slow down',
            willRetry: true,
          },
          retryAfterSeconds: 600,
        },
      ],
    };
    const output = await service.scheduleRecoverableRetry({
      organizationId: 'org-1',
      postId: 'post-1',
      error,
      retryOrdinal: 0,
      now,
    });
    expect(output).toMatchObject({
      delaySeconds: 600,
      nextAttemptAt: '2026-08-10T12:10:00.000Z',
      failure: { class: 'recoverable', code: 'rate_limited' },
    });
    expect(db.model.integration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'connection-1',
          OR: expect.any(Array),
        }),
        data: expect.objectContaining({
          rateLimitedUntil: new Date('2026-08-10T12:10:00.000Z'),
        }),
      })
    );
    expect(failures.record).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'RETRYING',
        code: 'rate_limited',
        eventId: 'post.failure:post-1:retry:1:rate_limited',
      })
    );
  });

  it('refuses to retry a user-action or data failure', async () => {
    await expect(
      service.scheduleRecoverableRetry({
        organizationId: 'org-1',
        postId: 'post-1',
        error: {
          failure: {
            failureClass: 'user_action_needed',
            failureCode: 'reconnect_required',
            failureReason: 'Reconnect the account',
          },
        },
        retryOrdinal: 0,
        now,
      })
    ).rejects.toThrow(/non-recoverable/i);
    expect(db.model.post.findFirst).not.toHaveBeenCalled();
    expect(failures.record).not.toHaveBeenCalled();
  });

  it('retries a queue/gate timeout only when explicitly proven pre-mutation', async () => {
    db.model.post.findFirst.mockResolvedValue({
      integrationId: 'connection-1',
    });
    const output = await service.scheduleRecoverableRetry({
      organizationId: 'org-1',
      postId: 'post-1',
      error: { type: 'TimeoutFailure', message: 'Activity timed out' },
      retryOrdinal: 0,
      safeBeforeMutation: true,
      now,
    });
    expect(output.failure).toMatchObject({
      class: 'recoverable',
      code: 'internal_error',
    });
  });

  it('selects the priority retry lane from an active Growth subscription', async () => {
    db.model.post.findFirst.mockResolvedValue({
      integrationId: 'connection-1',
      organization: {
        subscription: { subscriptionTier: 'TEAM', deletedAt: null },
      },
    });

    const output = await service.scheduleRecoverableRetry({
      organizationId: 'org-1',
      postId: 'post-1',
      error: {
        failure: {
          failureClass: 'recoverable',
          failureCode: 'provider_unavailable',
          failureReason: 'Provider is temporarily unavailable',
          willRetry: true,
        },
      },
      retryOrdinal: 0,
      now,
    });

    expect(output.priority).toBe(true);
    expect(output.delaySeconds).toBeLessThanOrEqual(5);
  });

  it('fails loudly when the post cannot be tenant-scoped', async () => {
    db.model.post.findFirst.mockResolvedValue(null);
    await expect(
      service.waitForConnectionGate({
        organizationId: 'org-1',
        postId: 'post-404',
        now,
      })
    ).rejects.toThrow(/not found/i);
  });
});
