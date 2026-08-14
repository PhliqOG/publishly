import {
  expectedTokenLifetimeDays,
  resolveTokenWindow,
  tokenDaysRemaining,
  tokenWarningThreshold,
} from './connection.health.policy';

describe('connection health policy', () => {
  const issuedAt = new Date('2026-08-10T12:00:00.000Z');

  it.each([
    ['facebook', 60],
    ['instagram-standalone', 60],
    ['linkedin-page', 60],
    ['tiktok', 1],
    ['x', 90],
    ['mastodon', undefined],
  ])('maps %s to its expected token lifetime', (provider, days) => {
    expect(expectedTokenLifetimeDays(provider)).toBe(days);
  });

  it('uses the shorter of provider-reported and expected lifetime', () => {
    expect(
      resolveTokenWindow({
        providerIdentifier: 'x',
        expiresInSeconds: 30 * 86_400,
        issuedAt,
      })
    ).toEqual({
      issuedAt,
      expiration: new Date('2026-09-09T12:00:00.000Z'),
      lifetimeDays: 30,
    });
    expect(
      resolveTokenWindow({
        providerIdentifier: 'facebook',
        expiresInSeconds: 999_999_999,
        issuedAt,
      }).expiration
    ).toEqual(new Date('2026-10-09T12:00:00.000Z'));
  });

  it('keeps an unknown horizon only when neither policy nor OAuth supplies one', () => {
    expect(
      resolveTokenWindow({ providerIdentifier: 'mastodon', issuedAt })
    ).toEqual({ issuedAt, expiration: null, lifetimeDays: null });
  });

  it('computes exact warning windows around expiry', () => {
    expect(
      tokenDaysRemaining(new Date('2026-08-17T11:00:00.000Z'), issuedAt)
    ).toBe(7);
    expect(tokenWarningThreshold(29)).toBe(30);
    expect(tokenWarningThreshold(13)).toBe(14);
    expect(tokenWarningThreshold(6)).toBe(7);
    expect(tokenWarningThreshold(0)).toBeNull();
  });
});
