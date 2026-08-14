import { ConfigurationChecker } from './configuration.checker';

const validConfiguration = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  CONFIG_STRICT: 'true',
  IS_GENERAL: 'true',
  NOT_SECURED: '',
  ALLOW_LEGACY_API_KEYS: 'false',
  ENABLE_TEST_PROVIDER: 'false',
  DATABASE_URL: 'postgresql://publishly:secret@postgres:5432/publishly',
  REDIS_URL: 'redis://redis:6379',
  TEMPORAL_ADDRESS: 'temporal:7233',
  TEMPORAL_NAMESPACE: 'default',
  JWT_SECRET: 'j'.repeat(64),
  ENCRYPTION_SECRET: 'e'.repeat(64),
  MAIN_URL: 'https://publishly.io',
  FRONTEND_URL: 'https://publishly.io',
  NEXT_PUBLIC_BACKEND_URL: 'https://publishly.io/api',
  BACKEND_INTERNAL_URL: 'http://backend:3000',
  STORAGE_PROVIDER: 's3',
});

const check = (configuration: NodeJS.ProcessEnv) => {
  const checker = new ConfigurationChecker();
  checker.cfg = configuration;
  checker.check();
  return checker.getIssues();
};

describe('ConfigurationChecker production safety', () => {
  it('accepts a complete safe core configuration', () => {
    expect(check(validConfiguration())).toEqual([]);
  });

  it('allows Redis to be disabled only for the explicit single-host runtime', () => {
    const configuration = validConfiguration();
    delete configuration.REDIS_URL;
    configuration.REDIS_DISABLED = 'true';
    configuration.PUBLISHLY_HOST_MODE = 'true';

    expect(check(configuration)).toEqual([]);
  });

  it('still requires Redis when host mode is not explicitly enabled', () => {
    const configuration = validConfiguration();
    delete configuration.REDIS_URL;
    configuration.REDIS_DISABLED = 'true';

    expect(check(configuration)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('REDIS_URL not set'),
        expect.stringContaining('REDIS_URL is not a valid URL'),
      ])
    );
  });

  it('rejects missing Temporal execution configuration', () => {
    const configuration = validConfiguration();
    delete configuration.TEMPORAL_ADDRESS;
    delete configuration.TEMPORAL_NAMESPACE;

    expect(check(configuration)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('TEMPORAL_ADDRESS not set'),
        expect.stringContaining('TEMPORAL_NAMESPACE not set'),
      ])
    );
  });

  it('rejects weak or reused signing and encryption secrets', () => {
    const configuration = validConfiguration();
    configuration.JWT_SECRET = 'same';
    configuration.ENCRYPTION_SECRET = 'same';

    expect(check(configuration)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('JWT_SECRET is only'),
        expect.stringContaining('ENCRYPTION_SECRET is only'),
        expect.stringContaining('must use different values'),
      ])
    );
  });

  it('rejects unsafe production flags', () => {
    const configuration = validConfiguration();
    configuration.CONFIG_STRICT = 'false';
    configuration.IS_GENERAL = 'false';
    configuration.NOT_SECURED = 'true';
    configuration.ALLOW_LEGACY_API_KEYS = 'true';
    configuration.ENABLE_TEST_PROVIDER = 'yes';

    expect(check(configuration)).toEqual(
      expect.arrayContaining([
        'CONFIG_STRICT must be true in production.',
        'IS_GENERAL must be true in production.',
        'NOT_SECURED must be empty or false in production.',
        'ALLOW_LEGACY_API_KEYS must be false in production.',
        'ENABLE_TEST_PROVIDER must be empty or false in production.',
      ])
    );
  });

  it('requires private transport credentials before canary or materializer boot', () => {
    const configuration = validConfiguration();
    configuration.BULK_SCHEDULER_CANARY_MODE = 'true';
    expect(check(configuration)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('PROVIDER_MEDIA_BASE_URL not set'),
        expect.stringContaining('BULK_PRIVATE_INTERNAL_TOKEN not set'),
        expect.stringContaining('BULK_PRIVATE_STORAGE_PROVIDER not set'),
        expect.stringContaining('BULK_PRIVATE_S3_BUCKET not set'),
      ])
    );
  });
});
