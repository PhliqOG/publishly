import {
  isTrustedCookieRequest,
  safeOAuthReturnUrl,
} from './request.security';

describe('request boundary security', () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.publishly.test';
    process.env.MAIN_URL = 'https://publishly.test';
    process.env.MOBILE_APP_SCHEME = 'publishly';
  });

  it('rejects cross-site and missing origins for unsafe cookie requests', () => {
    expect(
      isTrustedCookieRequest({
        method: 'POST',
        origin: 'https://attacker.test',
        hasHeaderAuth: false,
        hasCookieAuth: true,
      })
    ).toBe(false);
    expect(
      isTrustedCookieRequest({
        method: 'DELETE',
        hasHeaderAuth: false,
        hasCookieAuth: true,
      })
    ).toBe(false);
  });

  it('allows configured origins, safe methods, and explicit auth headers', () => {
    expect(
      isTrustedCookieRequest({
        method: 'POST',
        origin: 'https://app.publishly.test',
        hasHeaderAuth: false,
        hasCookieAuth: true,
      })
    ).toBe(true);
    expect(
      isTrustedCookieRequest({
        method: 'GET',
        hasHeaderAuth: false,
        hasCookieAuth: true,
      })
    ).toBe(true);
    expect(
      isTrustedCookieRequest({
        method: 'POST',
        hasHeaderAuth: true,
        hasCookieAuth: false,
      })
    ).toBe(true);
  });

  it('accepts only local, same-origin, or configured mobile return URLs', () => {
    expect(safeOAuthReturnUrl('/launches')).toBe('/launches');
    expect(safeOAuthReturnUrl('https://app.publishly.test/calendar')).toBe(
      'https://app.publishly.test/calendar'
    );
    expect(safeOAuthReturnUrl('publishly://integrations')).toBe(
      'publishly://integrations'
    );
    expect(safeOAuthReturnUrl('//attacker.test')).toBeUndefined();
    expect(safeOAuthReturnUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeOAuthReturnUrl('https://attacker.test')).toBeUndefined();
  });
});
