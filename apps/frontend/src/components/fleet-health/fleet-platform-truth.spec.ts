import { fleetPlatformTruthBadge } from './fleet-platform-truth';

describe('fleet platform-truth badge', () => {
  it('names unaudited TikTok SELF_ONLY behavior without ambiguity', () => {
    expect(
      fleetPlatformTruthBadge({
        state: 'LIMITED',
        publishingMode: 'SELF_ONLY',
        auditState: 'UNAUDITED',
        code: 'tiktok_self_only_unaudited',
        reason: 'Every direct post is private-only.',
      })
    ).toEqual({
      label: 'Private only · unaudited',
      tone: 'red',
      reason: 'Every direct post is private-only.',
    });
  });

  it.each([
    ['INVALID', 'Setup invalid', 'red'],
    ['LIMITED', 'Publishing limited', 'red'],
    ['UNKNOWN', 'Truth unknown', 'yellow'],
    ['READY', 'Verified ready', 'green'],
    ['NOT_APPLICABLE', 'Not required', 'neutral'],
  ] as const)('maps %s to a visible %s badge', (state, label, tone) => {
    expect(
      fleetPlatformTruthBadge({
        state,
        publishingMode: 'PUBLIC_CAPABLE',
        auditState: 'NOT_APPLICABLE',
      })
    ).toMatchObject({ label, tone });
  });
});
