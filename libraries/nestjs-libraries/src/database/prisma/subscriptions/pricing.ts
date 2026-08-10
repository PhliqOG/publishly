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

export const PAID_BILLING_TIERS = [
  'STANDARD',
  'TEAM',
  'PRO',
  'ULTIMATE',
] as const;
export type PaidBillingTier = (typeof PAID_BILLING_TIERS)[number];
export type BillingTier = 'FREE' | PaidBillingTier;

export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}
// Tier model (operator decision 2026-08-10): plans are sized by monthly post
// volume, connected accounts are UNLIMITED on every paid tier. UNLIMITED_CHANNELS
// is a sentinel (never rendered as a number — UIs display "Unlimited"). ULTIMATE
// doubles as the self-hosted/no-Stripe full-access tier and is not shown on the
// marketing site; its price is a placeholder pending the operator's Stripe setup.
export const UNLIMITED_CHANNELS = 10000;

const defaultPricing: PricingInterface = {
  FREE: {
    current: 'FREE',
    display_name: 'Free',
    month_price: 0,
    year_price: 0,
    channel: 5,
    image_generation_count: 0,
    posts_per_month: 50,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: false,
    import_from_channels: false,
    image_generator: false,
    public_api: true,
    webhooks: 1,
    autoPost: false,
    generate_videos: 0,
    workspaces: 1,
    seats: 1,
    storage_gb: 1,
    analytics_retention_days: 30,
    bulk_tools: false,
  },
  STANDARD: {
    current: 'STANDARD',
    display_name: 'Starter',
    month_price: 29,
    year_price: 290,
    channel: UNLIMITED_CHANNELS,
    posts_per_month: 2000,
    image_generation_count: 50,
    team_members: false,
    ai: true,
    community_features: false,
    featured_by_gitroom: false,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
    webhooks: 5,
    autoPost: false,
    generate_videos: 5,
    workspaces: 1,
    seats: 1,
    storage_gb: 25,
    analytics_retention_days: 90,
    bulk_tools: true,
  },
  TEAM: {
    current: 'TEAM',
    display_name: 'Growth',
    month_price: 99,
    year_price: 990,
    channel: UNLIMITED_CHANNELS,
    posts_per_month: 15000,
    image_generation_count: 200,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 25,
    autoPost: true,
    generate_videos: 20,
    workspaces: 5,
    seats: 10,
    storage_gb: 100,
    analytics_retention_days: 365,
    bulk_tools: true,
  },
  PRO: {
    current: 'PRO',
    display_name: 'Scale',
    month_price: 299,
    year_price: 2990,
    channel: UNLIMITED_CHANNELS,
    posts_per_month: 100000,
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 100,
    autoPost: true,
    generate_videos: 60,
    workspaces: 25,
    seats: 50,
    storage_gb: 500,
    analytics_retention_days: 730,
    bulk_tools: true,
  },
  ULTIMATE: {
    current: 'ULTIMATE',
    display_name: 'Enterprise',
    month_price: 599,
    year_price: 5990,
    channel: UNLIMITED_CHANNELS,
    posts_per_month: 1000000,
    image_generation_count: 1000,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10000,
    autoPost: true,
    generate_videos: 120,
    workspaces: 100,
    seats: 250,
    storage_gb: 2000,
    analytics_retention_days: 1825,
    bulk_tools: true,
  },
};

// Plans are deploy-time configuration: PRICING_OVERRIDES_JSON may hold partial
// per-tier overrides ({"PRO": {"channel": 50}}) that deep-merge over the
// defaults above. The authenticated plan endpoint returns this server-resolved
// catalog so the UI and checkout remain aligned. Stripe Products and Prices are
// resolved or created by the server from this catalog; client input is never
// trusted for either price or entitlements.
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
