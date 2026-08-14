import {
  BadBody,
  ProviderTransient,
  RefreshToken,
  SocialAbstract,
  truncateForTemporal,
} from './social.abstract';

jest.mock('sharp', () => jest.fn());
jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    getSsrfSafeDispatcher: jest.fn(() => undefined),
    getSsrfSafeAxios: jest.fn(),
  })
);

class ConfirmationProvider extends SocialAbstract {
  identifier = 'confirmation-test';

  request(method: string) {
    return this.fetch(
      'https://api.social.example.com/posts',
      { method, body: method === 'GET' ? undefined : '{}' },
      this.identifier
    );
  }

  streamed(func: () => Promise<any>) {
    return this.runStreamedUpload(func, this.identifier);
  }

  confirmOfficial(expectedId = 'post-123') {
    return this.confirmJsonResource({
      platform: 'Example',
      method: 'example_resource_read',
      url: 'https://api.social.example.com/posts/post-123',
      expectedId,
      fallbackUrl: 'https://social.example.com/posts/post-123',
      getId: (body) => body?.data?.id,
      getUrl: (body) => body?.data?.url,
    });
  }
}

function failureDetails(error: { details?: unknown[] }) {
  return (error.details?.[0] as any)?.failure;
}

describe('provider failure taxonomy boundary', () => {
  it('serializes token refresh failures as recoverable structured details', () => {
    const error = new RefreshToken(
      'instagram',
      '{"error":"token expired"}',
      '{}'
    );

    expect(error.type).toBe('refresh_token');
    expect(error.message).toBe('token expired');
    expect(failureDetails(error)).toEqual({
      failureClass: 'recoverable',
      failureCode: 'token_refresh_required',
      failureReason: 'token expired',
      willRetry: true,
    });
  });

  it('serializes provider validation failures with a stable data code', () => {
    const error = new BadBody(
      'tiktok',
      '{"message":"Video aspect ratio is invalid"}',
      '{}'
    );

    expect(error.type).toBe('bad_body');
    expect(error.message).toBe('Video aspect ratio is invalid');
    expect(failureDetails(error)).toEqual({
      failureClass: 'data_problem',
      failureCode: 'invalid_media',
      failureReason: 'Video aspect ratio is invalid',
      willRetry: false,
    });
  });

  it('honors an explicit provider code with the catalog-owned class', () => {
    const error = new BadBody(
      'linkedin',
      '{}',
      '{}',
      'The caption violates a platform rule.',
      { code: 'invalid_caption' }
    );

    expect(failureDetails(error)).toMatchObject({
      failureClass: 'data_problem',
      failureCode: 'invalid_caption',
      failureReason: 'The caption violates a platform rule.',
    });
  });

  it('never emits an empty or generic reason from a malformed provider body', () => {
    const error = new BadBody('facebook', 'Unknown Error', '{}');

    expect(error.message).toMatch(/unexpected internal error/i);
    expect(error.message).not.toMatch(/unknown error/i);
    expect(failureDetails(error)).toMatchObject({
      failureClass: 'recoverable',
      failureCode: 'internal_error',
    });
  });

  it('marks only provider-proven transient failures as retryable', () => {
    const error = new ProviderTransient('TikTok rejected before upload: 429');

    expect(error.type).toBe('provider_transient');
    expect(failureDetails(error)).toEqual({
      failureClass: 'recoverable',
      failureCode: 'provider_unavailable',
      failureReason: 'TikTok rejected before upload: 429',
      willRetry: true,
    });
  });

  it('carries bounded provider rate-limit metadata in Temporal details', () => {
    const error = new ProviderTransient('Rate limit reached', {
      code: 'rate_limited',
      retryAfterSeconds: 120,
    });
    expect(error.details?.[0]).toEqual({
      failure: expect.objectContaining({
        failureClass: 'recoverable',
        failureCode: 'rate_limited',
      }),
      retryAfterSeconds: 120,
    });
  });

  describe('durable provider retry boundary', () => {
    let provider: ConfirmationProvider;

    beforeEach(() => {
      provider = new ConfirmationProvider();
      global.fetch = jest.fn() as any;
    });

    it('surfaces 429 once with Retry-After instead of sleeping and replaying', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 429,
        text: jest.fn().mockResolvedValue('{"error":"rate limit"}'),
        headers: { get: (name: string) => (name === 'retry-after' ? '90' : null) },
      });
      await expect(provider.request('POST')).rejects.toMatchObject({
        type: 'provider_transient',
        details: [
          expect.objectContaining({
            retryAfterSeconds: 90,
            failure: expect.objectContaining({ failureCode: 'rate_limited' }),
          }),
        ],
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('never replays an ambiguous mutation 5xx', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 503,
        text: jest.fn().mockResolvedValue('{"error":"unavailable"}'),
        headers: { get: () => null },
      });
      await expect(provider.request('POST')).rejects.toMatchObject({
        type: 'bad_body',
        details: [
          expect.objectContaining({
            failure: expect.objectContaining({
              failureClass: 'user_action_needed',
              failureCode: 'outcome_unknown',
            }),
          }),
        ],
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('allows a read-only 5xx to enter the durable recoverable queue', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 503,
        text: jest.fn().mockResolvedValue('{"error":"unavailable"}'),
        headers: { get: () => null },
      });
      await expect(provider.request('GET')).rejects.toMatchObject({
        type: 'provider_transient',
        details: [
          expect.objectContaining({
            failure: expect.objectContaining({
              failureClass: 'recoverable',
              failureCode: 'provider_unavailable',
            }),
          }),
        ],
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('surfaces streamed-upload 429 without an in-process retry', async () => {
      const operation = jest.fn().mockRejectedValue({
        response: {
          status: 429,
          data: { error: 'rate limit' },
          headers: { 'retry-after': '45' },
        },
      });
      await expect(provider.streamed(operation)).rejects.toMatchObject({
        type: 'provider_transient',
        details: [expect.objectContaining({ retryAfterSeconds: 45 })],
      });
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  it('bounds Temporal payload strings', () => {
    const output = truncateForTemporal('x'.repeat(2_100), 2_000);
    expect(output.length).toBeLessThan(2_050);
    expect(output).toMatch(/truncated 100 chars/);
  });

  describe('independent live confirmation fallback', () => {
    let provider: ConfirmationProvider;

    beforeEach(() => {
      provider = new ConfirmationProvider();
      global.fetch = jest.fn() as any;
    });

    it('refuses a profile URL that does not identify the individual post', async () => {
      const result = await provider.confirmPost(
        'token',
        'post-123',
        'https://social.example.com/profile/alice',
        {} as any
      );

      expect(result).toMatchObject({
        status: 'unsupported',
        method: 'canonical_platform_url',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('confirms only after a second successful read of a post-specific URL', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        url: 'https://social.example.com/posts/post-123',
      });

      await expect(
        provider.confirmPost(
          'token',
          'post-123',
          'https://social.example.com/posts/post-123',
          {} as any
        )
      ).resolves.toEqual({
        status: 'confirmed',
        method: 'canonical_platform_url',
        providerPostId: 'post-123',
        providerUrl: 'https://social.example.com/posts/post-123',
        evidence: { httpStatus: 200 },
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it.each([
      [404, 'not_found'],
      [410, 'not_found'],
      [429, 'pending'],
      [503, 'pending'],
      [403, 'unsupported'],
    ] as const)('maps confirmation HTTP %s to %s', async (status, expected) => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status,
        url: 'https://social.example.com/posts/post-123',
      });

      const result = await provider.confirmPost(
        'token',
        'post-123',
        'https://social.example.com/posts/post-123',
        {} as any
      );
      expect(result.status).toBe(expected);
      expect(result).toHaveProperty('reason');
    });

    it('keeps a transport failure pending for a read-only retry', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));

      const result = await provider.confirmPost(
        'token',
        'post-123',
        'https://social.example.com/posts/post-123',
        {} as any
      );
      expect(result).toMatchObject({
        status: 'pending',
        method: 'canonical_platform_url',
        reason: expect.stringMatching(/ECONNRESET/),
      });
    });

    it('confirms an official resource read only when the returned ID matches', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          data: {
            id: 'post-123',
            url: 'https://social.example.com/posts/post-123',
          },
        }),
      });

      await expect(provider.confirmOfficial()).resolves.toMatchObject({
        status: 'confirmed',
        method: 'example_resource_read',
        providerPostId: 'post-123',
      });
    });

    it('treats a successful API response for a different object as not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ data: { id: 'different-post' } }),
      });

      await expect(provider.confirmOfficial()).resolves.toMatchObject({
        status: 'not_found',
        method: 'example_resource_read',
      });
    });

    it.each([
      [401, 'unsupported'],
      [404, 'not_found'],
      [429, 'pending'],
      [502, 'pending'],
    ] as const)(
      'maps official read HTTP %s to %s',
      async (status, expected) => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status,
          json: jest.fn().mockResolvedValue({}),
        });
        const result = await provider.confirmOfficial();
        expect(result.status).toBe(expected);
        expect(result).toHaveProperty('reason');
      }
    );
  });
});
