import 'reflect-metadata';
import { YoutubeProvider } from './youtube.provider';

describe('YoutubeProvider authorization revocation', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it.each([200, 400])(
    'treats Google HTTP %s as no remaining authorization',
    async (status) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: status === 200,
        status,
        text: jest.fn().mockResolvedValue(''),
      }) as any;
      await expect(
        new YoutubeProvider().revokeConnection('access', 'refresh')
      ).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke',
        expect.objectContaining({
          method: 'POST',
          body: 'token=refresh',
        })
      );
    }
  );

  it('keeps a transient Google revocation failure visible and retryable', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue('unavailable'),
    }) as any;
    await expect(
      new YoutubeProvider().revokeConnection('access')
    ).rejects.toThrow('temporarily unavailable (HTTP 503)');
  });
});
