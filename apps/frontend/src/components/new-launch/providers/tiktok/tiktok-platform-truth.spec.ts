import {
  tiktokDisclosureLabel,
  tiktokInteractionState,
  tiktokPlatformTruthNotice,
  tiktokPrivacyOptions,
} from './tiktok-platform-truth';

describe('TikTok composer platform truth', () => {
  it('offers only the exact privacy choices returned by creator-info', () => {
    expect(
      tiktokPrivacyOptions({
        privacyLevelOptions: ['SELF_ONLY', 'NOT_A_REAL_OPTION'],
      })
    ).toEqual([{ value: 'SELF_ONLY', label: 'Self only' }]);
  });

  it('does not invent choices when creator-info is absent', () => {
    expect(tiktokPrivacyOptions(undefined)).toEqual([]);
  });

  it('makes unaudited private-only behavior explicit', () => {
    expect(
      tiktokPlatformTruthNotice({
        state: 'LIMITED',
        publishingMode: 'SELF_ONLY',
        auditState: 'UNAUDITED',
        code: 'tiktok_self_only_unaudited',
        reason: 'Every direct post is private-only.',
      })
    ).toEqual({
      severity: 'critical',
      title: 'Private-only TikTok publishing',
      message: 'Every direct post is private-only.',
    });
  });

  it('warns when capability has not been verified', () => {
    expect(tiktokPlatformTruthNotice(undefined)).toMatchObject({
      severity: 'warning',
      title: 'TikTok capability not verified',
    });
  });

  it('hides video-only controls on photos and disables creator-blocked controls', () => {
    expect(tiktokInteractionState(undefined, false)).toMatchObject({
      showDuet: false,
      showStitch: false,
      duetDisabled: true,
      stitchDisabled: true,
    });
    expect(
      tiktokInteractionState(
        { commentDisabled: true, duetDisabled: true, stitchDisabled: false },
        true
      )
    ).toEqual({
      showDuet: true,
      showStitch: true,
      duetDisabled: true,
      stitchDisabled: false,
      commentDisabled: true,
    });
  });

  it('uses TikTok audit labels for disclosure state', () => {
    expect(tiktokDisclosureLabel(false)).toBe('Promotional content');
    expect(tiktokDisclosureLabel(true)).toBe('Paid partnership');
  });
});
