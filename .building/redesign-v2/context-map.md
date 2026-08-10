# Context map — marketing remake v2 (condensed from context-analyst, 2026-08-09)

## Inventory
- 16 page.tsx under (marketing) → 17 URLs (/analytics rewrites to /product/analytics
  in proxy.ts:56-60; nav deliberately links /analytics — do NOT "fix").
- components/marketing: chrome (nav/marquee/footer), marketing.config (ALL strings +
  no-fabricated-claims header), motion (only 'use client' file: ScrollScene + MotionRuntime),
  hero-cinema (CHIPS data + CalendarBoard — board also used by /calendar page + home §02),
  pricing-cards (reads billing-truth pricing.ts — restyle markup ONLY), product-page.tsx
  (shared template for 6 newest routes), logo.tsx (mark, hardcoded #4F46E5 dot), replicas/
  (4×tsx + 4×css, mkr-* prefixes, .mk-frame seam).
- mk-* public class API consumed by subpages (preserve names or migrate all 26 files):
  body container section section-lede h1 h2 eyebrow mono num num-label cards card card-num
  band prose draft btn(-primary/-ghost) on-ink frame reveal/is-in feature-points
  feature-stage feature-head pricing-grid/plan* networks/network-chip footer* nav* live
  hidden scene-static.

## Coupling landmines
1. proxy.ts:108-125 — hardcoded 16-entry marketingPaths allowlist. Route rename/add
   without mirroring = silent /auth redirect in prod only.
2. /analytics→/product/analytics rewrite; signed-in / redirects to /analytics.
3. pricing.ts = billing truth; PricingCards can never hardcode prices.
4. public/publishly.svg + site.webmanifest + app icons referenced by (app)/(provider)/
   (extension) layouts too — mark recolor changes the signed-in app favicon (OPERATOR GATE).
5. docs/BRAND.md codifies the OLD palette/fonts — must be rewritten or it contradicts.
6. mk-plan-highlight::before hardcodes 'Most teams' as CSS content (copy-audit blind spot).

## Live defect found
about/contact/acceptable-use render <main class="mk-prose"> with NO mk-container/mk-section
→ flush against viewport left edge, zero top padding. Remake fixes, not reproduces.

## Second-order
- Killing scroll hero → ScrollScene (49/90 lines of motion.tsx) + ~120 lines mk-cin-*/chip
  CSS dead; MotionRuntime (reveals) is design-agnostic and survives; CalendarBoard must
  become unconditionally static (drop --p:1 wrapper hack).
- MARKETING.tagline/sub feed <title>/OG — copy voice pass is SEO-visible.
- 6 routes restyle free via product-page.tsx; 10 hand-built pages need individual work.

## Blast radius
REWRITE (~1,875 lines): marketing.css 948, 4 replica css 797, hero-cinema 130 (keep CHIPS).
EDIT (~1,600 lines / 26 files): 16 pages, chrome, product-page, pricing-cards (markup),
motion (drop ScrollScene), layout (fonts/theme-color/color-scheme/skip-link), logo (hex),
4 replica tsx, marketing.config (voice only), docs/BRAND.md.
LEAVE: proxy.ts (unless routes change), pricing.ts, app scss/tailwind, other layouts,
next.config (CSP fine for Geist), legal PROSE byte-identical.
GATE: shared favicon/manifest/app-icon assets.

## Constraints that survive every redesign
AGPL /source page + footer link (legally load-bearing); no-fabricated-claims;
next/font/google; own root layout (<html lang>); mk-*/mkr-* scoping; server components
except motion; contact's mk-draft fallback when NEXT_PUBLIC_SUPPORT_EMAIL unset;
NEXT_PUBLIC_BRAND_NAME overridability. Geist Sans/Geist Mono are on Google Fonts —
drop-in swap at layout.tsx:12-26. Marketing pages all static-prerendered.

## History note
This is design #3 in 48h (departures-board → Swiss/cinema → Vercel-grade). The two seams
that survived both rewrites: marketing.config.ts and the mk-* scoping contract.
