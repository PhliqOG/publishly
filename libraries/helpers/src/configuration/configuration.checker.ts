import { readFileSync, existsSync } from 'fs';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { BULK_SCHEDULER_CAPABILITY_MATRIX } from '../bulk-scheduler/capability.matrix';

export class ConfigurationChecker {
  cfg: dotenv.DotenvParseOutput = {};
  issues: string[] = [];

  readEnvFromFile() {
    const envFile = resolve(__dirname, '../../../.env');

    if (!existsSync(envFile)) {
      console.error('Env file not found!: ', envFile);
      return;
    }

    const handle = readFileSync(envFile, 'utf-8');

    this.cfg = dotenv.parse(handle);
  }

  readEnvFromProcess() {
    this.cfg = process.env;
  }

  check() {
    this.checkDatabaseServers();
    this.checkNonEmpty('JWT_SECRET');
    this.checkSecretStrength('JWT_SECRET');
    this.checkNonEmpty('ENCRYPTION_SECRET');
    this.checkSecretStrength('ENCRYPTION_SECRET');
    this.checkDifferent('JWT_SECRET', 'ENCRYPTION_SECRET');
    this.checkIsValidUrl('MAIN_URL');
    this.checkIsValidUrl('FRONTEND_URL');
    this.checkIsValidUrl('NEXT_PUBLIC_BACKEND_URL');
    this.checkIsValidUrl('BACKEND_INTERNAL_URL');
    this.checkNonEmpty('TEMPORAL_ADDRESS');
    this.checkNonEmpty('TEMPORAL_NAMESPACE');
    this.checkNonEmpty('STORAGE_PROVIDER', 'Needed to setup storage.');

    if (
      this.get('NODE_ENV') === 'production' ||
      this.get('CONFIG_STRICT') === 'true'
    ) {
      this.checkExact('CONFIG_STRICT', 'true');
      this.checkExact('IS_GENERAL', 'true');
      this.checkFalsy('NOT_SECURED');
      this.checkExact('ALLOW_LEGACY_API_KEYS', 'false');
      this.checkFalsy('ENABLE_TEST_PROVIDER');
      const bulkTransportEnabled =
        this.get(BULK_SCHEDULER_CAPABILITY_MATRIX.canaryModeEnv) === 'true' ||
        this.get('BULK_SCHEDULER_MATERIALIZER_ENABLED') === 'true' ||
        BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.some(
          (tuple) => tuple.defaultEligible
        );
      if (bulkTransportEnabled) {
        this.checkIsValidUrl('PROVIDER_MEDIA_BASE_URL');
        this.checkNonEmpty('BULK_PRIVATE_INTERNAL_TOKEN');
        this.checkSecretStrength('BULK_PRIVATE_INTERNAL_TOKEN');
        this.checkNonEmpty('BULK_PRIVATE_STORAGE_PROVIDER');
        this.checkNonEmpty('BULK_PRIVATE_S3_BUCKET');
      }
    }
  }

  // A secret that is missing, short, or still the .env.example placeholder is
  // an outage/security incident waiting to happen - flag it before boot.
  checkSecretStrength(key: string, minLength = 32) {
    const v = this.get(key);
    if (!v) {
      return;
    }
    if (v.length < minLength) {
      this.issues.push(
        `${key} is only ${v.length} chars - use at least ${minLength} random characters.`
      );
    }
    if (/random string/i.test(v) || /change.?me/i.test(v)) {
      this.issues.push(`${key} still looks like a placeholder value.`);
    }
  }

  // For credential groups that only work as a complete set (e.g. a provider's
  // client id + secret): all set or none set. Partial config means a feature
  // will LOOK enabled and then fail at runtime.
  checkAllOrNone(label: string, keys: string[]) {
    const set = keys.filter((k) => !!this.get(k));
    if (set.length > 0 && set.length < keys.length) {
      const missing = keys.filter((k) => !this.get(k));
      this.issues.push(
        `${label} is partially configured - missing ${missing.join(', ')} (set all of ${keys.join(
          ', '
        )} or none).`
      );
    }
  }

  addIssue(reason: string) {
    if (reason && !this.issues.includes(reason)) {
      this.issues.push(reason);
    }
  }

  checkDifferent(firstKey: string, secondKey: string) {
    const first = this.get(firstKey);
    const second = this.get(secondKey);
    if (first && second && first === second) {
      this.addIssue(`${firstKey} and ${secondKey} must use different values.`);
    }
  }

  checkExact(key: string, expected: string) {
    if (this.get(key) !== expected) {
      this.addIssue(`${key} must be ${expected} in production.`);
    }
  }

  checkFalsy(key: string) {
    const normalized = String(this.get(key) || '').trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      this.addIssue(`${key} must be empty or false in production.`);
    }
  }

  checkNonEmpty(key: string, description?: string): boolean {
    const v = this.get(key);

    if (!description) {
      description = '';
    }

    if (!v) {
      this.issues.push(key + ' not set. ' + description);
      return false;
    }

    if (v.length === 0) {
      this.issues.push(key + ' is empty.' + description);
      return false;
    }

    return true;
  }

  get(key: string): string | undefined {
    return this.cfg[key as keyof typeof this.cfg];
  }

  checkDatabaseServers() {
    this.checkRedis();
    this.checkIsValidUrl('DATABASE_URL');
  }

  checkRedis() {
    if (
      this.cfg.REDIS_DISABLED === 'true' &&
      this.cfg.PUBLISHLY_HOST_MODE === 'true'
    ) {
      return;
    }

    if (!this.cfg.REDIS_URL) {
      this.issues.push('REDIS_URL not set');
    }

    try {
      const redisUrl = new URL(this.cfg.REDIS_URL);

      if (redisUrl.protocol !== 'redis:') {
        this.issues.push('REDIS_URL must start with redis://');
      }
    } catch (error) {
      this.issues.push('REDIS_URL is not a valid URL');
    }
  }

  checkIsValidUrl(key: string) {
    if (!this.checkNonEmpty(key)) {
      return;
    }

    const urlString = this.get(key);

    try {
      new URL(urlString);
    } catch (error) {
      this.issues.push(key + ' is not a valid URL');
    }

    if (urlString.endsWith('/')) {
      this.issues.push(key + ' should not end with /');
    }
  }

  hasIssues() {
    return this.issues.length > 0;
  }

  getIssues() {
    return this.issues;
  }

  getIssuesCount() {
    return this.issues.length;
  }
}
