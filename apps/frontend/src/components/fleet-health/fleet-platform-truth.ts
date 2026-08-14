export type FleetPlatformTruth = {
  state: string;
  publishingMode: string;
  auditState: string;
  code?: string | null;
  reason?: string | null;
  checkedAt?: string | null;
};

export function fleetPlatformTruthBadge(truth: FleetPlatformTruth) {
  if (truth.code === 'tiktok_self_only_unaudited') {
    return {
      label: 'Private only · unaudited',
      tone: 'red' as const,
      reason:
        truth.reason ||
        'TikTok permits only private SELF_ONLY posts for this connection.',
    };
  }
  if (truth.state === 'INVALID') {
    return {
      label: 'Setup invalid',
      tone: 'red' as const,
      reason: truth.reason || 'This platform connection needs action.',
    };
  }
  if (truth.state === 'LIMITED') {
    return {
      label:
        truth.publishingMode === 'SELF_ONLY'
          ? 'Private only'
          : 'Publishing limited',
      tone: 'red' as const,
      reason: truth.reason || 'Platform publishing is restricted.',
    };
  }
  if (truth.state === 'UNKNOWN') {
    return {
      label: 'Truth unknown',
      tone: 'yellow' as const,
      reason: truth.reason || 'Publishly could not verify platform capability.',
    };
  }
  if (truth.state === 'READY') {
    return {
      label: 'Verified ready',
      tone: 'green' as const,
      reason: truth.reason || 'Platform capability was verified.',
    };
  }
  return {
    label: 'Not required',
    tone: 'neutral' as const,
    reason: truth.reason || 'No separate platform capability check is needed.',
  };
}
