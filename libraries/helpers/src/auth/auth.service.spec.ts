import { AuthService } from './auth.service';

describe('AuthService password hashing', () => {
  const nativeBcryptVector =
    '$2b$10$N9qo8uLOickgx2ZMRZoMyeq99xmLYUo7LuBXaXDBMU1kAc.Quvtve';

  it('accepts hashes produced by the previous native bcrypt implementation', () => {
    expect(AuthService.comparePassword('publishly-test', nativeBcryptVector)).toBe(
      true
    );
    expect(AuthService.comparePassword('wrong-password', nativeBcryptVector)).toBe(
      false
    );
  });

  it('creates a bcrypt hash that round-trips without storing plaintext', () => {
    const hash = AuthService.hashPassword('publishly-round-trip');

    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash).not.toContain('publishly-round-trip');
    expect(AuthService.comparePassword('publishly-round-trip', hash)).toBe(true);
    expect(AuthService.comparePassword('different', hash)).toBe(false);
  });
});
