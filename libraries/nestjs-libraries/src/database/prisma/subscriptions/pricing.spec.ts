describe('pricing overrides (PRICING_OVERRIDES_JSON)', () => {
  const load = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./pricing');
  };

  afterEach(() => {
    delete process.env.PRICING_OVERRIDES_JSON;
    jest.resetModules();
  });

  it('returns defaults without the env var', () => {
    const { pricing } = load();
    expect(pricing.PRO.channel).toBe(30);
    expect(Object.keys(pricing)).toEqual([
      'FREE',
      'STANDARD',
      'TEAM',
      'PRO',
      'ULTIMATE',
    ]);
  });

  it('deep-merges partial overrides', () => {
    process.env.PRICING_OVERRIDES_JSON = JSON.stringify({
      PRO: { channel: 50, month_price: 59 },
    });
    const { pricing } = load();
    expect(pricing.PRO.channel).toBe(50);
    expect(pricing.PRO.month_price).toBe(59);
    expect(pricing.PRO.webhooks).toBe(30);
    expect(pricing.STANDARD.channel).toBe(5);
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
