import crypto from 'crypto';
import { decrypt_legacy_using_IV } from './auth.service';

// At-rest encryption v2: AES-256-GCM, random IV, authenticated, versioned format
// `v2:<iv b64>:<tag b64>:<ciphertext b64>`.
//
// open() accepts, in order: v2 sealed values, legacy fixedEncryption hex values
// (AES-256-CBC, deterministic IV), and raw plaintext (rows written before
// encryption existed). Every write path re-seals as v2, so legacy values
// migrate lazily without downtime or a bulk migration.
//
// Key material: ENCRYPTION_SECRET if set, else JWT_SECRET. Rotating
// ENCRYPTION_SECRET requires re-sealing stored values (see
// commands: reencrypt-at-rest) because open() derives only the current key.

const VERSION_PREFIX = 'v2:';
const HKDF_INFO = 'publishly-at-rest-v2';
const HKDF_SALT = 'publishly-hkdf-salt';

const keyCache = new Map<string, Buffer>();

function secretMaterial(): string {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET or JWT_SECRET must be set for at-rest encryption'
    );
  }
  return secret;
}

function deriveKey(): Buffer {
  const secret = secretMaterial();
  const cached = keyCache.get(secret);
  if (cached) {
    return cached;
  }
  const key = Buffer.from(
    crypto.hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, 32)
  );
  keyCache.set(secret, key);
  return key;
}

export function isSealed(value: string): boolean {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

export function seal(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    VERSION_PREFIX +
    iv.toString('base64') +
    ':' +
    tag.toString('base64') +
    ':' +
    ciphertext.toString('base64')
  );
}

export function open(value: string): string {
  if (value === null || value === undefined) {
    return value;
  }
  if (isSealed(value)) {
    const [iv, tag, ciphertext] = value
      .slice(VERSION_PREFIX.length)
      .split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(),
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
  // Legacy fixedEncryption values are hex ciphertext; raw plaintext rows predate
  // encryption entirely. Try legacy decryption, fall back to returning as-is.
  if (/^[0-9a-f]+$/i.test(value) && value.length % 32 === 0) {
    try {
      return decrypt_legacy_using_IV(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Hashing for API keys: keys are never stored, only their SHA-256. Constant
// length output also serves as the DB lookup index.
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = 'pub_' + crypto.randomBytes(24).toString('base64url');
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}
