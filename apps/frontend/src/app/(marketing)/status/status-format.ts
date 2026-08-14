export type PublicStatusState =
  | 'OPERATIONAL'
  | 'DEGRADED'
  | 'OUTAGE'
  | 'INSUFFICIENT_DATA';

export const STATUS_FETCH_FAILURE_MESSAGE =
  'Live status data is unavailable. Treat Publishly status as unknown until this panel reconnects.';

export function statusLabel(state: PublicStatusState) {
  switch (state) {
    case 'OPERATIONAL':
      return 'Operational';
    case 'DEGRADED':
      return 'Degraded';
    case 'OUTAGE':
      return 'Outage';
    case 'INSUFFICIENT_DATA':
      return 'Not enough data yet';
  }
}

export function formatStatusPercent(value: number | null) {
  return value === null
    ? 'No data yet'
    : `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

const PLATFORM_NAMES: Record<string, string> = {
  instagram: 'Instagram',
  'instagram-standalone': 'Instagram Login',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  threads: 'Threads',
  linkedin: 'LinkedIn',
  'linkedin-page': 'LinkedIn Pages',
  pinterest: 'Pinterest',
};

export function statusPlatformName(provider: string) {
  return (
    PLATFORM_NAMES[provider] ||
    provider
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ')
  );
}
