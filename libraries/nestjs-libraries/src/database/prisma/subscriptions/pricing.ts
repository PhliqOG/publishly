export interface PricingInnerInterface {
  current: string;
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
}
export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}
const defaultPricing: PricingInterface = {
  FREE: {
    current: 'FREE',
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
  },
  STANDARD: {
    current: 'STANDARD',
    month_price: 29,
    year_price: 278,
    channel: 5,
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
  },
  TEAM: {
    current: 'TEAM',
    month_price: 39,
    year_price: 374,
    channel: 10,
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
  },
  PRO: {
    current: 'PRO',
    month_price: 49,
    year_price: 470,
    channel: 30,
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
  },
  ULTIMATE: {
    current: 'ULTIMATE',
    month_price: 99,
    year_price: 950,
    channel: 100,
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
