// Stale-claim queue (GEO item 16/25): flags published third-party claims whose
// verification date exceeds the stale window, so comparison pages never carry
// silently-outdated competitor numbers. Run: node scripts/check-claim-freshness.mjs
// Exit 1 when anything is stale (CI-friendly). Never rewrites dates itself.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const provenance = JSON.parse(
  readFileSync(join(root, 'data', 'claim-provenance.json'), 'utf8')
);
const facts = JSON.parse(
  readFileSync(join(root, 'data', 'public-product-facts.json'), 'utf8')
);

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const windows = provenance._meta.stale_after_days;

const stale = [];

for (const claim of provenance.claims) {
  const days =
    claim.id.startsWith('meta-') || claim.id.includes('platform')
      ? windows.platform_facts
      : windows.competitor_pricing;
  const age = Math.floor((now - Date.parse(claim.verified_at)) / DAY);
  if (age > days) {
    stale.push(
      `${claim.id}: verified ${claim.verified_at} (${age}d old, window ${days}d) — re-verify at ${claim.source_url} before the affected pages rebuild: ${claim.pages.join(', ')}`
    );
  }
}

const factAge = Math.floor((now - Date.parse(facts._meta.updated)) / DAY);
if (factAge > windows.platform_facts) {
  stale.push(
    `public-product-facts.json itself is ${factAge}d old — re-verify the registry against the codebase.`
  );
}

if (stale.length) {
  console.error(`STALE CLAIMS (${stale.length}):\n` + stale.join('\n'));
  process.exit(1);
}
console.log(
  `All ${provenance.claims.length} tracked claims within freshness windows.`
);
