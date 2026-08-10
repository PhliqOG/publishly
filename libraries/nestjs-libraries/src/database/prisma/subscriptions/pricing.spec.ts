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
    const { PAID_BILLING_TIERS, pricing, UNLIMITED_CHANNELS } = load();
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
    expect(PAID_BILLING_TIERS).toEqual(['STANDARD', 'TEAM', 'PRO', 'ULTIMATE']);
  });

  it('deep-merges partial overrides', () => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({
      PRO: { channel: 50, month_price: 59 },
    });
    const { pricing } = load();
    expect(pricing.PRO.channel).toBe(50);
    expect(pricing.PRO.month_price).toBe(59);
    expect(pricing.PRO.webhooks).toBe(100);
    expect(pricing.STANDARD.channel).toBe(10000);
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
      PRO: { channel: 'many' },
    });
    expect(load).toThrow(/must be a number/);
  });

  it('rejects invalid JSON', () => {
    process.env.PRICING_OVERRIDES_JSON = '{not json';
    expect(load).toThrow(/could not be parsed/);
  });
});
