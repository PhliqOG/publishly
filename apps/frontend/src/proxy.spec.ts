import { readFileSync } from 'fs';
import { join } from 'path';

// Regression guard for the failure this test was written after: every new
// marketing route (comparison pages, solutions, resources, docs, platforms)
// was 307-redirecting anonymous visitors — including answer-engine crawlers —
// to /auth, because proxy.ts kept an exact-match allowlist that nobody
// remembered to extend. A published page nobody logged-out can read is worse
// than no page at all, so the allowlist is asserted against the sitemap.

const proxySource = readFileSync(join(__dirname, 'proxy.ts'), 'utf8');
const sitemapSource = readFileSync(join(__dirname, 'app', 'sitemap.ts'), 'utf8');

function allowlist(name: string): string[] {
  const block = proxySource.match(
    new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`)
  );
  if (!block) throw new Error(`${name} not found in proxy.ts`);
  return Array.from(block[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

const paths = allowlist('marketingPaths');
const prefixes = allowlist('marketingPrefixes');
const exceptions = allowlist('appRouteExceptions');

const underPrefix = (path: string, prefix: string) =>
  path === prefix ||
  path.startsWith(prefix.endsWith('-') ? prefix : `${prefix}/`);

const isPublic = (route: string) =>
  !exceptions.some((p) => underPrefix(route, p)) &&
  (paths.includes(route) || prefixes.some((p) => underPrefix(route, p)));

// Static route literals declared in sitemap.ts (dynamic leaves are covered by
// their parent prefix, e.g. /docs/errors/<code> by '/docs').
const sitemapRoutes = Array.from(
  sitemapSource.matchAll(/'(\/[a-z0-9\-/[\]]*)'/g)
)
  .map((m) => m[1])
  .filter((route) => !route.includes('['));

describe('marketing routes are publicly reachable', () => {
  it('finds routes to check', () => {
    expect(sitemapRoutes.length).toBeGreaterThan(20);
  });

  it('every sitemap route passes the proxy allowlist', () => {
    const blocked = sitemapRoutes.filter((route) => !isPublic(route));
    expect(blocked).toEqual([]);
  });

  it('keeps the authenticated connect flow private', () => {
    expect(isPublic('/integrations/social/instagram')).toBe(false);
    expect(isPublic('/settings')).toBe(false);
    expect(isPublic('/launches')).toBe(false);
  });

  it('keeps crawler entry points public', () => {
    expect(isPublic('/robots.txt')).toBe(true);
    expect(isPublic('/sitemap.xml')).toBe(true);
    expect(isPublic('/')).toBe(true);
  });
});
