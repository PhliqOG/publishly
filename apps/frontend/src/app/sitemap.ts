import type { MetadataRoute } from 'next';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';
import { POST_FAILURE_CATALOG } from '@gitroom/nestjs-libraries/reliability/post.failure';
import { PLATFORM_SPECS } from '@gitroom/frontend/app/(marketing)/platforms/[network]/page';

// Every marketing route, one place. Add a path here the same PR it ships —
// robots.ts points crawlers at this file, and docs/seo/DEPLOY-CHECKLIST.md
// gates go-live on it being reachable at the real origin.
const LAST_MODIFIED = new Date('2026-08-11');

// Leaf routes are generated from the same source the pages themselves render
// from, so the sitemap structurally cannot drift from what actually exists:
//   - /docs/errors/[code] — one entry per code in POST_FAILURE_CATALOG, the
//     real engine catalog (same import the [code] page & /docs/errors use).
//   - /platforms/[network] — one entry per slug in PLATFORM_SPECS, exported
//     from the platforms/[network] page itself so the two can never diverge.
const ERROR_CODE_ROUTES: Array<[string, number]> = Object.keys(
  POST_FAILURE_CATALOG
).map((code) => [`/docs/errors/${code}`, 0.5]);

const PLATFORM_ROUTES: Array<[string, number]> = Object.keys(
  PLATFORM_SPECS
).map((network) => [`/platforms/${network}`, 0.5]);

// [path, priority] — priority is a same-site relative hint only (never a
// ranking claim). Home highest, comparison/resource content next, utility
// & legal pages lowest.
const ROUTES: Array<[string, number]> = [
  ['/', 1],

  // Product
  ['/features', 0.8],
  ['/calendar', 0.7],
  ['/publishing', 0.7],
  ['/product/analytics', 0.7],
  ['/engagement', 0.7],
  ['/api-docs', 0.7],
  ['/pricing', 0.9],
  ['/reliability', 0.8],
  ['/status', 0.6],

  // Company / legal
  ['/about', 0.5],
  ['/contact', 0.5],
  ['/security', 0.5],
  ['/source', 0.5],
  ['/privacy', 0.3],
  ['/terms', 0.3],
  ['/acceptable-use', 0.3],
  ['/data-deletion', 0.3],
  ['/platform-review', 0.4],

  // Compare
  ['/compare', 0.8],
  ['/compare/ayrshare', 0.8],
  ['/compare/buffer', 0.8],
  ['/compare/metricool', 0.8],
  ['/compare/upload-post', 0.8],
  ['/compare/hootsuite', 0.8],
  ['/compare/bundle-social', 0.8],
  ['/methodology/api-comparisons', 0.6],

  // Solutions
  ['/for-agencies', 0.7],
  ['/for-multi-brand', 0.7],
  ['/for-creator-networks', 0.7],
  ['/for-developers', 0.7],

  // Integrations
  ['/integrations', 0.7],
  ['/integrations/mcp', 0.6],
  ['/integrations/n8n', 0.6],
  ['/integrations/make', 0.6],

  // Resources
  ['/resources', 0.7],
  ['/resources/best-social-posting-apis-2026', 0.8],
  ['/resources/best-ayrshare-alternatives-2026', 0.8],
  ['/resources/best-flat-pricing-posting-apis', 0.8],

  // Misc
  ['/changelog', 0.5],
  ['/docs/errors', 0.6],
  ['/platforms', 0.6],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = MARKETING.siteUrl.replace(/\/$/, '');
  const allRoutes = [...ROUTES, ...ERROR_CODE_ROUTES, ...PLATFORM_ROUTES];
  return allRoutes.map(([path, priority]) => ({
    url: `${siteUrl}${path}`,
    lastModified: LAST_MODIFIED,
    priority,
  }));
}
