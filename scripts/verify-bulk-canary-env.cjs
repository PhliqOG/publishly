#!/usr/bin/env node

'use strict';

const { loadEnvFile } = require('./verify-production-env.cjs');
const {
  composeProjectName,
} = require('./bulk-scheduler-canary-stack.cjs');
const matrix = require('../data/bulk-scheduler-capabilities.json');

const REQUIRED = Object.freeze([
  'PUBLISHLY_RUNTIME_PROFILE',
  'PUBLISHLY_IMAGE_TAG',
  'PUBLISHLY_BUILD_REVISION',
  'PUBLISHLY_DOMAIN',
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
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET',
  'S3_PUBLIC_URL',
  'BULK_SCHEDULER_CANARY_MODE',
  'BULK_SCHEDULER_CANARY_TUPLES',
  'BULK_SCHEDULER_CANARY_INTEGRATIONS',
  'BULK_SCHEDULER_MATERIALIZER_ENABLED',
  'PROVIDER_MEDIA_BASE_URL',
  'BULK_PRIVATE_INTERNAL_TOKEN',
  'BULK_PRIVATE_STORAGE_PROVIDER',
  'BULK_PRIVATE_S3_REGION',
  'BULK_PRIVATE_S3_ACCESS_KEY_ID',
  'BULK_PRIVATE_S3_SECRET_ACCESS_KEY',
  'BULK_PRIVATE_S3_BUCKET',
  'CALENDAR_RESERVATION_SHADOW_ENABLED',
  'CALENDAR_RESERVATION_ENFORCEMENT',
  'CALENDAR_RESERVATION_ENFORCED_TENANTS',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'BULK_CANARY_RUN_ID',
  'BULK_CANARY_ORGANIZATION_ID',
  'BULK_CANARY_USER_ID',
  'BULK_CANARY_INTEGRATION_ID',
  'COMPOSE_PROJECT_NAME',
]);

const PLACEHOLDER =
  /(?:pending\.invalid|change[_-]?me|replace[_-]?me|example\.com)/i;
const IDENTIFIER = /^[A-Za-z0-9._-]{8,200}$/;

function csv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function publicHttps(value) {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '::1'].includes(
        parsed.hostname.toLowerCase()
      ) &&
      !PLACEHOLDER.test(value)
    );
  } catch {
    return false;
  }
}

function validateBulkCanaryEnv(env) {
  const issues = [];
  const seen = new Set();
  const value = (key) => String(env[key] || '').trim();
  const add = (code, reason) => {
    const identity = `${code}:${reason}`;
    if (!seen.has(identity)) {
      seen.add(identity);
      issues.push({ code, reason });
    }
  };
  const exact = (key, expected) => {
    if (value(key).toLowerCase() !== expected) {
      add('canary_flag_invalid', `${key} must be ${expected}.`);
    }
  };

  for (const key of REQUIRED) {
    if (!value(key)) add('canary_value_missing', `${key} is required.`);
  }

  if (value('PUBLISHLY_RUNTIME_PROFILE') !== 'provider_canary') {
    add(
      'canary_profile_invalid',
      'PUBLISHLY_RUNTIME_PROFILE must be provider_canary.'
    );
  }
  if (
    !/^(?:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/i.test(
      value('PUBLISHLY_BUILD_REVISION')
    )
  ) {
    add(
      'canary_build_revision_invalid',
      'PUBLISHLY_BUILD_REVISION must be a full git SHA or sha256 workspace digest.'
    );
  }
  if (
    !IDENTIFIER.test(value('PUBLISHLY_IMAGE_TAG')) ||
    /^(?:latest|local)$/i.test(value('PUBLISHLY_IMAGE_TAG'))
  ) {
    add(
      'canary_image_tag_invalid',
      'PUBLISHLY_IMAGE_TAG must be an immutable canary tag.'
    );
  }

  exact('CONFIG_STRICT', 'true');
  exact('IS_GENERAL', 'true');
  exact('DISABLE_REGISTRATION', 'true');
  exact('ALLOW_LEGACY_API_KEYS', 'false');
  exact('BULK_SCHEDULER_KILL_ALL', 'false');
  exact('BULK_SCHEDULER_CANARY_MODE', 'true');
  exact('BULK_SCHEDULER_MATERIALIZER_ENABLED', 'true');
  exact('CALENDAR_RESERVATION_KILL_ALL', 'false');
  exact('CALENDAR_RESERVATION_SHADOW_ENABLED', 'true');
  exact('CALENDAR_RESERVATION_ENFORCEMENT', 'true');
  if (['true', '1', 'yes'].includes(value('NOT_SECURED').toLowerCase())) {
    add('canary_insecure_mode', 'NOT_SECURED must be empty or false.');
  }
  if (
    ['true', '1', 'yes'].includes(value('ENABLE_TEST_PROVIDER').toLowerCase())
  ) {
    add(
      'canary_test_provider_enabled',
      'ENABLE_TEST_PROVIDER must be empty or false for a real-provider canary.'
    );
  }

  for (const key of ['JWT_SECRET', 'ENCRYPTION_SECRET']) {
    if (value(key).length < 64) {
      add(
        'canary_secret_too_short',
        `${key} must contain at least 64 characters.`
      );
    }
  }
  for (const key of [
    'DATABASE_PASSWORD',
    'TEMPORAL_DATABASE_PASSWORD',
    'MINIO_ROOT_PASSWORD',
    'BULK_PRIVATE_INTERNAL_TOKEN',
  ]) {
    if (value(key).length < 32) {
      add(
        'canary_secret_too_short',
        `${key} must contain at least 32 characters.`
      );
    }
  }
  if (value('JWT_SECRET') === value('ENCRYPTION_SECRET')) {
    add(
      'canary_secret_reused',
      'JWT_SECRET and ENCRYPTION_SECRET must differ.'
    );
  }
  if (value('DATABASE_PASSWORD') === value('TEMPORAL_DATABASE_PASSWORD')) {
    add(
      'canary_secret_reused',
      'Application and Temporal database passwords must differ.'
    );
  }

  let main;
  let backend;
  let providerMedia;
  try {
    main = new URL(value('MAIN_URL'));
  } catch {
    add('canary_url_invalid', 'MAIN_URL must be a valid URL.');
  }
  try {
    backend = new URL(value('NEXT_PUBLIC_BACKEND_URL'));
  } catch {
    add('canary_url_invalid', 'NEXT_PUBLIC_BACKEND_URL must be a valid URL.');
  }
  try {
    providerMedia = new URL(value('PROVIDER_MEDIA_BASE_URL'));
  } catch {
    add('canary_url_invalid', 'PROVIDER_MEDIA_BASE_URL must be a valid URL.');
  }
  for (const key of [
    'MAIN_URL',
    'FRONTEND_URL',
    'NEXT_PUBLIC_BACKEND_URL',
    'PROVIDER_MEDIA_BASE_URL',
  ]) {
    if (!publicHttps(value(key))) {
      add(
        'canary_public_https_required',
        `${key} must use the live public HTTPS tunnel.`
      );
    }
  }
  if (main && value('PUBLISHLY_DOMAIN') !== main.hostname) {
    add('canary_origin_mismatch', 'PUBLISHLY_DOMAIN must match MAIN_URL.');
  }
  if (
    backend &&
    `${backend.origin}${backend.pathname}`.replace(/\/$/, '') !==
      `${main?.origin || ''}/api`
  ) {
    add(
      'canary_origin_mismatch',
      'NEXT_PUBLIC_BACKEND_URL must be MAIN_URL plus /api.'
    );
  }
  if (
    providerMedia &&
    `${providerMedia.origin}${providerMedia.pathname}`.replace(/\/$/, '') !==
      `${main?.origin || ''}/api`
  ) {
    add(
      'canary_origin_mismatch',
      'PROVIDER_MEDIA_BASE_URL must be MAIN_URL plus /api.'
    );
  }

  try {
    const database = new URL(value('DATABASE_URL'));
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      database.hostname !== 'postgres' ||
      database.pathname !== '/publishly_canary'
    ) {
      throw new Error('wrong isolated application database');
    }
    if (decodeURIComponent(database.password) !== value('DATABASE_PASSWORD')) {
      add(
        'canary_database_password_mismatch',
        'DATABASE_URL password must match DATABASE_PASSWORD.'
      );
    }
  } catch {
    add(
      'canary_database_not_isolated',
      'DATABASE_URL must select publishly_canary on the isolated postgres service.'
    );
  }
  if (value('REDIS_URL') !== 'redis://redis:6379') {
    add(
      'canary_redis_not_isolated',
      'REDIS_URL must select the isolated redis service.'
    );
  }
  if (value('TEMPORAL_ADDRESS') !== 'temporal:7233') {
    add(
      'canary_temporal_not_isolated',
      'TEMPORAL_ADDRESS must select the isolated temporal service.'
    );
  }
  if (!/^publishly-canary-[a-z0-9-]{8,80}$/.test(value('TEMPORAL_NAMESPACE'))) {
    add(
      'canary_temporal_namespace_invalid',
      'TEMPORAL_NAMESPACE must be a run-scoped publishly-canary namespace.'
    );
  }

  try {
    const expectedProject = composeProjectName(value('BULK_CANARY_RUN_ID'));
    if (value('COMPOSE_PROJECT_NAME') !== expectedProject) {
      add(
        'canary_compose_project_invalid',
        'COMPOSE_PROJECT_NAME must be derived from the immutable canary run ID.'
      );
    }
  } catch {
    add(
      'canary_run_id_invalid',
      'BULK_CANARY_RUN_ID must be a bounded run-scoped identifier.'
    );
  }

  if (value('STORAGE_PROVIDER') !== 's3') {
    add('canary_storage_invalid', 'STORAGE_PROVIDER must be s3.');
  }
  if (value('BULK_PRIVATE_STORAGE_PROVIDER') !== 's3') {
    add('canary_storage_invalid', 'BULK_PRIVATE_STORAGE_PROVIDER must be s3.');
  }
  if (value('S3_ENDPOINT') !== 'http://minio:9000') {
    add(
      'canary_storage_not_isolated',
      'S3_ENDPOINT must select the isolated MinIO service.'
    );
  }
  if (value('BULK_PRIVATE_S3_ENDPOINT')) {
    add(
      'canary_private_endpoint_override',
      'BULK_PRIVATE_S3_ENDPOINT must be empty so the private store uses the isolated S3 endpoint.'
    );
  }
  if (value('S3_BUCKET') === value('BULK_PRIVATE_S3_BUCKET')) {
    add(
      'canary_private_bucket_reused',
      'Public and private media buckets must be different.'
    );
  }
  if (!/^publishly-canary-public-[a-z0-9-]{8,80}$/.test(value('S3_BUCKET'))) {
    add('canary_bucket_invalid', 'S3_BUCKET must be run-scoped.');
  }
  if (
    !/^publishly-canary-private-[a-z0-9-]{8,80}$/.test(
      value('BULK_PRIVATE_S3_BUCKET')
    )
  ) {
    add('canary_bucket_invalid', 'BULK_PRIVATE_S3_BUCKET must be run-scoped.');
  }
  if (
    value('S3_ACCESS_KEY_ID') !== value('BULK_PRIVATE_S3_ACCESS_KEY_ID') ||
    value('S3_SECRET_ACCESS_KEY') !== value('BULK_PRIVATE_S3_SECRET_ACCESS_KEY')
  ) {
    add(
      'canary_storage_credential_mismatch',
      'Both isolated buckets must use the run-scoped MinIO credential.'
    );
  }

  const tuples = csv(value('BULK_SCHEDULER_CANARY_TUPLES'));
  const integrations = csv(value('BULK_SCHEDULER_CANARY_INTEGRATIONS'));
  const tenants = csv(value('CALENDAR_RESERVATION_ENFORCED_TENANTS'));
  if (tuples.length !== 1) {
    add(
      'canary_scope_invalid',
      'Exactly one capability tuple must be selected.'
    );
  } else {
    const tuple = matrix.tuples.find((candidate) => candidate.id === tuples[0]);
    if (
      !tuple ||
      !tuple.adapterImplemented ||
      !tuple.privateTransportReady ||
      !tuple.confirmationImplemented ||
      !tuple.ambiguityRecoveryImplemented ||
      tuple.defaultEligible
    ) {
      add(
        'canary_tuple_invalid',
        'The selected tuple must be internally proved, customer-disabled, and ambiguity-safe.'
      );
    }
  }
  if (
    integrations.length !== 1 ||
    !IDENTIFIER.test(integrations[0]) ||
    integrations[0] !== value('BULK_CANARY_INTEGRATION_ID')
  ) {
    add(
      'canary_scope_invalid',
      'Exactly one run-scoped integration must be selected.'
    );
  }
  if (
    tenants.length !== 1 ||
    tenants[0] !== value('BULK_CANARY_ORGANIZATION_ID') ||
    !IDENTIFIER.test(tenants[0])
  ) {
    add(
      'canary_scope_invalid',
      'Calendar enforcement must select exactly the generated canary tenant.'
    );
  }

  return issues;
}

function main(argv = process.argv.slice(2)) {
  const filePath = argv[0];
  if (!filePath) {
    console.error(
      'Bulk canary preflight failed.\n- [canary_env_path_missing] Pass the generated canary env file.'
    );
    return 1;
  }
  let loaded;
  try {
    loaded = loadEnvFile(filePath);
  } catch (error) {
    console.error(
      `Bulk canary preflight failed.\n- [canary_env_read_failed] ${
        error instanceof Error
          ? error.message
          : 'The canary env file could not be read.'
      }`
    );
    return 1;
  }
  const issues = validateBulkCanaryEnv(loaded.env);
  if (issues.length) {
    console.error(
      `Bulk canary preflight failed for ${loaded.resolved} (${
        issues.length
      } issue${issues.length === 1 ? '' : 's'}).`
    );
    for (const issue of issues)
      console.error(`- [${issue.code}] ${issue.reason}`);
    return 1;
  }
  console.log(
    `Bulk canary environment preflight passed for ${loaded.resolved}. No secret values were printed.`
  );
  return 0;
}

module.exports = { REQUIRED, csv, publicHttps, validateBulkCanaryEnv, main };

if (require.main === module) process.exitCode = main();
