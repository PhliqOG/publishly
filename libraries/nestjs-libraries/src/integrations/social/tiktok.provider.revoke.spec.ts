import 'reflect-metadata';
import { TiktokProvider } from './tiktok.provider';

describe('TiktokProvider authorization revocation', () => {
  const originalFetch = global.fetch;
  const originalClientId = process.env.TIKTOK_CLIENT_ID;
  const originalClientSecret = process.env.TIKTOK_CLIENT_SECRET;

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

  it('revokes the access token through TikTok OAuth v2 without putting it in the URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    }) as any;

    await expect(
      new TiktokProvider().revokeConnection('private-user-token')
    ).resolves.toBeUndefined();

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://open.tiktokapis.com/v2/oauth/revoke/');
    expect(url).not.toContain('private-user-token');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-store',
      },
    });
    expect(new URLSearchParams(request.body)).toEqual(
      new URLSearchParams({
        client_key: 'publishly-client-key',
        client_secret: 'publishly-client-secret',
        token: 'private-user-token',
      })
    );
  });

  it('treats TikTok access_token_invalid as no remaining authorization', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ error: 'access_token_invalid' })),
    }) as any;

    await expect(
      new TiktokProvider().revokeConnection('already-revoked-token')
    ).resolves.toBeUndefined();
  });

  it('accepts TikTok success envelopes as confirmed revocation', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest
        .fn()
        .mockResolvedValue(JSON.stringify({ error: { code: 'ok' } })),
    }) as any;

    await expect(
      new TiktokProvider().revokeConnection('private-user-token')
    ).resolves.toBeUndefined();
  });

  it('keeps a transient TikTok revocation failure visible without exposing the token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('private-user-token'),
    }) as any;

    const promise = new TiktokProvider().revokeConnection(
      'private-user-token'
    );
    await expect(promise).rejects.toThrow(
      'TikTok authorization revocation was not confirmed (HTTP 503)'
    );
    await expect(promise).rejects.not.toThrow('private-user-token');
  });

  it('fails closed when TikTok app credentials are unavailable', async () => {
    delete process.env.TIKTOK_CLIENT_SECRET;
    global.fetch = jest.fn() as any;

    await expect(
      new TiktokProvider().revokeConnection('private-user-token')
    ).rejects.toThrow('not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
