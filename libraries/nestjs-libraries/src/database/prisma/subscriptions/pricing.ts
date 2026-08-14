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
  full_observability: boolean;
  successful_post_metering: boolean;
  priority_retries: boolean;
  dead_account_detection: boolean;
  sla: boolean;
}

export const PAID_BILLING_TIERS = ['STANDARD', 'TEAM', 'PRO'] as const;
export type PaidBillingTier = (typeof PAID_BILLING_TIERS)[number];
export type BillingTier = 'FREE' | PaidBillingTier;
export type StoredBillingTier = BillingTier | 'ULTIMATE';

export const PUBLIC_BILLING_TIERS = ['FREE', ...PAID_BILLING_TIERS] as const;

export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}
// Plans are sized by confirmed-live monthly post volume. Free has the explicit
// five-account pilot cap; every paid tier is unlimited. ULTIMATE is retained
// only as a historical storage/Stripe alias and resolves to Scale.
export const UNLIMITED_CHANNELS = 2_147_483_647;

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
    full_observability: true,
    successful_post_metering: true,
    priority_retries: false,
    dead_account_detection: true,
    sla: false,
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
    full_observability: true,
    successful_post_metering: true,
    priority_retries: false,
    dead_account_detection: true,
    sla: false,
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
    full_observability: true,
    successful_post_metering: true,
    priority_retries: true,
    dead_account_detection: true,
    sla: true,
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
    full_observability: true,
    successful_post_metering: true,
    priority_retries: true,
    dead_account_detection: true,
    sla: true,
  },
  ULTIMATE: {
    current: 'ULTIMATE',
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
    full_observability: true,
    successful_post_metering: true,
    priority_retries: true,
    dead_account_detection: true,
    sla: true,
  },
};

// Deployments may override ancillary capabilities such as storage, but price,
// plan identity, post allowance, reliability entitlements, and account policy
// are locked below. Client input is never trusted for price or entitlements.
const LOCKED_PLAN_FIELDS = new Set<keyof PricingInnerInterface>([
  'current',
  'display_name',
  'month_price',
  'year_price',
  'channel',
  'posts_per_month',
  'full_observability',
  'successful_post_metering',
  'priority_retries',
  'dead_account_detection',
  'sla',
]);

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
      if (LOCKED_PLAN_FIELDS.has(key as keyof PricingInnerInterface)) {
        throw new Error(
          `PRICING_OVERRIDES_JSON: "${tier}.${key}" is a locked billing invariant`
        );
      }
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

export const publicPricing = Object.fromEntries(
  PUBLIC_BILLING_TIERS.map((tier) => [tier, pricing[tier]])
) as Record<BillingTier, PricingInnerInterface>;

export function resolveBillingTier(tier?: string | null): BillingTier {
  if (!tier) return 'FREE';
  if (tier === 'ULTIMATE') return 'PRO';
  if ((PUBLIC_BILLING_TIERS as readonly string[]).includes(tier)) {
    return tier as BillingTier;
  }
  throw new Error(`Unknown billing tier "${tier}"`);
}

export function pricingForTier(tier?: string | null) {
  return pricing[resolveBillingTier(tier)];
}
