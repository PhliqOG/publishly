import { TiktokProvider } from './tiktok.provider';

describe('TiktokProvider review compliance', () => {
  const provider = new TiktokProvider() as any;

  afterEach(() => jest.restoreAllMocks());

  it('uses PULL_FROM_URL for a server-hosted video', () => {
    expect(
      provider.buildTikokSourceInfoBody({
        media: [{ path: 'https://media.publishly.test/video.mp4' }],
        settings: { content_posting_method: 'DIRECT_POST' },
      })
    ).toEqual({
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: 'https://media.publishly.test/video.mp4',
      },
    });
  });

  it('retains FILE_UPLOAD only for local development media', () => {
    expect(
      provider.buildTikokSourceInfoBody(
        {
          media: [{ path: 'C:\\tmp\\video.mp4' }],
          settings: { content_posting_method: 'DIRECT_POST' },
        },
        1024
      )
    ).toMatchObject({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: 1024,
      },
    });
  });

  it('does not report inbox notification delivery as a published post', async () => {
    jest.spyOn(provider, 'fetch').mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        data: { status: 'SEND_TO_USER_INBOX' },
        error: { code: 'ok', message: '' },
      }),
    });

    await expect(
      provider.checkPostStatus(
        'access-token',
        { publishId: 'v_inbox_file~review' },
        { profile: 'publishly-reviewer' }
      )
    ).resolves.toEqual({
      status: 'pending',
      pendingData: {
        publishId: 'v_inbox_file~review',
        inboxDelivered: true,
      },
    });
  });

  it('accepts only PUBLISH_COMPLETE as TikTok publication proof', async () => {
    jest.spyOn(provider, 'fetch').mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        data: {
          status: 'PUBLISH_COMPLETE',
          publicaly_available_post_id: ['7412345678901234567'],
        },
        error: { code: 'ok', message: '' },
      }),
    });

    await expect(
      provider.checkPostStatus(
        'access-token',
        { publishId: 'v_pub_url~review' },
        { profile: 'publishly-reviewer' }
      )
    ).resolves.toEqual({
      status: 'completed',
      releaseURL:
        'https://www.tiktok.com/@publishly-reviewer/video/7412345678901234567',
      postId: '7412345678901234567',
    });
  });

  it('rejects branded content with private-only visibility before upload', async () => {
    await expect(
      provider.postPending(
        'integration-id',
        'access-token',
        [
          {
            media: [{ path: 'https://media.publishly.test/video.mp4' }],
            settings: {
              publish_consent: true,
              content_posting_method: 'DIRECT_POST',
              disclose: true,
              brand_organic_toggle: false,
              brand_content_toggle: true,
              privacy_level: 'SELF_ONLY',
            },
          },
        ],
        {}
      )
    ).rejects.toThrow(
      'TikTok branded content cannot use private-only visibility.'
    );
  });

  it('uses strong state and omits desktop-only PKCE from the web exchange', async () => {
    const previousClientId = process.env.TIKTOK_CLIENT_ID;
    const previousClientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.TIKTOK_CLIENT_ID = 'publishly-client-id';
    process.env.TIKTOK_CLIENT_SECRET = 'publishly-client-secret';
    process.env.FRONTEND_URL = 'https://publishlyapi.com';

    const generated = await provider.generateAuthUrl();
    expect(generated.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new URL(generated.url).searchParams.get('state')).toBe(
      generated.state
    );

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            scope: provider.scopes.join(','),
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              user: {
                avatar_url: '',
                display_name: 'Publishly Reviewer',
                open_id: 'reviewer-open-id',
                username: 'publishly-reviewer',
              },
            },
          }),
          { status: 200 }
        )
      );
    try {
      await provider.authenticate({
        code: 'authorization-code',
        codeVerifier: generated.codeVerifier,
      });
      const tokenCall = fetchMock.mock.calls[0];
      expect(tokenCall[0]).toBe('https://open.tiktokapis.com/v2/oauth/token/');
      const body = new URLSearchParams(String(tokenCall[1]?.body));
      expect(body.get('client_secret')).toBe('publishly-client-secret');
      expect(body.has('code_verifier')).toBe(false);
    } finally {
      fetchMock.mockRestore();
      if (previousClientId === undefined) delete process.env.TIKTOK_CLIENT_ID;
      else process.env.TIKTOK_CLIENT_ID = previousClientId;
      if (previousClientSecret === undefined)
        delete process.env.TIKTOK_CLIENT_SECRET;
      else process.env.TIKTOK_CLIENT_SECRET = previousClientSecret;
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }
  });
});
