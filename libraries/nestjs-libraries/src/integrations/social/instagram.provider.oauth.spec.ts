import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';

describe('Instagram OAuth review boundary', () => {
  const previousEnvironment = {
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
    FRONTEND_URL: process.env.FRONTEND_URL,
  };

  beforeEach(() => {
    process.env.FACEBOOK_APP_ID = 'publishly-facebook-app';
    process.env.INSTAGRAM_APP_ID = 'publishly-instagram-app';
    process.env.FRONTEND_URL = 'https://publishlyapi.com';
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it.each([
    {
      provider: new InstagramProvider(),
      callback: 'https://publishlyapi.com/integrations/social/instagram',
    },
    {
      provider: new InstagramStandaloneProvider(),
      callback:
        'https://publishlyapi.com/integrations/social/instagram-standalone',
    },
  ])(
    'uses a unique 256-bit state for $callback',
    async ({ provider, callback }) => {
      const first = await provider.generateAuthUrl();
      const second = await provider.generateAuthUrl();

      expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(second.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(first.state).not.toBe(second.state);
      expect(new URL(first.url).searchParams.get('state')).toBe(first.state);
      expect(new URL(first.url).searchParams.get('redirect_uri')).toBe(
        callback
      );
    }
  );
});
