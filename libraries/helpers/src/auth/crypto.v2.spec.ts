import {
  seal,
  open,
  isSealed,
  hashApiKey,
  generateApiKey,
  withOpenToken,
} from './crypto.v2';
import { encrypt_legacy_using_IV } from './auth.service';

describe('crypto.v2', () => {
  it('round-trips seal/open', () => {
    const secret = 'my social token 12345 !@#$%^&*()';
    const sealed = seal(secret);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(open(sealed)).toBe(secret);
  });

  it('produces a different ciphertext every time (random IV)', () => {
    expect(seal('same')).not.toEqual(seal('same'));
  });

  it('throws on tampered v2 ciphertext (authenticated)', () => {
    const sealed = seal('data');
    const parts = sealed.split(':');
    // flip a character in the ciphertext segment
    const last = parts[3];
    parts[3] = (last[0] === 'A' ? 'B' : 'A') + last.slice(1);
    expect(() => open(parts.join(':'))).toThrow();
  });

  it('passes plain legacy tokens through unchanged', () => {
    expect(open('EAABsbCS1234PlainFacebookToken')).toBe(
      'EAABsbCS1234PlainFacebookToken'
    );
  });

  it('decrypts legacy fixedEncryption hex values', () => {
    const legacy = encrypt_legacy_using_IV('legacy-stored-token');
    expect(open(legacy)).toBe('legacy-stored-token');
  });

  it('does not mangle a fresh token that merely looks like hex', () => {
    // 64 hex chars that were never produced by the legacy cipher: wrong-key
    // decryption is either invalid padding or unprintable - both return input.
    const hexLookalike = 'deadbeef'.repeat(8);
    expect(open(hexLookalike)).toBe(hexLookalike);
  });

  it('withOpenToken opens a copy and leaves the original sealed', () => {
    const sealedRow = { token: seal('tok-123'), other: 1 } as any;
    const opened = withOpenToken(sealedRow);
    expect(opened.token).toBe('tok-123');
    expect(opened.other).toBe(1);
    expect(isSealed(sealedRow.token)).toBe(true);
  });

  it('generates pub_ keys whose hash matches hashApiKey', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key.startsWith('pub_')).toBe(true);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).toHaveLength(64);
  });
});
