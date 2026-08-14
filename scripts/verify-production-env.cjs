#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const approvalManifest = require('../data/provider-approval-manifest.json');
const bulkSchedulerMatrix = require('../data/bulk-scheduler-capabilities.json');

const REQUIRED_PROVIDER_ENV = Object.freeze(
  Object.fromEntries(
    approvalManifest.providers.map((provider) => [
      provider.id,
      Object.freeze(provider.requiredEnv.slice()),
    ])
  )
);

const CORE_REQUIRED = [
  'PUBLISHLY_DOMAIN',
  'ACME_EMAIL',
  'PUBLISHLY_IMAGE_TAG',
  'PUBLISHLY_BUILD_REVISION',
  'NEXT_PUBLIC_BRAND_NAME',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
  'NEXT_PUBLIC_PRIVACY_EMAIL',
  'NEXT_PUBLIC_SOURCE_URL',
  'NEXT_PUBLIC_LEGAL_ENTITY_NAME',
  'NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS',
  'NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE',
  'NEXT_PUBLIC_GOVERNING_LAW',
  'DATABASE_PASSWORD',
  'TEMPORAL_DATABASE_PASSWORD',
  'DATABASE_URL',
  'REDIS_URL',
  'TEMPORAL_ADDRESS',
  'TEMPORAL_NAMESPACE',
  'MAIN_URL',
  'FRONTEND_URL',
  'NEXT_PUBLIC_BACKEND_URL',
  'BACKEND_INTERNAL_URL',
  'JWT_SECRET',
  'ENCRYPTION_SECRET',
  'CONFIG_STRICT',
  'IS_GENERAL',
  'DISABLE_REGISTRATION',
  'ALLOW_LEGACY_API_KEYS',
  'STORAGE_PROVIDER',
  'EMAIL_PROVIDER',
  'EMAIL_FROM_ADDRESS',
  'EMAIL_FROM_NAME',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_SIGNING_KEY',
  'PUBLISHLY_REQUIRED_PROVIDERS',
  'META_GRAPH_VERSION',
];

const PLACEHOLDER_PATTERN =
  /(?:change[_-]?me|replace[_-]?me|your[_-](?:org|domain|value)|publish\.example\.com|(?:^|[.@/])example\.com(?:$|[:/]))/i;

function parseEnv(contents) {
  const parsed = {};

  for (const rawLine of String(contents)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadEnvFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    const error = new Error(
      `Production environment file not found: ${resolved}`
    );
    error.code = 'production_env_file_missing';
    throw error;
  }
  return { resolved, env: parseEnv(fs.readFileSync(resolved, 'utf8')) };
}

function validateProductionEnv(env) {
  const issues = [];
  const seen = new Set();
  const add = (code, reason) => {
    const key = `${code}:${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ code, reason });
  };
  const value = (key) => String(env[key] || '').trim();
  const isPlaceholder = (input) => PLACEHOLDER_PATTERN.test(String(input));
  const requireValue = (key) => {
    const current = value(key);
    if (!current) {
      add('required_value_missing', `${key} is required for production.`);
      return '';
    }
    if (isPlaceholder(current)) {
      add(
        'placeholder_value_present',
        `${key} still contains a template or example value.`
      );
    }
    return current;
  };

  for (const key of CORE_REQUIRED) requireValue(key);

  const buildRevision = value('PUBLISHLY_BUILD_REVISION');
  if (
    buildRevision &&
    !isPlaceholder(buildRevision) &&
    !/^[A-Za-z0-9._:@+-]{7,200}$/.test(buildRevision)
  ) {
    add(
      'build_revision_invalid',
      'PUBLISHLY_BUILD_REVISION must be an immutable git SHA or image digest without whitespace.'
    );
  }

  const validateUrl = (
    key,
    { protocols = ['https:'], noTrailingSlash = false, publicHost = false } = {}
  ) => {
    const current = value(key);
    if (!current || isPlaceholder(current)) return undefined;
    try {
      const parsed = new URL(current);
      if (!protocols.includes(parsed.protocol)) {
        add(
          'url_protocol_invalid',
          `${key} must use ${protocols.join(' or ')} in production.`
        );
      }
      if (
        publicHost &&
        ['localhost', '127.0.0.1', '::1'].includes(
          parsed.hostname.toLowerCase()
        )
      ) {
        add('public_url_is_local', `${key} must use a public production host.`);
      }
      if (noTrailingSlash && current.endsWith('/')) {
        add('url_trailing_slash', `${key} must not end with a slash.`);
      }
      return parsed;
    } catch {
      add('url_invalid', `${key} must be a valid absolute URL.`);
      return undefined;
    }
  };

  const domain = value('PUBLISHLY_DOMAIN').toLowerCase();
  if (domain && !isPlaceholder(domain)) {
    try {
      const parsed = new URL(`https://${domain}`);
      if (
        parsed.hostname !== domain ||
        !domain.includes('.') ||
        ['localhost', '127.0.0.1', '::1'].includes(domain)
      ) {
        throw new Error('not a public hostname');
      }
    } catch {
      add(
        'public_domain_invalid',
        'PUBLISHLY_DOMAIN must be a public hostname without a scheme or path.'
      );
    }
  }

  const mainUrl = validateUrl('MAIN_URL', {
    noTrailingSlash: true,
    publicHost: true,
  });
  const frontendUrl = validateUrl('FRONTEND_URL', {
    noTrailingSlash: true,
    publicHost: true,
  });
  const backendUrl = validateUrl('NEXT_PUBLIC_BACKEND_URL', {
    noTrailingSlash: true,
    publicHost: true,
  });
  validateUrl('NEXT_PUBLIC_SOURCE_URL', { publicHost: true });
  validateUrl('BACKEND_INTERNAL_URL', {
    protocols: ['http:', 'https:'],
    noTrailingSlash: true,
  });

  if (domain && !isPlaceholder(domain)) {
    const expectedOrigin = `https://${domain}`;
    if (mainUrl && mainUrl.origin !== expectedOrigin) {
      add('main_url_domain_mismatch', 'MAIN_URL must use PUBLISHLY_DOMAIN.');
    }
    if (frontendUrl && frontendUrl.origin !== expectedOrigin) {
      add(
        'frontend_url_domain_mismatch',
        'FRONTEND_URL must use PUBLISHLY_DOMAIN.'
      );
    }
    if (
      backendUrl &&
      `${backendUrl.origin}${backendUrl.pathname}` !== `${expectedOrigin}/api`
    ) {
      add(
        'backend_url_route_mismatch',
        'NEXT_PUBLIC_BACKEND_URL must be the public /api route for PUBLISHLY_DOMAIN.'
      );
    }
  }

  const validateEmail = (key) => {
    const current = value(key);
    if (
      current &&
      !isPlaceholder(current) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current)
    ) {
      add('email_invalid', `${key} must be a valid email address.`);
    }
  };
  validateEmail('ACME_EMAIL');
  validateEmail('NEXT_PUBLIC_SUPPORT_EMAIL');
  validateEmail('NEXT_PUBLIC_PRIVACY_EMAIL');
  validateEmail('EMAIL_FROM_ADDRESS');

  const effectiveDate = value('NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE');
  if (
    effectiveDate &&
    !isPlaceholder(effectiveDate) &&
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
  ) {
    add(
      'legal_effective_date_invalid',
      'NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE must use YYYY-MM-DD.'
    );
  }
  if (value('META_GRAPH_VERSION') && value('META_GRAPH_VERSION') !== 'v25.0') {
    add(
      'meta_graph_version_invalid',
      'META_GRAPH_VERSION must match the reviewed provider pin v25.0.'
    );
  }

  const databaseUrl = validateUrl('DATABASE_URL', {
    protocols: ['postgres:', 'postgresql:'],
  });
  const redisUrl = validateUrl('REDIS_URL', {
    protocols: ['redis:', 'rediss:'],
  });
  if (
    databaseUrl &&
    ['localhost', '127.0.0.1', '::1'].includes(
      databaseUrl.hostname.toLowerCase()
    )
  ) {
    add(
      'production_database_is_local',
      'DATABASE_URL must not point at loopback in production.'
    );
  }
  if (databaseUrl && value('DATABASE_PASSWORD')) {
    let databaseUrlPassword = databaseUrl.password;
    try {
      databaseUrlPassword = decodeURIComponent(databaseUrlPassword);
    } catch {
      add(
        'database_url_password_invalid',
        'DATABASE_URL contains an invalid percent-encoded password.'
      );
    }
    if (databaseUrlPassword !== value('DATABASE_PASSWORD')) {
      add(
        'database_password_mismatch',
        'DATABASE_URL password must match DATABASE_PASSWORD in the reference Compose topology.'
      );
    }
  }
  if (
    redisUrl &&
    ['localhost', '127.0.0.1', '::1'].includes(redisUrl.hostname.toLowerCase())
  ) {
    add(
      'production_redis_is_local',
      'REDIS_URL must not point at loopback in production.'
    );
  }

  const temporalAddress = value('TEMPORAL_ADDRESS');
  const temporalMatch = /^([A-Za-z0-9.-]+):(\d{1,5})$/.exec(temporalAddress);
  if (
    temporalAddress &&
    (!temporalMatch ||
      Number(temporalMatch[2]) < 1 ||
      Number(temporalMatch[2]) > 65535)
  ) {
    add(
      'temporal_address_invalid',
      'TEMPORAL_ADDRESS must be a host and TCP port such as temporal:7233.'
    );
  }
  if (
    value('TEMPORAL_NAMESPACE') &&
    !/^[A-Za-z0-9._-]{1,255}$/.test(value('TEMPORAL_NAMESPACE'))
  ) {
    add(
      'temporal_namespace_invalid',
      'TEMPORAL_NAMESPACE contains unsupported characters.'
    );
  }

  const checkSecret = (key, minimum) => {
    const current = value(key);
    if (!current || isPlaceholder(current)) return;
    if (current.length < minimum) {
      add(
        'secret_too_short',
        `${key} must contain at least ${minimum} characters.`
      );
    }
  };
  checkSecret('JWT_SECRET', 64);
  checkSecret('ENCRYPTION_SECRET', 64);
  checkSecret('DATABASE_PASSWORD', 24);
  checkSecret('TEMPORAL_DATABASE_PASSWORD', 24);
  if (
    value('JWT_SECRET') &&
    value('JWT_SECRET') === value('ENCRYPTION_SECRET')
  ) {
    add(
      'secrets_reused',
      'JWT_SECRET and ENCRYPTION_SECRET must be different values.'
    );
  }
  if (
    value('DATABASE_PASSWORD') &&
    value('DATABASE_PASSWORD') === value('TEMPORAL_DATABASE_PASSWORD')
  ) {
    add(
      'secrets_reused',
      'Application and Temporal database passwords must be different values.'
    );
  }

  const requireExact = (key, expected, code = 'production_flag_unsafe') => {
    if (value(key).toLowerCase() !== expected) {
      add(code, `${key} must be ${expected} in production.`);
    }
  };
  requireExact('CONFIG_STRICT', 'true');
  requireExact('IS_GENERAL', 'true');
  requireExact('DISABLE_REGISTRATION', 'false');
  requireExact('ALLOW_LEGACY_API_KEYS', 'false');
  if (['true', '1', 'yes'].includes(value('NOT_SECURED').toLowerCase())) {
    add(
      'insecure_mode_enabled',
      'NOT_SECURED must be empty or false in production.'
    );
  }
  if (
    ['true', '1', 'yes'].includes(value('ENABLE_TEST_PROVIDER').toLowerCase())
  ) {
    add(
      'test_provider_enabled',
      'ENABLE_TEST_PROVIDER must be empty or false in production.'
    );
  }
  if (
    value('CALENDAR_RESERVATION_ENFORCEMENT').toLowerCase() === 'true' &&
    value('CALENDAR_RESERVATION_SHADOW_ENABLED').toLowerCase() !== 'true'
  ) {
    add(
      'calendar_reservation_rollout_invalid',
      'CALENDAR_RESERVATION_SHADOW_ENABLED must remain true while authoritative enforcement is enabled.'
    );
  }
  if (value('NEXT_PUBLIC_BRAND_NAME') !== 'Publishly') {
    add(
      'brand_mismatch',
      'NEXT_PUBLIC_BRAND_NAME must be Publishly for this website release.'
    );
  }
  if (
    ['local', 'latest'].includes(value('PUBLISHLY_IMAGE_TAG').toLowerCase())
  ) {
    add(
      'mutable_image_tag',
      'PUBLISHLY_IMAGE_TAG must identify an immutable release, not local or latest.'
    );
  }

  const boundedInteger = (key, minimum, maximum) => {
    const current = value(key);
    if (!current) return;
    const parsed = Number(current);
    if (
      !/^\d+$/.test(current) ||
      !Number.isSafeInteger(parsed) ||
      parsed < minimum ||
      parsed > maximum
    ) {
      add(
        'worker_limit_invalid',
        `${key} must be an integer from ${minimum} through ${maximum}.`
      );
    }
  };
  boundedInteger('WORKER_DEFAULT_ACTIVITY_CONCURRENCY', 1, 256);
  boundedInteger('WORKER_DEFAULT_WORKFLOW_CONCURRENCY', 2, 64);
  boundedInteger('WORKER_ACTIVITY_POLLS', 1, 32);
  boundedInteger('WORKER_WORKFLOW_POLLS', 2, 32);
  boundedInteger('ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS', 60, 900);

  const storageProvider = value('STORAGE_PROVIDER').toLowerCase();
  if (storageProvider === 's3') {
    for (const key of [
      'S3_REGION',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'S3_BUCKET',
      'S3_PUBLIC_URL',
    ]) {
      requireValue(key);
    }
    validateUrl('S3_PUBLIC_URL', { publicHost: true });
    if (value('S3_ENDPOINT')) {
      validateUrl('S3_ENDPOINT', { protocols: ['http:', 'https:'] });
    }
  } else if (storageProvider === 'cloudflare') {
    for (const key of [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_ACCESS_KEY',
      'CLOUDFLARE_SECRET_ACCESS_KEY',
      'CLOUDFLARE_BUCKETNAME',
      'CLOUDFLARE_BUCKET_URL',
    ]) {
      requireValue(key);
    }
    validateUrl('CLOUDFLARE_BUCKET_URL', { publicHost: true });
  } else if (storageProvider) {
    add(
      'production_storage_invalid',
      'STORAGE_PROVIDER must be s3 or cloudflare in production.'
    );
  }

  const bulkTransportEnabled =
    value('BULK_SCHEDULER_CANARY_MODE').toLowerCase() === 'true' ||
    bulkSchedulerMatrix.tuples.some((tuple) => tuple.defaultEligible);
  if (bulkTransportEnabled) {
    const providerMediaOrigin = requireValue('PROVIDER_MEDIA_BASE_URL');
    requireValue('BULK_PRIVATE_INTERNAL_TOKEN');
    checkSecret('BULK_PRIVATE_INTERNAL_TOKEN', 32);
    if (providerMediaOrigin && !isPlaceholder(providerMediaOrigin)) {
      validateUrl('PROVIDER_MEDIA_BASE_URL', {
        noTrailingSlash: true,
        publicHost: true,
      });
    }
    const privateProvider = requireValue(
      'BULK_PRIVATE_STORAGE_PROVIDER'
    ).toLowerCase();
    if (!['s3', 'cloudflare'].includes(privateProvider)) {
      add(
        'bulk_private_storage_invalid',
        'BULK_PRIVATE_STORAGE_PROVIDER must be s3 or cloudflare when Bulk Scheduler transport is enabled.'
      );
    }
    for (const key of [
      'BULK_PRIVATE_S3_BUCKET',
      'BULK_PRIVATE_S3_REGION',
      'BULK_PRIVATE_S3_ACCESS_KEY_ID',
      'BULK_PRIVATE_S3_SECRET_ACCESS_KEY',
    ]) {
      requireValue(key);
    }
    const publicBucket =
      privateProvider === 'cloudflare'
        ? value('CLOUDFLARE_BUCKETNAME')
        : value('S3_BUCKET');
    if (
      value('BULK_PRIVATE_S3_BUCKET') &&
      value('BULK_PRIVATE_S3_BUCKET') === publicBucket
    ) {
      add(
        'bulk_private_bucket_is_public_bucket',
        'BULK_PRIVATE_S3_BUCKET must differ from the public media bucket.'
      );
    }
    if (value('BULK_PRIVATE_S3_ENDPOINT')) {
      validateUrl('BULK_PRIVATE_S3_ENDPOINT', {
        protocols: ['https:'],
      });
    }
    if (
      value('BULK_SCHEDULER_CANARY_MODE').toLowerCase() === 'true' &&
      !value('BULK_SCHEDULER_CANARY_TUPLES')
    ) {
      add(
        'bulk_canary_tuple_missing',
        'BULK_SCHEDULER_CANARY_TUPLES must name the exact designated tuple in canary mode.'
      );
    }
    if (
      value('BULK_SCHEDULER_CANARY_MODE').toLowerCase() === 'true' &&
      !value('BULK_SCHEDULER_CANARY_INTEGRATIONS')
    ) {
      add(
        'bulk_canary_integration_missing',
        'BULK_SCHEDULER_CANARY_INTEGRATIONS must name the exact designated test connection in canary mode.'
      );
    }
    if (value('BULK_SCHEDULER_CANARY_MODE').toLowerCase() === 'true') {
      if (value('BULK_SCHEDULER_KILL_ALL').toLowerCase() === 'true') {
        add(
          'bulk_canary_global_kill_active',
          'BULK_SCHEDULER_KILL_ALL must be false only for the bounded canary window; tuple eligibility remains allowlisted.'
        );
      }
      if (
        value('BULK_SCHEDULER_MATERIALIZER_ENABLED').toLowerCase() !== 'true'
      ) {
        add(
          'bulk_canary_materializer_disabled',
          'BULK_SCHEDULER_MATERIALIZER_ENABLED must be true for an end-to-end Stage 8 canary.'
        );
      }
      if (value('CALENDAR_RESERVATION_ENFORCEMENT').toLowerCase() !== 'true') {
        add(
          'bulk_canary_calendar_not_authoritative',
          'CALENDAR_RESERVATION_ENFORCEMENT must be true and the canary tenant must have verified authority before execution.'
        );
      }
      const selectedTuples = value('BULK_SCHEDULER_CANARY_TUPLES')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      for (const tupleId of selectedTuples) {
        const tuple = bulkSchedulerMatrix.tuples.find(
          (candidate) => candidate.id === tupleId
        );
        if (
          !tuple ||
          !tuple.adapterImplemented ||
          !tuple.privateTransportReady ||
          !tuple.confirmationImplemented ||
          !tuple.ambiguityRecoveryImplemented
        ) {
          add(
            'bulk_canary_tuple_not_candidate',
            `${tupleId} is unknown or lacks an internal adapter, transport, confirmation, or ambiguity prerequisite.`
          );
        }
      }
    }
  }

  const emailProvider = value('EMAIL_PROVIDER').toLowerCase();
  if (emailProvider === 'resend') {
    const resendKey = requireValue('RESEND_API_KEY');
    if (
      resendKey &&
      !isPlaceholder(resendKey) &&
      !resendKey.startsWith('re_')
    ) {
      add(
        'email_credential_invalid',
        'RESEND_API_KEY must be a Resend API key.'
      );
    }
  } else if (emailProvider === 'nodemailer') {
    for (const key of [
      'EMAIL_HOST',
      'EMAIL_PORT',
      'EMAIL_USER',
      'EMAIL_PASS',
    ]) {
      requireValue(key);
    }
    const emailPort = Number(value('EMAIL_PORT'));
    if (
      !/^\d+$/.test(value('EMAIL_PORT')) ||
      emailPort < 1 ||
      emailPort > 65535
    ) {
      add('email_port_invalid', 'EMAIL_PORT must be a valid TCP port.');
    }
  } else if (emailProvider) {
    add(
      'production_email_invalid',
      'EMAIL_PROVIDER must be resend or nodemailer in production.'
    );
  }

  const stripePublishable = value('STRIPE_PUBLISHABLE_KEY');
  const stripeSecret = value('STRIPE_SECRET_KEY');
  const stripeSigning = value('STRIPE_SIGNING_KEY');
  if (
    stripePublishable &&
    !isPlaceholder(stripePublishable) &&
    !stripePublishable.startsWith('pk_live_')
  ) {
    add(
      'stripe_live_key_required',
      'STRIPE_PUBLISHABLE_KEY must be a live-mode publishable key.'
    );
  }
  if (
    stripeSecret &&
    !isPlaceholder(stripeSecret) &&
    !/^[sr]k_live_/.test(stripeSecret)
  ) {
    add(
      'stripe_live_key_required',
      'STRIPE_SECRET_KEY must be a live-mode secret or restricted key.'
    );
  }
  if (
    stripeSigning &&
    !isPlaceholder(stripeSigning) &&
    !stripeSigning.startsWith('whsec_')
  ) {
    add(
      'stripe_webhook_secret_invalid',
      'STRIPE_SIGNING_KEY must be a Stripe webhook signing secret.'
    );
  }

  const requiredProviders = value('PUBLISHLY_REQUIRED_PROVIDERS')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  if (!requiredProviders.length) {
    add(
      'launch_providers_missing',
      'PUBLISHLY_REQUIRED_PROVIDERS must declare the website launch set.'
    );
  }
  for (const provider of new Set(requiredProviders)) {
    const required = REQUIRED_PROVIDER_ENV[provider];
    if (!required) {
      add(
        'launch_provider_unknown',
        `PUBLISHLY_REQUIRED_PROVIDERS contains unsupported provider ${provider}.`
      );
      continue;
    }
    for (const key of required) {
      const current = value(key);
      if (!current || isPlaceholder(current)) {
        add(
          'launch_provider_unconfigured',
          `${provider} requires a real ${key} value before launch.`
        );
      }
    }
  }
  if (
    requiredProviders.includes('tiktok') &&
    value('TIKTOK_MEDIA_URL_PREFIX_VERIFIED').toLowerCase() !== 'true'
  ) {
    add(
      'tiktok_media_origin_unverified',
      'Set TIKTOK_MEDIA_URL_PREFIX_VERIFIED=true only after TikTok URL properties verifies the production media URL prefix.'
    );
  }
  if (requiredProviders.includes('instagram')) {
    const metaWebhookToken = value('META_WEBHOOK_VERIFY_TOKEN');
    if (metaWebhookToken.length < 32 || isPlaceholder(metaWebhookToken)) {
      add(
        'meta_webhook_verify_token_invalid',
        'META_WEBHOOK_VERIFY_TOKEN must be a unique random value of at least 32 characters when Instagram is in the launch set.'
      );
    }
  }

  return issues;
}

function main(argv = process.argv.slice(2)) {
  const filePath = argv[0] || '.env.production';
  let loaded;
  try {
    loaded = loadEnvFile(filePath);
  } catch (error) {
    const code =
      error && error.code ? error.code : 'production_env_read_failed';
    console.error(`Production preflight failed.\n- [${code}] ${error.message}`);
    return 1;
  }

  const issues = validateProductionEnv(loaded.env);
  if (issues.length) {
    console.error(
      `Production preflight failed for ${loaded.resolved} (${
        issues.length
      } issue${issues.length === 1 ? '' : 's'}).`
    );
    for (const issue of issues) {
      console.error(`- [${issue.code}] ${issue.reason}`);
    }
    return 1;
  }

  console.log(
    `Production preflight passed for ${loaded.resolved}. No secret values were printed.`
  );
  return 0;
}

module.exports = {
  REQUIRED_PROVIDER_ENV,
  loadEnvFile,
  parseEnv,
  validateProductionEnv,
  main,
};

if (require.main === module) {
  process.exitCode = main();
}
