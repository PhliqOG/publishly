import {
  IdempotencyInProgressException,
  PostCreationIdempotencyService,
} from './post-creation-idempotency.service';

const body = {
  type: 'now',
  date: '2026-08-10T12:00:00.000Z',
  shortLink: false,
  tags: [],
  posts: [
    {
      integration: { id: 'connection-1' },
      settings: { __type: 'x' },
      value: [{ content: 'hello', image: [] }],
    },
  ],
} as any;

describe('PostCreationIdempotencyService', () => {
  let repository: any;
  let service: PostCreationIdempotencyService;

  beforeEach(() => {
    repository = {
      claim: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    service = new PostCreationIdempotencyService(repository);
  });

  it('executes once with allocated IDs and commits the exact response', async () => {
    repository.claim.mockResolvedValue({
      type: 'acquired',
      requestId: 'request-1',
      leaseToken: 'lease-1',
    });
    const operation = jest.fn().mockResolvedValue([{ postId: 'post-1' }]);

    await expect(
      service.execute({
        organizationId: 'org-1',
        idempotencyKey: 'campaign:location-1',
        body,
        creationMethod: 'API',
        operation,
      })
    ).resolves.toEqual({ value: [{ postId: 'post-1' }], replayed: false });
    expect(operation.mock.calls[0][0].posts[0].value[0].id).toMatch(/^idem_post_/);
    expect(repository.complete).toHaveBeenCalledWith(
      'request-1',
      'lease-1',
      [{ postId: 'post-1' }]
    );
  });

  it('replays without invoking the creation operation', async () => {
    repository.claim.mockResolvedValue({
      type: 'replay',
      response: [{ postId: 'post-1' }],
    });
    const operation = jest.fn();
    await expect(
      service.execute({
        organizationId: 'org-1',
        idempotencyKey: 'campaign:location-1',
        body,
        creationMethod: 'API',
        operation,
      })
    ).resolves.toEqual({ value: [{ postId: 'post-1' }], replayed: true });
    expect(operation).not.toHaveBeenCalled();
  });

  it('rejects invalid keys, mismatches, and concurrent active requests', async () => {
    await expect(
      service.execute({
        organizationId: 'org-1',
        idempotencyKey: 'bad key',
        body,
        creationMethod: 'API',
        operation: jest.fn(),
      })
    ).rejects.toMatchObject({
      status: 400,
      response: {
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason: expect.any(String),
      },
    });

    repository.claim.mockResolvedValueOnce({ type: 'mismatch' });
    await expect(
      service.execute({
        organizationId: 'org-1',
        idempotencyKey: 'campaign:location-1',
        body,
        creationMethod: 'API',
        operation: jest.fn(),
      })
    ).rejects.toMatchObject({
      response: {
        failureClass: 'data_problem',
        code: 'idempotency_key_reused',
        reason: expect.any(String),
      },
    });

    repository.claim.mockResolvedValueOnce({
      type: 'in_progress',
      retryAfterSeconds: 27,
    });
    const pending = service.execute({
      organizationId: 'org-1',
      idempotencyKey: 'campaign:location-1',
      body,
      creationMethod: 'API',
      operation: jest.fn(),
    });
    await expect(pending).rejects.toBeInstanceOf(IdempotencyInProgressException);
    await expect(pending).rejects.toMatchObject({
      retryAfterSeconds: 27,
      response: {
        failureClass: 'recoverable',
        code: 'idempotency_request_in_progress',
        reason: expect.any(String),
      },
    });
  });

  it('classifies and persists an operation failure before returning it', async () => {
    repository.claim.mockResolvedValue({
      type: 'acquired',
      requestId: 'request-1',
      leaseToken: 'lease-1',
    });
    const error = new Error('Database service unavailable');
    await expect(
      service.execute({
        organizationId: 'org-1',
        idempotencyKey: 'campaign:location-1',
        body,
        creationMethod: 'API',
        operation: jest.fn().mockRejectedValue(error),
      })
    ).rejects.toBe(error);
    expect(repository.fail).toHaveBeenCalledWith(
      'request-1',
      'lease-1',
      expect.objectContaining({
        failureClass: 'recoverable',
        code: 'provider_unavailable',
        reason: 'Database service unavailable',
      })
    );
  });

  it('surfaces a ledger-write failure instead of silently losing it', async () => {
    repository.claim.mockResolvedValue({
      type: 'acquired',
      requestId: 'request-1',
      leaseToken: 'lease-1',
    });
    const ledgerError = new Error('ledger unavailable');
    repository.fail.mockRejectedValue(ledgerError);
    await expect(
      service.execute({
        organizationId: 'org-1',
        idempotencyKey: 'campaign:location-1',
        body,
        creationMethod: 'API',
        operation: jest.fn().mockRejectedValue(new Error('create failed')),
      })
    ).rejects.toBe(ledgerError);
  });
});
