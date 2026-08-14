describe('pricing overrides (PRICING_OVERRIDES_JSON)', () => {
  const load = () => {
    jest.resetModules();
    // A fresh CommonJS load is intentional: each assertion exercises module
    // initialization against a different environment override.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./pricing');
  };

  afterEach(() => {
    delete process.env.PRICING_OVERRIDES_JSON;
    jest.resetModules();
  });

  it('returns defaults without the env var', () => {
    const { PAID_BILLING_TIERS, pricing, publicPricing, UNLIMITED_CHANNELS } =
      load();
    expect(pricing.PRO.channel).toBe(UNLIMITED_CHANNELS);
    expect(pricing.PRO.display_name).toBe('Scale');
    expect(pricing.PRO.storage_gb).toBe(500);
    expect(pricing.FREE.posts_per_month).toBe(50);
    expect(pricing.FREE.channel).toBe(5);
    expect(Object.keys(pricing)).toEqual([
      'FREE',
      'STANDARD',
      'TEAM',
      'PRO',
      'ULTIMATE',
    ]);
    expect(PAID_BILLING_TIERS).toEqual(['STANDARD', 'TEAM', 'PRO']);
    expect(Object.keys(publicPricing)).toEqual([
      'FREE',
      'STANDARD',
      'TEAM',
      'PRO',
    ]);
    expect(UNLIMITED_CHANNELS).toBe(2_147_483_647);
    expect(pricing.ULTIMATE).toMatchObject({
      display_name: 'Scale',
      month_price: 299,
      posts_per_month: 100_000,
      channel: UNLIMITED_CHANNELS,
    });
  });

  it('deep-merges ancillary capability overrides', () => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({
      PRO: { storage_gb: 750, webhooks: 250 },
    });
    const { pricing } = load();
    expect(pricing.PRO.storage_gb).toBe(750);
    expect(pricing.PRO.webhooks).toBe(250);
    expect(pricing.PRO.month_price).toBe(299);
    expect(pricing.STANDARD.channel).toBe(2_147_483_647);
  });

  it.each([
    ['channel', 50],
    ['month_price', 59],
    ['posts_per_month', 10],
    ['priority_retries', false],
  ])('rejects an override of locked invariant %s', (field, value) => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({
      PRO: { [field]: value },
    });
    expect(load).toThrow(/locked billing invariant/);
  });

  it('rejects unknown tiers', () => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({ GOLD: {} });
    expect(load).toThrow(/unknown tier "GOLD"/);
  });

  it('rejects unknown entitlement keys', () => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({
      PRO: { nonsense: 1 },
    });
    expect(load).toThrow(/unknown entitlement "nonsense"/);
  });

  it('rejects type mismatches', () => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({
      PRO: { storage_gb: 'many' },
    });
    expect(load).toThrow(/must be a number/);
  });

  it('rejects invalid JSON', () => {
    process.env.PRICING_OVERRIDES_JSON = '{not json';
    expect(load).toThrow(/could not be parsed/);
  });

  it('resolves historical ULTIMATE records to Scale entitlements', () => {
    const { pricingForTier, resolveBillingTier } = load();
    expect(resolveBillingTier('ULTIMATE')).toBe('PRO');
    expect(pricingForTier('ULTIMATE')).toBe(pricingForTier('PRO'));
    expect(() => resolveBillingTier('ENTERPRISE')).toThrow(
      /unknown billing tier/i
    );
  });
});
