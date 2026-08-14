import {
  loadEnvFile,
  parseEnv,
  validateProductionEnv,
  type PreflightIssue,
} from '../../../../scripts/verify-production-env.cjs';

const validEnvironment = (): Record<string, string> => {
  const databasePassword = 'database-password-1234567890-abcd';
  const temporalPassword = 'temporal-password-1234567890-efgh';

  return {
    PUBLISHLY_DOMAIN: 'publishly.io',
    ACME_EMAIL: 'ops@publishly.io',
    PUBLISHLY_IMAGE_TAG: '2026.08.11-git-a1b2c3d',
    PUBLISHLY_BUILD_REVISION: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    NEXT_PUBLIC_BRAND_NAME: 'Publishly',
    NEXT_PUBLIC_SUPPORT_EMAIL: 'support@publishly.io',
    NEXT_PUBLIC_PRIVACY_EMAIL: 'privacy@publishly.io',
    NEXT_PUBLIC_SOURCE_URL: 'https://github.com/publishlyhq/publishly',
    NEXT_PUBLIC_LEGAL_ENTITY_NAME: 'Publishly Labs LLC',
    NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS: '123 Reliability Way, Dover, DE 19901',
    NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE: '2026-08-11',
    NEXT_PUBLIC_GOVERNING_LAW: 'Delaware, United States',
    DATABASE_PASSWORD: databasePassword,
    TEMPORAL_DATABASE_PASSWORD: temporalPassword,
    DATABASE_URL: `postgresql://publishly:${databasePassword}@postgres:5432/publishly`,
    REDIS_URL: 'redis://redis:6379',
    TEMPORAL_ADDRESS: 'temporal:7233',
    TEMPORAL_NAMESPACE: 'default',
    WORKER_DEFAULT_ACTIVITY_CONCURRENCY: '32',
    WORKER_DEFAULT_WORKFLOW_CONCURRENCY: '8',
    WORKER_ACTIVITY_POLLS: '4',
    WORKER_WORKFLOW_POLLS: '4',
    ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS: '180',
    MAIN_URL: 'https://publishly.io',
    FRONTEND_URL: 'https://publishly.io',
    NEXT_PUBLIC_BACKEND_URL: 'https://publishly.io/api',
    BACKEND_INTERNAL_URL: 'http://backend:3000',
    JWT_SECRET: 'j'.repeat(80),
    ENCRYPTION_SECRET: 'e'.repeat(80),
    CONFIG_STRICT: 'true',
    IS_GENERAL: 'true',
    DISABLE_REGISTRATION: 'false',
    NOT_SECURED: '',
    ALLOW_LEGACY_API_KEYS: 'false',
    ENABLE_TEST_PROVIDER: 'false',
    CALENDAR_RESERVATION_KILL_ALL: 'false',
    CALENDAR_RESERVATION_SHADOW_ENABLED: 'true',
    CALENDAR_RESERVATION_ENFORCEMENT: 'false',
    STORAGE_PROVIDER: 's3',
    S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'AKIAPUBLISHLYPRODUCTION',
    S3_SECRET_ACCESS_KEY: 's3-secret-1234567890-production',
    S3_BUCKET: 'publishly-media',
    S3_PUBLIC_URL: 'https://media.publishly.io',
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_live_publishly_valid_key',
    EMAIL_FROM_ADDRESS: 'hello@publishly.io',
    EMAIL_FROM_NAME: 'Publishly',
    STRIPE_PUBLISHABLE_KEY: 'pk_live_publishly_valid_key',
    STRIPE_SECRET_KEY: 'sk_live_publishly_valid_key',
    STRIPE_SIGNING_KEY: 'whsec_publishly_valid_key',
    PUBLISHLY_REQUIRED_PROVIDERS:
      'instagram,facebook,tiktok,youtube,x,threads,linkedin,pinterest,mastodon,bluesky',
    META_GRAPH_VERSION: 'v25.0',
    META_WEBHOOK_VERIFY_TOKEN: 'meta-webhook-verify-token-production-123456',
    TIKTOK_MEDIA_URL_PREFIX_VERIFIED: 'true',
    FACEBOOK_APP_ID: 'facebook-app-123',
    FACEBOOK_APP_SECRET: 'facebook-secret-123',
    TIKTOK_CLIENT_ID: 'tiktok-client-123',
    TIKTOK_CLIENT_SECRET: 'tiktok-secret-123',
    YOUTUBE_CLIENT_ID: 'youtube-client-123',
    YOUTUBE_CLIENT_SECRET: 'youtube-secret-123',
    X_API_KEY: 'x-api-key-123',
    X_API_SECRET: 'x-api-secret-123',
    THREADS_APP_ID: 'threads-app-123',
    THREADS_APP_SECRET: 'threads-secret-123',
    LINKEDIN_CLIENT_ID: 'linkedin-client-123',
    LINKEDIN_CLIENT_SECRET: 'linkedin-secret-123',
    PINTEREST_CLIENT_ID: 'pinterest-client-123',
    PINTEREST_CLIENT_SECRET: 'pinterest-secret-123',
  };
};

const codes = (issues: PreflightIssue[]) => issues.map((issue) => issue.code);

describe('production environment preflight', () => {
  it('accepts a complete configuration matching the public launch surface', () => {
    expect(validateProductionEnv(validEnvironment())).toEqual([]);
  });

  it('requires a strong Meta webhook verify token for Instagram launch', () => {
    const env = validEnvironment();
    env.META_WEBHOOK_VERIFY_TOKEN = 'short';
    expect(codes(validateProductionEnv(env))).toContain(
      'meta_webhook_verify_token_invalid'
    );
  });

  it('parses quoted values, export syntax, comments, and CRLF safely', () => {
    expect(
      parseEnv(
        'export SIMPLE=value\r\nQUOTED="value # retained"\r\nPLAIN=value # removed\r\n# ignored\r\n'
      )
    ).toEqual({
      SIMPLE: 'value',
      QUOTED: 'value # retained',
      PLAIN: 'value',
    });
  });

  it('fails with a classified error when the target file does not exist', () => {
    expect(() => loadEnvFile('__missing_publishly_production_env__')).toThrow(
      /Production environment file not found/
    );
  });

  it('rejects missing and placeholder core values', () => {
    const env = validEnvironment();
    delete env.JWT_SECRET;
    env.DATABASE_PASSWORD = 'CHANGE_ME';

    const result = codes(validateProductionEnv(env));
    expect(result).toContain('required_value_missing');
    expect(result).toContain('placeholder_value_present');
  });

  it('rejects malformed, local, and domain-mismatched public URLs', () => {
    const env = validEnvironment();
    env.PUBLISHLY_DOMAIN = 'localhost';
    env.MAIN_URL = 'not-a-url';
    env.FRONTEND_URL = 'http://localhost:4200';
    env.NEXT_PUBLIC_BACKEND_URL = 'https://api.publishly.io';
    env.TEMPORAL_ADDRESS = 'temporal-without-a-port';
    env.TEMPORAL_NAMESPACE = 'invalid namespace';
    env.DATABASE_URL =
      'postgresql://publishly:different-password@postgres:5432/publishly';

    const result = codes(validateProductionEnv(env));
    expect(result).toEqual(
      expect.arrayContaining([
        'public_domain_invalid',
        'url_invalid',
        'url_protocol_invalid',
        'public_url_is_local',
        'backend_url_route_mismatch',
        'temporal_address_invalid',
        'temporal_namespace_invalid',
        'database_password_mismatch',
      ])
    );
  });

  it('rejects weak or reused application and database secrets', () => {
    const env = validEnvironment();
    env.JWT_SECRET = 'same-short-secret';
    env.ENCRYPTION_SECRET = env.JWT_SECRET;
    env.TEMPORAL_DATABASE_PASSWORD = env.DATABASE_PASSWORD;

    const result = codes(validateProductionEnv(env));
    expect(result).toContain('secret_too_short');
    expect(result).toContain('secrets_reused');
  });

  it('rejects development, legacy-auth, closed-registration, and mutable-image flags', () => {
    const env = validEnvironment();
    env.CONFIG_STRICT = 'false';
    env.DISABLE_REGISTRATION = 'true';
    env.ALLOW_LEGACY_API_KEYS = 'true';
    env.NOT_SECURED = 'true';
    env.ENABLE_TEST_PROVIDER = 'true';
    env.PUBLISHLY_IMAGE_TAG = 'latest';

    const result = codes(validateProductionEnv(env));
    expect(result).toEqual(
      expect.arrayContaining([
        'production_flag_unsafe',
        'insecure_mode_enabled',
        'test_provider_enabled',
        'mutable_image_tag',
      ])
    );
  });

  it('rejects unsafe worker and heartbeat bounds', () => {
    const env = validEnvironment();
    env.WORKER_DEFAULT_ACTIVITY_CONCURRENCY = '1000000';
    env.WORKER_DEFAULT_WORKFLOW_CONCURRENCY = '0';
    env.WORKER_ACTIVITY_POLLS = 'many';
    env.WORKER_WORKFLOW_POLLS = '1';
    env.ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS = '9999';

    expect(codes(validateProductionEnv(env))).toContain('worker_limit_invalid');
  });

  it('keeps shadow comparison enabled during reservation enforcement', () => {
    const env = validEnvironment();
    env.CALENDAR_RESERVATION_ENFORCEMENT = 'true';
    env.CALENDAR_RESERVATION_SHADOW_ENABLED = 'false';
    expect(codes(validateProductionEnv(env))).toContain(
      'calendar_reservation_rollout_invalid'
    );
  });

  it('rejects incomplete production storage and mail configuration', () => {
    const env = validEnvironment();
    env.STORAGE_PROVIDER = 'local';
    env.EMAIL_PROVIDER = 'resend';
    delete env.RESEND_API_KEY;

    const result = codes(validateProductionEnv(env));
    expect(result).toContain('production_storage_invalid');
    expect(result).toContain('required_value_missing');
  });

  it('requires isolated private provider media configuration in canary mode', () => {
    const env = validEnvironment();
    env.BULK_SCHEDULER_CANARY_MODE = 'true';
    env.BULK_SCHEDULER_KILL_ALL = 'false';
    env.BULK_SCHEDULER_CANARY_TUPLES = 'instagram.professional.reel.video';
    env.BULK_SCHEDULER_CANARY_INTEGRATIONS = 'designated-test-connection';
    env.BULK_SCHEDULER_MATERIALIZER_ENABLED = 'true';
    env.CALENDAR_RESERVATION_ENFORCEMENT = 'true';
    env.PROVIDER_MEDIA_BASE_URL = 'https://publishly.io/api';
    env.BULK_PRIVATE_INTERNAL_TOKEN =
      'production-private-adapter-secret-32-characters';
    env.BULK_PRIVATE_STORAGE_PROVIDER = 's3';
    env.BULK_PRIVATE_S3_BUCKET = env.S3_BUCKET;
    env.BULK_PRIVATE_S3_REGION = 'us-east-1';
    env.BULK_PRIVATE_S3_ACCESS_KEY_ID = 'private-access-key';
    env.BULK_PRIVATE_S3_SECRET_ACCESS_KEY = 'private-secret-key';

    expect(codes(validateProductionEnv(env))).toContain(
      'bulk_private_bucket_is_public_bucket'
    );

    env.BULK_PRIVATE_S3_BUCKET = 'publishly-bulk-private';
    expect(validateProductionEnv(env)).toEqual([]);
  });

  it('fails closed when canary tuple or private transport settings are missing', () => {
    const env = validEnvironment();
    env.BULK_SCHEDULER_CANARY_MODE = 'true';
    const result = codes(validateProductionEnv(env));
    expect(result).toEqual(
      expect.arrayContaining([
        'required_value_missing',
        'bulk_private_storage_invalid',
        'bulk_canary_tuple_missing',
        'bulk_canary_integration_missing',
        'bulk_canary_materializer_disabled',
        'bulk_canary_calendar_not_authoritative',
      ])
    );
  });

  it('rejects a mutable or malformed canary build identity', () => {
    const env = validEnvironment();
    env.PUBLISHLY_BUILD_REVISION = 'bad revision with spaces';
    expect(codes(validateProductionEnv(env))).toContain(
      'build_revision_invalid'
    );
  });

  it('requires live Stripe credentials for the plans sold on the website', () => {
    const env = validEnvironment();
    env.STRIPE_PUBLISHABLE_KEY = 'pk_test_key';
    env.STRIPE_SECRET_KEY = 'sk_test_key';
    env.STRIPE_SIGNING_KEY = 'not-a-webhook-secret';

    const result = codes(validateProductionEnv(env));
    expect(result).toContain('stripe_live_key_required');
    expect(result).toContain('stripe_webhook_secret_invalid');
  });

  it('rejects unknown or unconfigured networks in the declared launch set', () => {
    const env = validEnvironment();
    env.PUBLISHLY_REQUIRED_PROVIDERS = 'tiktok,unknown-network';
    delete env.TIKTOK_CLIENT_SECRET;

    const result = codes(validateProductionEnv(env));
    expect(result).toContain('launch_provider_unconfigured');
    expect(result).toContain('launch_provider_unknown');
  });

  it('rejects incomplete legal identity and an unverified TikTok media origin', () => {
    const env = validEnvironment();
    delete env.NEXT_PUBLIC_LEGAL_ENTITY_NAME;
    env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE = 'August 11';
    env.TIKTOK_MEDIA_URL_PREFIX_VERIFIED = 'false';

    const result = codes(validateProductionEnv(env));
    expect(result).toEqual(
      expect.arrayContaining([
        'required_value_missing',
        'legal_effective_date_invalid',
        'tiktok_media_origin_unverified',
      ])
    );
  });

  it('requires the reviewed Meta Graph version pin', () => {
    const env = validEnvironment();
    env.META_GRAPH_VERSION = 'v24.0';
    expect(codes(validateProductionEnv(env))).toContain(
      'meta_graph_version_invalid'
    );
  });
});
