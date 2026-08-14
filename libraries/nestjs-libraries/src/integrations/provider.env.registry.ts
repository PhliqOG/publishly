// Single source of truth for which server-side env vars each social provider
// needs before its OAuth connect flow can work. Used by the configuration
// checker (startup warnings) and by IntegrationManager.getAllIntegrations()
// (so the UI can honestly disable providers this deployment has not configured).
//
// An empty array means the provider needs no server credentials: the user
// supplies per-connection details (custom fields, app passwords, self-hosted
// instance URLs) or the flow is extension-based.

export const providerEnvRegistry: Record<string, string[]> = {
  x: ['X_API_KEY', 'X_API_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  'linkedin-page': ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
  instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  'instagram-standalone': ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  gmb: ['GOOGLE_GMB_CLIENT_ID', 'GOOGLE_GMB_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'],
  pinterest: ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'],
  dribbble: ['DRIBBBLE_CLIENT_ID', 'DRIBBBLE_CLIENT_SECRET'],
  discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN_ID'],
  slack: ['SLACK_ID', 'SLACK_SECRET'],
  kick: ['KICK_CLIENT_ID', 'KICK_SECRET'],
  twitch: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
  mastodon: [],
  bluesky: [],
  lemmy: [],
  farcaster: ['NEYNAR_CLIENT_ID', 'NEYNAR_SECRET_KEY'],
  telegram: ['TELEGRAM_TOKEN', 'TELEGRAM_BOT_NAME'],
  nostr: [],
  vk: ['VK_ID'],
  medium: [],
  devto: [],
  hashnode: [],
  wordpress: [],
  listmonk: [],
  moltbook: [],
  whop: ['WHOP_CLIENT_ID'],
  mewe: ['MEWE_HOST', 'MEWE_APP_ID', 'MEWE_API_KEY'],
  tumblr: ['TUMBLR_CLIENT_ID', 'TUMBLR_CLIENT_SECRET'],
  // Optional browser-cookie compatibility adapter. It is unavailable unless
  // this deployment ships its own reviewed Publishly extension and store page.
  skool: ['EXTENSION_ID', 'NEXT_PUBLIC_CHROME_EXTENSION_URL'],
  testprovider: [],
};

export function missingProviderEnv(identifier: string): string[] {
  const required = providerEnvRegistry[identifier];
  if (!required) {
    return [];
  }
  return required.filter((name) => !process.env[name]);
}

export function isProviderConfigured(identifier: string): boolean {
  return missingProviderEnv(identifier).length === 0;
}
