import {
  consumeOAuthLoginState,
  generateOAuthState,
  parseOAuthLoginState,
  serializeOAuthLoginState,
} from './oauth.state';

describe('OAuth state security boundary', () => {
  it('generates unique 256-bit URL-safe state values', () => {
    const values = Array.from({ length: 128 }, () => generateOAuthState());
    expect(new Set(values)).toHaveProperty('size', values.length);
    for (const value of values) {
      expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('binds the stored verifier to the provider', () => {
    const stored = serializeOAuthLoginState('instagram', 'verifier-value');
    expect(parseOAuthLoginState(stored, 'instagram')).toEqual({
      version: 1,
      provider: 'instagram',
      codeVerifier: 'verifier-value',
    });
    expect(() => parseOAuthLoginState(stored, 'tiktok')).toThrow(
      'Invalid OAuth state.'
    );
  });

  it('atomically consumes state exactly once', async () => {
    const state = generateOAuthState();
    const values = new Map([
      [`login:${state}`, serializeOAuthLoginState('tiktok', state)],
    ]);
    const store = {
      getdel: jest.fn(async (key: string) => {
        const value = values.get(key) ?? null;
        values.delete(key);
        return value;
      }),
    };

    await expect(
      consumeOAuthLoginState(store, state, 'tiktok')
    ).resolves.toMatchObject({ provider: 'tiktok', codeVerifier: state });
    await expect(
      consumeOAuthLoginState(store, state, 'tiktok')
    ).rejects.toThrow('Invalid OAuth state.');
    expect(store.getdel).toHaveBeenCalledTimes(2);
  });

  it('rejects weak state before a Redis lookup', async () => {
    const store = { getdel: jest.fn(async () => null) };
    await expect(
      consumeOAuthLoginState(store, 'short-state', 'instagram')
    ).rejects.toThrow('Invalid OAuth state.');
    expect(store.getdel).not.toHaveBeenCalled();
  });
});
