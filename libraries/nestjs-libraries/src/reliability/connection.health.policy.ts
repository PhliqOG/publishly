export const TOKEN_WARNING_THRESHOLDS_DAYS = [1, 3, 7, 14, 30] as const;
export const CONNECTION_STALE_WARNING_DAYS = 14;
export const CONNECTION_DEAD_STALE_DAYS = 30;
export const CONNECTION_DEAD_ERROR_THRESHOLD = 3;

const EXPECTED_TOKEN_LIFETIME_DAYS: Record<string, number> = {
  facebook: 60,
  instagram: 60,
  'instagram-standalone': 60,
  threads: 60,
  linkedin: 60,
  'linkedin-page': 60,
  // TikTok Login Kit access tokens are currently issued for 24 hours. The
  // provider normally supplies its own expires_in value; this is the safe
  // fallback when that field is missing.
  tiktok: 1,
  x: 90,
};

export function expectedTokenLifetimeDays(providerIdentifier: string) {
  return EXPECTED_TOKEN_LIFETIME_DAYS[providerIdentifier.toLowerCase()];
}

export function resolveTokenWindow(input: {
  providerIdentifier: string;
  expiresInSeconds?: number | null;
  issuedAt?: Date;
}) {
  const issuedAt = input.issuedAt ?? new Date();
  const expectedDays = expectedTokenLifetimeDays(input.providerIdentifier);
  const reportedSeconds =
    typeof input.expiresInSeconds === 'number' &&
    Number.isFinite(input.expiresInSeconds) &&
    input.expiresInSeconds > 0
      ? input.expiresInSeconds
      : undefined;
  const expectedSeconds = expectedDays ? expectedDays * 86_400 : undefined;
  const lifetimeSeconds =
    reportedSeconds && expectedSeconds
      ? Math.min(reportedSeconds, expectedSeconds)
      : reportedSeconds || expectedSeconds;
  if (!lifetimeSeconds) {
    return { issuedAt, expiration: null, lifetimeDays: null };
  }
  return {
    issuedAt,
    expiration: new Date(issuedAt.getTime() + lifetimeSeconds * 1000),
    lifetimeDays: Math.max(1, Math.ceil(lifetimeSeconds / 86_400)),
  };
}

export function tokenDaysRemaining(
  expiration: Date | null | undefined,
  now = new Date()
) {
  if (!expiration) return null;
  return Math.ceil((expiration.getTime() - now.getTime()) / 86_400_000);
}

export function tokenWarningThreshold(daysRemaining: number | null) {
  if (daysRemaining === null || daysRemaining <= 0) return null;
  return (
    TOKEN_WARNING_THRESHOLDS_DAYS.find(
      (threshold) => daysRemaining <= threshold
    ) ?? null
  );
}

export const CONNECTION_LEVEL_FAILURE_CODES = new Set([
  'provider_unavailable',
  'network_error',
  'status_check_failed',
  'token_refresh_required',
  'reconnect_required',
  'permission_required',
  'account_disabled',
  'account_restricted',
  'outcome_unknown',
]);

export const IMMEDIATE_RECONNECT_FAILURE_CODES = new Set([
  'reconnect_required',
  'permission_required',
  'account_disabled',
  'account_restricted',
]);

export const PROVIDER_CONTACT_FAILURE_CODES = new Set([
  ...CONNECTION_LEVEL_FAILURE_CODES,
  'rate_limited',
  'invalid_media',
  'invalid_caption',
  'content_too_long',
  'invalid_settings',
  'unsupported_content',
  'provider_rejected_content',
]);
