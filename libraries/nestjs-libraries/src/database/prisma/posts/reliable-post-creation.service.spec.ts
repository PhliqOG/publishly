import { HttpException } from '@nestjs/common';

jest.mock('./posts.service', () => ({
  PostsService: class PostsService {},
}));
jest.mock('./post-creation-idempotency.service', () => ({
  PostCreationIdempotencyService: class PostCreationIdempotencyService {},
}));
jest.mock('../subscriptions/subscription.service', () => ({
  SubscriptionService: class SubscriptionService {},
}));

import { ReliablePostCreationService } from './reliable-post-creation.service';

const organizationCreatedAt = new Date('2026-08-01T00:00:00.000Z');

function body(overrides: Record<string, any> = {}) {
  return {
    type: 'now',
    date: '2026-08-10T12:00:00.000Z',
    shortLink: false,
    tags: [],
    posts: [
      {
        integration: { id: 'connection-1' },
        settings: {},
        value: [{ content: 'Hello fleet', image: [] }],
      },
    ],
    ...overrides,
  };
}

function validResult(overrides: Record<string, any> = {}) {
  return {
    identifier: 'instagram',
    name: 'Storefront',
    emptyContent: false,
    valid: true,
    errors: true,
    tooLong: false,
    emptyContentFailure: null,
    settingsFailure: null,
    preflightFailure: null,
    mediaFailure: null,
    tooLongFailure: null,
    ...overrides,
  };
}

function makeService(options: {
  mappedBody?: any;
  validation?: any[];
  usage?: any;
} = {}) {
  const mappedBody = options.mappedBody || body();
  const posts = {
    mapTypeToPost: jest.fn().mockResolvedValue(mappedBody),
    validatePosts: jest
      .fn()
      .mockResolvedValue(options.validation || [validResult()]),
    createPost: jest
      .fn()
      .mockResolvedValue([{ postId: 'post-1', integration: 'connection-1' }]),
  };
  const idempotency = {
    execute: jest.fn().mockImplementation(async (input: any) => ({
      value: await input.operation(input.body),
      replayed: false,
    })),
  };
  const subscriptions = {
    getSuccessfulPostUsage: jest.fn().mockResolvedValue(
      options.usage || {
        limit: 2_000,
        used: 41,
        remaining: 1_959,
        exhausted: false,
      }
    ),
  };
  return {
    service: new ReliablePostCreationService(
      posts as any,
      idempotency as any,
      subscriptions as any
    ),
    posts,
    idempotency,
    subscriptions,
  };
}

function create(service: ReliablePostCreationService, overrides = {}) {
  return service.create({
    organizationId: 'org-1',
    organizationCreatedAt,
    rawBody: body(),
    type: 'now',
    idempotencyKey: 'campaign:location-1',
    creationMethod: 'API',
    ...overrides,
  });
}

function response(error: unknown) {
  return (error as HttpException).getResponse() as Record<string, any>;
}

describe('ReliablePostCreationService', () => {
  const originalStripeKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const originalRestrictedDomain = process.env.RESTRICT_UPLOAD_DOMAINS;

  beforeEach(() => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    delete process.env.RESTRICT_UPLOAD_DOMAINS;
  });

  afterAll(() => {
    if (originalStripeKey === undefined) {
      delete process.env.STRIPE_PUBLISHABLE_KEY;
    } else {
      process.env.STRIPE_PUBLISHABLE_KEY = originalStripeKey;
    }
    if (originalRestrictedDomain === undefined) {
      delete process.env.RESTRICT_UPLOAD_DOMAINS;
    } else {
      process.env.RESTRICT_UPLOAD_DOMAINS = originalRestrictedDomain;
    }
  });

  it('uses the shared validation and idempotency path before creating posts', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    const { service, posts, idempotency, subscriptions } = makeService();

    await expect(create(service)).resolves.toEqual({
      value: [{ postId: 'post-1', integration: 'connection-1' }],
      replayed: false,
    });
    expect(subscriptions.getSuccessfulPostUsage).toHaveBeenCalledWith(
      'org-1',
      organizationCreatedAt
    );
    expect(posts.mapTypeToPost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'now' }),
      'org-1',
      true
    );
    expect(posts.validatePosts).toHaveBeenCalledWith(
      'org-1',
      expect.any(Array)
    );
    expect(idempotency.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        idempotencyKey: 'campaign:location-1',
        creationMethod: 'API',
      })
    );
    expect(posts.createPost).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ type: 'now' }),
      'API',
      false,
      true
    );
  });

  it('returns a machine-readable payment error when successful-post quota is exhausted', async () => {
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test';
    const { service, posts } = makeService({
      usage: { limit: 50, used: 50, remaining: 0, exhausted: true },
    });

    const caught = await create(service).catch((error) => error);
    expect(caught).toMatchObject({ status: 402 });
    expect(response(caught)).toMatchObject({
      failureClass: 'user_action_needed',
      code: 'successful_post_quota_exhausted',
      reason: expect.any(String),
      usage: { exhausted: true },
    });
    expect(posts.mapTypeToPost).not.toHaveBeenCalled();
  });

  it('classifies a restricted media host as a data problem', async () => {
    process.env.RESTRICT_UPLOAD_DOMAINS = 'media.publishly.example';
    const { service, posts, idempotency } = makeService({
      mappedBody: body({
        posts: [
          {
            integration: { id: 'connection-1' },
            settings: {},
            value: [
              {
                content: 'Hello',
                image: [{ id: 'media-1', path: 'https://evil.example/a.jpg' }],
              },
            ],
          },
        ],
      }),
    });

    const caught = await create(service).catch((error) => error);
    expect(response(caught)).toMatchObject({
      failureClass: 'data_problem',
      code: 'media_domain_not_allowed',
      reason: expect.stringContaining('media.publishly.example'),
    });
    expect(posts.validatePosts).not.toHaveBeenCalled();
    expect(idempotency.execute).not.toHaveBeenCalled();
  });

  it('preserves classified empty-content failures', async () => {
    const { service } = makeService({
      validation: [
        validResult({
          emptyContent: true,
          emptyContentFailure: {
            failureClass: 'data_problem',
            code: 'invalid_caption',
            reason: 'A caption or media item is required.',
          },
        }),
      ],
    });

    const caught = await create(service).catch((error) => error);
    expect(response(caught)).toMatchObject({
      provider: 'instagram',
      failureClass: 'data_problem',
      code: 'invalid_caption',
      reason: 'A caption or media item is required.',
    });
  });

  it('preserves classified settings and permission failures', async () => {
    const { service } = makeService({
      validation: [
        validResult({
          valid: false,
          settingsError: 'Reconnect with publishing permission.',
          settingsFailure: {
            failureClass: 'user_action_needed',
            code: 'permission_required',
            reason: 'The connection is missing publishing permission.',
          },
        }),
      ],
    });

    const caught = await create(service).catch((error) => error);
    expect(response(caught)).toMatchObject({
      failureClass: 'user_action_needed',
      code: 'permission_required',
      reason: 'The connection is missing publishing permission.',
      message: 'Reconnect with publishing permission.',
    });
  });

  it.each([
    [
      'platform preflight',
      {
        errors: 'Meta capability lookup timed out.',
        preflightFailure: {
          failureClass: 'recoverable',
          code: 'provider_unavailable',
          reason: 'Meta capability lookup timed out.',
        },
      },
      'recoverable',
      'provider_unavailable',
    ],
    [
      'media validation',
      {
        errors: 'The video codec is not supported.',
        mediaFailure: {
          failureClass: 'data_problem',
          code: 'invalid_media',
          reason: 'The video codec is not supported.',
        },
      },
      'data_problem',
      'invalid_media',
    ],
  ])('preserves a classified %s failure', async (_label, failure, failureClass, code) => {
    const { service } = makeService({
      validation: [validResult(failure)],
    });

    const caught = await create(service).catch((error) => error);
    expect(response(caught)).toMatchObject({
      failureClass,
      code,
      reason: expect.any(String),
    });
  });

  it('classifies excessive content length with a non-empty reason', async () => {
    const { service } = makeService({
      validation: [
        validResult({
          tooLong: true,
          tooLongFailure: {
            failureClass: 'data_problem',
            code: 'content_too_long',
            reason: 'The caption exceeds the platform limit.',
          },
        }),
      ],
    });

    const caught = await create(service).catch((error) => error);
    expect(response(caught)).toMatchObject({
      failureClass: 'data_problem',
      code: 'content_too_long',
      reason: 'The caption exceeds the platform limit.',
    });
  });

  it('allows drafts past publish-only validation but never past empty-content validation', async () => {
    const { service, idempotency } = makeService({
      validation: [
        validResult({
          valid: false,
          errors: 'Media is still processing.',
          tooLong: true,
        }),
      ],
    });

    await expect(create(service, { type: 'draft' })).resolves.toMatchObject({
      replayed: false,
    });
    expect(idempotency.execute).toHaveBeenCalledTimes(1);
  });

  it('surfaces idempotency-ledger failures instead of swallowing them', async () => {
    const { service, idempotency } = makeService();
    const ledgerError = new Error('Idempotency ledger unavailable');
    idempotency.execute.mockRejectedValue(ledgerError);

    await expect(create(service)).rejects.toBe(ledgerError);
  });
});
