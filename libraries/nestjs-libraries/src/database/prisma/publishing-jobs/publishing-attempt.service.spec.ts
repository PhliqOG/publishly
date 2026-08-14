import { PublishingAttemptService } from './publishing-attempt.service';

describe('PublishingAttemptService', () => {
  const originalEnvironment = { ...process.env };
  const repository = {
    begin: jest.fn(),
    markInvoked: jest.fn(),
    markCampaignDispatching: jest.fn(),
    complete: jest.fn(),
    getMutationAttempt: jest.fn(),
    markCampaignNeedsReview: jest.fn(),
    markCampaignPublished: jest.fn(),
  };
  let service: PublishingAttemptService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_SECRET = 'test-encryption-secret-with-at-least-32-characters';
    service = new PublishingAttemptService(repository as any);
  });

  afterAll(() => {
    process.env = { ...originalEnvironment };
  });

  it('uses a stable mutation identity and rejects mismatched replay', async () => {
    repository.begin.mockResolvedValue({ type: 'mismatch', attempt: {} });
    await expect(
      service.beginMutation({
        organizationId: 'org-1',
        postId: 'post-1',
        provider: 'testprovider',
        posts: [{ id: 'post-1', media: [] }],
        context: {
          attemptNumber: 1,
          activityKey: 'v109:mutation:post-1:1',
        },
      })
    ).rejects.toThrow('publishing_attempt_idempotency_mismatch');
    expect(repository.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^publish_attempt_/),
        phase: 'MUTATION',
        activityKey: 'v109:mutation:post-1:1',
        mutationFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      })
    );
  });

  it('routes a replay of an invoked-but-unterminated mutation to readback', async () => {
    repository.begin.mockResolvedValue({
      type: 'replay',
      attempt: {
        state: 'STARTED',
        mutationInvoked: true,
      },
    });
    await expect(
      service.beginMutation({
        organizationId: 'org-1',
        postId: 'post-1',
        provider: 'testprovider',
        posts: [{ id: 'post-1', media: [] }],
        context: {
          attemptNumber: 1,
          activityKey: 'v109:mutation:post-1:1',
        },
      })
    ).resolves.toMatchObject({ terminalReplay: true });
  });

  it('durably classifies an ambiguous mutation and never marks it retryable', async () => {
    repository.complete.mockResolvedValue({ id: 'attempt-1', state: 'AMBIGUOUS' });
    await service.failed({
      organizationId: 'org-1',
      attemptId: 'attempt-1',
      mutationFingerprint: 'a'.repeat(64),
      error: new Error('timeout after request write'),
      safeAbsentProof: false,
      now: new Date('2026-08-13T00:00:00.000Z'),
    });
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'AMBIGUOUS',
        failureClass: 'user_action_needed',
        failureCode: 'outcome_unknown',
        failureReason: expect.stringMatching(/timeout|published|outcome/i),
      })
    );
  });

  it('seals the full accepted pending result so an activity replay does not mutate twice', async () => {
    repository.complete.mockImplementation(async (input: any) => ({
      id: 'attempt-1',
      state: input.state,
      evidence: input.evidence,
    }));
    const results = [
      {
        id: 'post-1',
        status: 'pending',
        pendingData: { uploadUri: 'private-provider-session' },
      },
    ];
    const attempt = await service.accepted({
      organizationId: 'org-1',
      attemptId: 'attempt-1',
      mutationFingerprint: 'a'.repeat(64),
      results,
    });
    expect((attempt.evidence as any).acceptedResults).toMatch(/^v2:/);
    expect(JSON.stringify(attempt.evidence)).not.toContain(
      'private-provider-session'
    );
    expect(service.acceptedReplayResults(attempt)).toEqual(results);
  });

  it('moves an inconclusive campaign readback to durable NEEDS_REVIEW', async () => {
    repository.complete.mockResolvedValue({ id: 'attempt-r', state: 'NEEDS_REVIEW' });
    repository.markCampaignNeedsReview.mockResolvedValue({ type: 'updated' });
    await service.completeReconciliation({
      organizationId: 'org-1',
      postId: 'post-1',
      attemptId: 'attempt-r',
      mutationFingerprint: 'b'.repeat(64),
      result: {
        status: 'inconclusive',
        method: 'provider_readback_unavailable',
        reason: 'The provider cannot search by Publishly fingerprint.',
      },
      now: new Date('2026-08-13T00:01:00.000Z'),
    });
    expect(repository.markCampaignNeedsReview).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'provider_timeout_ambiguous',
        reason: 'The provider cannot search by Publishly fingerprint.',
      })
    );
  });

  it('accepts only provider-proved absence as a safe reconciliation outcome', async () => {
    repository.complete.mockResolvedValue({ id: 'attempt-r', state: 'ABSENT' });
    await service.completeReconciliation({
      organizationId: 'org-1',
      postId: 'post-1',
      attemptId: 'attempt-r',
      mutationFingerprint: 'c'.repeat(64),
      result: {
        status: 'absent',
        method: 'provider_official_search',
        reason: 'Official search returned no matching post.',
      },
      now: new Date('2026-08-13T00:01:00.000Z'),
    });
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'ABSENT',
        failureClass: null,
        failureCode: null,
      })
    );
    expect(repository.markCampaignNeedsReview).not.toHaveBeenCalled();
  });
});
