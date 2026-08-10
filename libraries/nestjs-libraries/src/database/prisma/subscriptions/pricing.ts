export interface PricingInnerInterface {
  current: string;
  display_name: string;
  month_price: number;
  year_price: number;
  channel?: number;
  posts_per_month: number;
  team_members: boolean;
  community_features: boolean;
  featured_by_gitroom: boolean;
  ai: boolean;
  import_from_channels: boolean;
  image_generator?: boolean;
  image_generation_count: number;
  generate_videos: number;
  public_api: boolean;
  webhooks: number;
  autoPost: boolean;
  workspaces: number;
  seats: number;
  storage_gb: number;
  analytics_retention_days: number;
  bulk_tools: boolean;
}
export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}
const defaultPricing: PricingInterface = {
  FREE: {
    current: 'FREE',
    display_name: 'Free',
    month_price: 0,
    year_price: 0,
    channel: 0,
    image_generation_count: 0,
    posts_per_month: 0,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: false,
    import_from_channels: false,
    image_generator: false,
    public_api: false,
    webhooks: 0,
    autoPost: false,
    generate_videos: 0,
    workspaces: 1,
    seats: 1,
    storage_gb: 0.25,
    analytics_retention_days: 7,
    bulk_tools: false,
  },
  STANDARD: {
    current: 'STANDARD',
    display_name: 'Starter',
    month_price: 20,
    year_price: 200,
    channel: 10,
    posts_per_month: 1000000,
    image_generation_count: 20,
    team_members: false,
    ai: true,
    community_features: false,
    featured_by_gitroom: false,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
    webhooks: 2,
    autoPost: false,
    generate_videos: 3,
    workspaces: 1,
    seats: 1,
    storage_gb: 10,
    analytics_retention_days: 90,
    bulk_tools: false,
  },
  TEAM: {
    current: 'TEAM',
    display_name: 'Pro',
    month_price: 45,
    year_price: 450,
    channel: 25,
    posts_per_month: 1000000,
    image_generation_count: 100,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10,
    autoPost: true,
    generate_videos: 10,
    workspaces: 2,
    seats: 5,
    storage_gb: 50,
    analytics_retention_days: 365,
    bulk_tools: true,
  },
  PRO: {
    current: 'PRO',
    display_name: 'Agency',
    month_price: 100,
    year_price: 1000,
    channel: 60,
    posts_per_month: 1000000,
    image_generation_count: 300,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 30,
    autoPost: true,
    generate_videos: 30,
    workspaces: 10,
    seats: 20,
    storage_gb: 250,
    analytics_retention_days: 730,
    bulk_tools: true,
  },
  ULTIMATE: {
    current: 'ULTIMATE',
    display_name: 'Business',
    month_price: 209,
    year_price: 2090,
    channel: 145,
    posts_per_month: 1000000,
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10000,
    autoPost: true,
    generate_videos: 60,
    workspaces: 50,
    seats: 100,
    storage_gb: 1000,
    analytics_retention_days: 1825,
    bulk_tools: true,
  },
};

// Entitlements are deploy-time configuration: PRICING_OVERRIDES_JSON may hold
// partial per-tier overrides ({"PRO": {"channel": 50}}) that deep-merge over
// the defaults above. Server-side only (the client bundle sees defaults; the
// UI displays server-resolved billing state anyway). Prices must still match
// the Stripe Price lookup_keys the operator configures - this governs
// entitlement limits and displayed amounts, never what Stripe actually
// charges (the server resolves real prices from Stripe by lookup key; client
// input is never trusted for pricing).
function loadPricing(): PricingInterface {
  const overrideJson =
    typeof process !== 'undefined'
      ? process.env?.PRICING_OVERRIDES_JSON
      : undefined;
  if (!overrideJson) {
    return defaultPricing;
  }

  let parsed: Record<string, Partial<PricingInnerInterface>>;
  try {
    parsed = JSON.parse(overrideJson);
  } catch (err: any) {
    throw new Error(
      `PRICING_OVERRIDES_JSON could not be parsed: ${err?.message}`
    );
  }

  const merged: PricingInterface = { ...defaultPricing };
  for (const [tier, overrides] of Object.entries(parsed)) {
    if (!merged[tier]) {
      throw new Error(
        `PRICING_OVERRIDES_JSON: unknown tier "${tier}" (valid: ${Object.keys(
          defaultPricing
        ).join(', ')})`
      );
    }
    for (const [key, value] of Object.entries(overrides)) {
      const current = (merged[tier] as any)[key];
      if (current === undefined) {
        throw new Error(
          `PRICING_OVERRIDES_JSON: unknown entitlement "${key}" on tier "${tier}"`
        );
      }
      if (typeof value !== typeof current) {
        throw new Error(
          `PRICING_OVERRIDES_JSON: "${tier}.${key}" must be a ${typeof current}`
        );
      }
    }
    merged[tier] = { ...merged[tier], ...overrides, current: tier };
  }
  return merged;
}

export const pricing: PricingInterface = loadPricing();
