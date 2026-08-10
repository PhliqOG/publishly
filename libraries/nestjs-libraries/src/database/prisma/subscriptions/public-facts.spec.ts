import { readFileSync } from 'fs';
import { join } from 'path';
import { pricing, UNLIMITED_CHANNELS } from './pricing';

// Guards the canonical public fact registry (data/public-product-facts.json)
// against drift: marketing pages consume the registry, billing enforces
// pricing.ts — this spec is the bridge that keeps one truth.

const ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

const facts = JSON.parse(
  readFileSync(join(ROOT, 'data', 'public-product-facts.json'), 'utf8')
);

const marketingConfig = readFileSync(
  join(
    ROOT,
    'apps',
    'frontend',
    'src',
    'components',
    'marketing',
    'marketing.config.ts'
  ),
  'utf8'
);

describe('public product facts registry', () => {
  it('tier prices and quotas match pricing.ts exactly', () => {
    for (const tier of facts.pricing.tiers) {
      const plan = pricing[tier.key];
      expect(plan).toBeDefined();
      expect(plan.display_name).toBe(tier.name);
      expect(plan.month_price).toBe(tier.month_price);
      expect(plan.posts_per_month).toBe(tier.posts_per_month);
      if (tier.accounts === 'unlimited') {
        expect(plan.channel).toBe(UNLIMITED_CHANNELS);
      } else {
        expect(plan.channel).toBe(tier.accounts);
      }
      expect(plan.public_api).toBe(tier.api_access);
    }
  });

  it('yearly pricing follows the published multiplier', () => {
    for (const tier of facts.pricing.tiers) {
      const plan = pricing[tier.key];
      expect(plan.year_price).toBe(
        plan.month_price * facts.pricing.yearly_multiplier
      );
    }
  });

  it('the marketing config carries the canonical entity sentence verbatim', () => {
    expect(marketingConfig).toContain(facts.entity.canonical_definition);
  });

  it('marketing copy never uses banned compliance framings', () => {
    const banned = new RegExp(facts.compliance_language.banned_regex, 'i');
    // Strip comments — the compliance rule itself names the banned words.
    const copyOnly = marketingConfig.replace(/^\s*\/\/.*$/gm, '');
    expect(banned.test(copyOnly)).toBe(false);
  });

  it('analytics network list never claims the known-absent providers', () => {
    for (const absent of ['Bluesky', 'Mastodon']) {
      expect(facts.networks.analytics).not.toContain(absent);
      expect(facts.networks.posting).toContain(absent);
    }
  });
});
