const PRIVACY_LABELS = {
  PUBLIC_TO_EVERYONE: 'Public to everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Mutual follow friends',
  FOLLOWER_OF_CREATOR: 'Follower of creator',
  SELF_ONLY: 'Self only',
} as const;

export type TikTokPlatformTruth = {
  state?: string;
  publishingMode?: string;
  auditState?: string;
  code?: string | null;
  reason?: string | null;
  privacyLevelOptions?: string[];
  commentDisabled?: boolean | null;
  duetDisabled?: boolean | null;
  stitchDisabled?: boolean | null;
  maxVideoDurationSeconds?: number | null;
  creatorNickname?: string | null;
  creatorUsername?: string | null;
};

export function tiktokPrivacyOptions(truth?: TikTokPlatformTruth) {
  const allowed = new Set(truth?.privacyLevelOptions || []);
  return Object.entries(PRIVACY_LABELS)
    .filter(([value]) => allowed.has(value))
    .map(([value, label]) => ({ value, label }));
}

export function tiktokPlatformTruthNotice(truth?: TikTokPlatformTruth) {
  if (truth?.code === 'tiktok_self_only_unaudited') {
    return {
      severity: 'critical' as const,
      title: 'Private-only TikTok publishing',
      message:
        truth.reason ||
        'This Publishly TikTok app is unaudited. TikTok permits only SELF_ONLY, so direct posts cannot be public.',
    };
  }
  if (!truth || truth.state === 'UNKNOWN') {
    return {
      severity: 'warning' as const,
      title: 'TikTok capability not verified',
      message:
        truth?.reason ||
        'Publishly has not verified TikTok visibility options. Refresh or reconnect this account before direct posting.',
    };
  }
  if (truth.state === 'INVALID' || truth.state === 'LIMITED') {
    return {
      severity: 'critical' as const,
      title: 'TikTok publishing is restricted',
      message: truth.reason || 'TikTok reports a publishing restriction.',
    };
  }
  return null;
}

export function tiktokInteractionState(
  truth: TikTokPlatformTruth | undefined,
  isVideo: boolean
) {
  return {
    showDuet: isVideo,
    showStitch: isVideo,
    duetDisabled: !isVideo || truth?.duetDisabled === true,
    stitchDisabled: !isVideo || truth?.stitchDisabled === true,
    commentDisabled: truth?.commentDisabled === true,
  };
}

export function tiktokDisclosureLabel(brandedContent: boolean) {
  return brandedContent ? 'Paid partnership' : 'Promotional content';
}

export function tiktokBrandedContentPrivacyConflict(
  privacyLevel: string | undefined,
  brandedContent: boolean
) {
  return brandedContent && privacyLevel === 'SELF_ONLY';
}

export function tiktokConsentDeclaration(brandedContent: boolean) {
  return brandedContent
    ? "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation"
    : "By posting, you agree to TikTok's Music Usage Confirmation";
}
