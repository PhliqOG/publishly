import 'reflect-metadata';
import { TiktokProvider } from './tiktok.provider';

describe('TiktokProvider OAuth lifecycle', () => {
  const originalFetch = global.fetch;
  const originalClientId = process.env.TIKTOK_CLIENT_ID;
  const originalClientSecret = process.env.TIKTOK_CLIENT_SECRET;

  const response = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(
      typeof body === 'string' ? body : JSON.stringify(body)
    ),
  });

  const tokenResponse = (overrides: Record<string, unknown> = {}) => ({
    access_token: 'rotated-access-token',
    refresh_token: 'rotated-refresh-token',
    expires_in: 86400,
    scope:
      'video.list,user.info.basic,video.publish,video.upload,user.info.profile,user.info.stats',
    ...overrides,
  });

  const identityResponse = () => ({
    data: {
      user: {
        avatar_url: 'https://example.test/avatar.jpg',
        display_name: 'Publishly Reviewer',
        open_id: 'open-id-123',
        username: 'publishly_reviewer',
      },
    },
    error: { code: 'ok' },
  });

  beforeEach(() => {
    process.env.TIKTOK_CLIENT_ID = 'publishly-client-key';
    process.env.TIKTOK_CLIENT_SECRET = 'publishly-client-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    if (originalClientId === undefined) delete process.env.TIKTOK_CLIENT_ID;
    else process.env.TIKTOK_CLIENT_ID = originalClientId;
    if (originalClientSecret === undefined)
      delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = originalClientSecret;
  });

  it('preserves TikTok rotated credentials and renews before their advertised expiry', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, tokenResponse()))
      .mockResolvedValueOnce(response(200, identityResponse())) as any;

    await expect(
      new TiktokProvider().refreshToken('previous-refresh-token')
    ).resolves.toMatchObject({
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresIn: 82800,
      id: 'openid123',
      name: 'Publishly Reviewer',
      username: 'publishly_reviewer',
    });

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    expect(new URLSearchParams(request.body)).toEqual(
      new URLSearchParams({
        client_key: 'publishly-client-key',
        client_secret: 'publishly-client-secret',
        grant_type: 'refresh_token',
        refresh_token: 'previous-refresh-token',
      })
    );
  });

  it('rejects an upstream refresh error without exposing credentials', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response(401, {
          error: 'invalid_grant',
          error_description: 'previous-refresh-token',
        })
      ) as any;

    const promise = new TiktokProvider().refreshToken(
      'previous-refresh-token'
    );
    await expect(promise).rejects.toThrow(
      'TikTok OAuth refresh failed (HTTP 401, code invalid_grant)'
    );
    await expect(promise).rejects.not.toThrow('previous-refresh-token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a successful but incomplete token response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, tokenResponse({ scope: '' }))) as any;

    await expect(
      new TiktokProvider().refreshToken('previous-refresh-token')
    ).rejects.toThrow('returned an incomplete token response');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rechecks granted scopes during refresh', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        response(200, tokenResponse({ scope: 'user.info.basic' }))
      ) as any;

    await expect(
      new TiktokProvider().refreshToken('previous-refresh-token')
    ).rejects.toMatchObject({ message: expect.stringContaining('scopes') });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid identity response without exposing the access token', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(response(200, tokenResponse()))
      .mockResolvedValueOnce(
        response(500, {
          error: { code: 'internal_error', message: 'rotated-access-token' },
        })
      ) as any;

    const promise = new TiktokProvider().refreshToken(
      'previous-refresh-token'
    );
    await expect(promise).rejects.toThrow(
      'TikTok user identity lookup failed (HTTP 500, code internal_error)'
    );
    await expect(promise).rejects.not.toThrow('rotated-access-token');
  });

  it('fails closed before OAuth exchange when app credentials are missing', async () => {
    delete process.env.TIKTOK_CLIENT_SECRET;
    global.fetch = jest.fn() as any;

    await expect(
      new TiktokProvider().refreshToken('previous-refresh-token')
    ).rejects.toThrow('not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
