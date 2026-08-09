import { readFileSync, existsSync } from 'fs';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

export class ConfigurationChecker {
  cfg: dotenv.DotenvParseOutput;
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
    this.checkIsValidUrl('MAIN_URL');
    this.checkIsValidUrl('FRONTEND_URL');
    this.checkIsValidUrl('NEXT_PUBLIC_BACKEND_URL');
    this.checkIsValidUrl('BACKEND_INTERNAL_URL');
    this.checkNonEmpty('STORAGE_PROVIDER', 'Needed to setup storage.');
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
