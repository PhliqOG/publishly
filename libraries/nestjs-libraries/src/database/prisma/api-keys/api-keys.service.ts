import { Injectable } from '@nestjs/common';
import { ApiKeysRepository } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.repository';
import { generateApiKey, hashApiKey } from '@gitroom/helpers/auth/crypto.v2';

export const API_KEY_SCOPES = [
  '*',
  'posts:read',
  'posts:write',
  'media:write',
  'integrations:read',
  'integrations:write',
  'notifications:read',
  'video:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// Scoped public-API keys, stored as SHA-256 hashes - a database leak exposes no
// usable credentials, unlike the legacy reversible Organization.apiKey.
@Injectable()
export class ApiKeysService {
  constructor(private _apiKeysRepository: ApiKeysRepository) {}

  // The full key is returned exactly once, at creation.
  async createKey(organizationId: string, name: string, scopes: string[]) {
    const valid = scopes.filter((s) =>
      (API_KEY_SCOPES as readonly string[]).includes(s)
    );
    const { key, prefix, hash } = generateApiKey();
    const row = await this._apiKeysRepository.create(
      organizationId,
      name,
      prefix,
      hash,
      valid.length ? valid : ['*']
    );
    return { id: row.id, name: row.name, prefix: row.prefix, key };
  }

  async validateKey(presentedKey: string) {
    const row = await this._apiKeysRepository.getByHash(
      hashApiKey(presentedKey)
    );
    if (!row || row.revokedAt) {
      return null;
    }

    // Best-effort usage stamp, throttled to once a minute per key so hot keys
    // do not turn every request into a write.
    const olderThan = new Date(Date.now() - 60_000);
    this._apiKeysRepository.touchLastUsed(row.id, olderThan).catch(() => {});

    return {
      organization: row.organization,
      scopes: JSON.parse(row.scopes || '[]') as string[],
      keyId: row.id,
    };
  }

  getKeys(organizationId: string) {
    return this._apiKeysRepository.getKeys(organizationId);
  }

  revoke(organizationId: string, id: string) {
    return this._apiKeysRepository.revoke(organizationId, id);
  }

  static scopeAllows(scopes: string[], required: string) {
    return scopes.includes('*') || scopes.includes(required);
  }
}
