import { PostCreationRequestRepository } from './post-creation-request.repository';

describe('PostCreationRequestRepository', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');
  let tx: any;
  let db: any;
  let repository: PostCreationRequestRepository;
  const input = {
    organizationId: 'org-1',
    keyHash: 'key-hash',
    requestHash: 'request-hash',
    creationMethod: 'API' as const,
    allocation: [{ destination: 0, groupId: 'group-1', postIds: ['post-1'] }],
    now,
    leaseSeconds: 60,
  };

  beforeEach(() => {
    tx = {
      postCreationRequest: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    db = { model: { postCreationRequest: { updateMany: jest.fn() } } };
    repository = new PostCreationRequestRepository(db, {
      model: { $transaction: jest.fn((fn) => fn(tx)) },
    } as any);
  });

  it('atomically claims a new request with a lease and allocation', async () => {
    tx.postCreationRequest.findUnique.mockResolvedValue(null);
    tx.postCreationRequest.create.mockResolvedValue({ id: 'request-1' });

    await expect(repository.claim(input)).resolves.toMatchObject({
      type: 'acquired',
      requestId: 'request-1',
      leaseToken: expect.any(String),
    });
    expect(tx.postCreationRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          allocatedPostIds: input.allocation,
          leaseUntil: new Date('2026-08-10T12:01:00.000Z'),
        }),
      })
    );
  });

  it('replays a completed response and rejects key/body mismatches', async () => {
    tx.postCreationRequest.findUnique.mockResolvedValue({
      requestHash: input.requestHash,
      creationMethod: 'API',
      status: 'COMPLETED',
      response: [{ postId: 'post-1' }],
    });
    await expect(repository.claim(input)).resolves.toEqual({
      type: 'replay',
      response: [{ postId: 'post-1' }],
    });

    tx.postCreationRequest.findUnique.mockResolvedValue({
      requestHash: 'different',
      creationMethod: 'API',
      status: 'COMPLETED',
      response: [],
    });
    await expect(repository.claim(input)).resolves.toEqual({ type: 'mismatch' });
  });

  it('does not steal a live lease and reclaims an expired one', async () => {
    tx.postCreationRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      requestHash: input.requestHash,
      creationMethod: 'API',
      status: 'IN_PROGRESS',
      response: null,
      leaseUntil: new Date('2026-08-10T12:00:30.000Z'),
    });
    await expect(repository.claim(input)).resolves.toEqual({
      type: 'in_progress',
      retryAfterSeconds: 30,
    });

    tx.postCreationRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      requestHash: input.requestHash,
      creationMethod: 'API',
      status: 'IN_PROGRESS',
      response: null,
      leaseUntil: new Date('2026-08-10T11:59:00.000Z'),
    });
    tx.postCreationRequest.updateMany.mockResolvedValue({ count: 1 });
    await expect(repository.claim(input)).resolves.toMatchObject({
      type: 'acquired',
      requestId: 'request-1',
    });
  });

  it('requires the active lease to complete or classify a failure', async () => {
    db.model.postCreationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    await repository.complete('request-1', 'lease-1', [{ postId: 'post-1' }]);
    expect(db.model.postCreationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1', leaseToken: 'lease-1', status: 'IN_PROGRESS' },
        data: expect.objectContaining({ status: 'COMPLETED', leaseToken: null }),
      })
    );

    db.model.postCreationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    await repository.fail('request-1', 'lease-1', {
      failureClass: 'recoverable',
      code: 'internal_error',
      reason: 'Database unavailable',
      willRetry: true,
    });
    expect(db.model.postCreationRequest.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          lastFailureCode: 'internal_error',
          lastFailureReason: 'Database unavailable',
        }),
      })
    );
  });

  it('fails loudly when a stale lease tries to commit', async () => {
    db.model.postCreationRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(repository.complete('request-1', 'stale', [])).rejects.toThrow(/lease changed/i);
    await expect(
      repository.fail('request-1', 'stale', {
        failureClass: 'recoverable',
        code: 'internal_error',
        reason: 'failed',
        willRetry: true,
      })
    ).rejects.toThrow(/active lease/i);
  });
});
