// Real platform marks from simple-icons (CC0 icon set; marks remain their
// owners' trademarks — nominative use to indicate supported integrations).
// LinkedIn is absent from simple-icons by LinkedIn's own request, so its
// familiar "in" tile is drawn locally to match.

import {
  siInstagram,
  siFacebook,
  siTiktok,
  siYoutube,
  siX,
  siThreads,
  siPinterest,
  siBluesky,
  siMastodon,
} from 'simple-icons';

const ICONS: Record<string, { path: string; hex: string } | undefined> = {
  Instagram: siInstagram,
  Facebook: siFacebook,
  TikTok: siTiktok,
  YouTube: siYoutube,
  X: siX,
  Threads: siThreads,
  Pinterest: siPinterest,
  Bluesky: siBluesky,
  Mastodon: siMastodon,
};

export const PlatformIcon = ({
  name,
  size = 17,
}: {
  name: string;
  size?: number;
}) => {
  if (name === 'LinkedIn') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="0" y="0" width="24" height="24" rx="4" fill="#0A66C2" />
        <path
          d="M6.2 9.2h2.8v9H6.2v-9Zm1.4-4.3a1.63 1.63 0 1 1 0 3.26 1.63 1.63 0 0 1 0-3.26ZM10.7 9.2h2.68v1.23h.04c.37-.7 1.28-1.45 2.64-1.45 2.83 0 3.35 1.86 3.35 4.28v4.94h-2.79v-4.38c0-1.05-.02-2.39-1.46-2.39-1.46 0-1.68 1.14-1.68 2.31v4.46H10.7v-9Z"
          fill="#fff"
        />
      </svg>
    );
  }
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={icon.path} fill={`#${icon.hex}`} />
    </svg>
  );
};
