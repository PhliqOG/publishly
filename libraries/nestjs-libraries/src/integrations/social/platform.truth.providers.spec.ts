import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';
import { TiktokProvider } from './tiktok.provider';
import { PlatformTruthInspectionError } from '@gitroom/nestjs-libraries/reliability/platform.truth';

function jsonResponse(body: unknown) {
  return { json: jest.fn().mockResolvedValue(body) } as any;
}

describe('platform truth provider reads', () => {
  afterEach(() => jest.restoreAllMocks());

  it('queries TikTok creator-info and surfaces exact SELF_ONLY truth', async () => {
    const provider = new TiktokProvider();
    const fetch = jest.spyOn(provider, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          creator_username: 'fleet-user',
          privacy_level_options: ['SELF_ONLY'],
          max_video_post_duration_sec: 60,
        },
        error: { code: 'ok', message: '' },
      })
    );

    await expect(provider.inspectPlatformTruth('token')).resolves.toMatchObject(
      {
        state: 'LIMITED',
        publishingMode: 'SELF_ONLY',
        auditState: 'UNAUDITED',
        code: 'tiktok_self_only_unaudited',
      }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
      'tiktok',
      0,
      true
    );
  });

  it('does not turn a TikTok creator-info error into public capability', async () => {
    const provider = new TiktokProvider();
    jest.spyOn(provider, 'fetch').mockResolvedValue(
      jsonResponse({
        error: { code: 'rate_limit_exceeded', message: 'slow down' },
      })
    );
    await expect(provider.inspectPlatformTruth('token')).rejects.toMatchObject({
      name: 'PlatformTruthInspectionError',
      failureClass: 'recoverable',
      code: 'tiktok_creator_info_rate_limited',
      message: 'slow down',
    });
  });

  it('re-reads the Instagram Page link and professional account type', async () => {
    const provider = new InstagramProvider();
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-1',
          instagram_business_account: { id: 'ig-1' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'ig-1', account_type: 'BUSINESS' })
      );

    await expect(
      provider.inspectPlatformTruth('page-token___user-token', {
        internalId: 'ig-1',
      } as any)
    ).resolves.toMatchObject({
      state: 'READY',
      accountType: 'BUSINESS',
      linkedResourceId: 'page-1',
    });
    expect(fetch.mock.calls[0][0]).toContain(
      '/me?fields=id,instagram_business_account'
    );
    expect(fetch.mock.calls[0][0]).toContain('page-token');
    expect(fetch.mock.calls[1][0]).toContain('/ig-1?fields=id,account_type');
  });

  it('returns invalid truth when the Page link no longer matches', async () => {
    const provider = new InstagramProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-1',
          instagram_business_account: { id: 'ig-other' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'ig-1', account_type: 'BUSINESS' })
      );

    await expect(
      provider.inspectPlatformTruth('page-token___user-token', {
        internalId: 'ig-1',
      } as any)
    ).resolves.toMatchObject({
      state: 'INVALID',
      code: 'instagram_facebook_page_link_mismatch',
    });
  });

  it('refuses to finalize a tampered or stale Instagram Page selection', async () => {
    const provider = new InstagramProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-1',
          access_token: 'page-token',
          instagram_business_account: { id: 'ig-other' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'ig-1',
          name: 'IG',
          username: 'ig',
          account_type: 'BUSINESS',
        })
      );

    try {
      await provider.fetchPageInformation('user-token', {
        pageId: 'page-1',
        id: 'ig-1',
      });
      throw new Error('expected Page mismatch');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformTruthInspectionError);
      expect(error).toMatchObject({
        failureClass: 'user_action_needed',
        code: 'instagram_facebook_page_link_mismatch',
      });
    }
  });

  it('returns verified Instagram truth with the selected Page token', async () => {
    const provider = new InstagramProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'page-1',
          access_token: 'page-token',
          instagram_business_account: { id: 'ig-1' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'ig-1',
          name: 'IG',
          username: 'ig',
          profile_picture_url: 'https://example.com/p.jpg',
          account_type: 'CREATOR',
        })
      );

    await expect(
      provider.fetchPageInformation('user-token', {
        pageId: 'page-1',
        id: 'ig-1',
      })
    ).resolves.toMatchObject({
      id: 'ig-1',
      access_token: 'page-token___user-token',
      platformTruth: {
        state: 'READY',
        accountType: 'CREATOR',
        linkedResourceId: 'page-1',
      },
    });
  });
});
