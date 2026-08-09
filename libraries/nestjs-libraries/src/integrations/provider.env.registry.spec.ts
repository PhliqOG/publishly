import {
  providerEnvRegistry,
  missingProviderEnv,
  isProviderConfigured,
} from './provider.env.registry';

describe('provider.env.registry', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const key of cleanup.splice(0)) {
      delete process.env[key];
    }
  });

  it('covers every entry with an array', () => {
    for (const [id, keys] of Object.entries(providerEnvRegistry)) {
      expect(Array.isArray(keys)).toBe(true);
      expect(id).toMatch(/^[a-z-]+$/);
    }
  });

  it('reports missing env vars for unconfigured providers', () => {
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
    expect(missingProviderEnv('facebook')).toEqual([
      'FACEBOOK_APP_ID',
      'FACEBOOK_APP_SECRET',
    ]);
    expect(isProviderConfigured('facebook')).toBe(false);
  });

  it('reports configured when all vars are set', () => {
    process.env.FACEBOOK_APP_ID = 'x';
    process.env.FACEBOOK_APP_SECRET = 'y';
    cleanup.push('FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET');
    expect(isProviderConfigured('facebook')).toBe(true);
  });

  it('treats env-free providers as always configured', () => {
    expect(isProviderConfigured('bluesky')).toBe(true);
    expect(isProviderConfigured('testprovider')).toBe(true);
  });

  it('treats unknown identifiers as configured (no server gate)', () => {
    expect(isProviderConfigured('not-a-provider')).toBe(true);
  });
});
