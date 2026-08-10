# Pilot plan — Publishly remake v3 "Night Rail" (navy-first, dense, big motion)

Gate answers binding: all-four diagnosis (nothing survives by default; density is a
requirement) · big polished motion · navy-first dark · pilot-first.
Reference: live vercel.com structure (fetched 2026-08-09): layered hero + glow,
dense card showcases, tabs, mono CLI blocks, light/dark banding, taxonomy footer.
Baseline recorded: production build green (BUILD_ID WXdrzi5O1uaoDz1YT133T).

## Token system (marketing.css v3)
- Canvas: navy #133458. Elevation = cream-alpha overlays (4%/8% surfaces),
  cream-14% hairlines, cream-34% strong borders. Text: cream #FAF7BB / 64% / 40%.
- Amber #D99B21: CTAs (amber fill + navy label, 5.2:1), links, highlights, hero
  glow (radial amber/olive, subtle). Olive #838921: tags/chips, success, secondary
  diagram strokes, hover borders. Cream bands: inverted sections (navy text).
- Exempt: --net-* platform colors. Error red derived only if a form needs it.
- Type: Geist Sans + Geist Mono (next/font/google; fallback stack if fetch fails).
- Radii 6-8px concentric; layered 2-part shadows; theme-color #133458;
  color-scheme dark; tabular-nums; curly quotes; skip-link.
- mk-* class API names preserved (all 16 pages inherit base skin immediately;
  un-piloted pages look correct-but-plain until rollout).

## Motion system (guidelines-clean, big)
Load: hero deck staggered entrance (once, <900ms, transform/opacity).
Scroll: IO-triggered reveals (MotionRuntime kept) — slide/scale/fade with stagger.
Hover: card lift + amber edge glow; buttons brighten (contrast increases).
Interactive: tabs with animated indicator; typing terminal (API block); marquee
re-gated (runs only in-viewport via IO, pauses on hover, off under reduced-motion).
All: explicit transition properties, interruptible, prefers-reduced-motion variants.

## Home composition (dense — 10 sections)
1 Nav (navy glass, product links, amber CTA)
2 Hero: layered headline ("Every post ships on time." + sub-statements), dual CTA,
  amber glow, and the COMMAND DECK — calendar board + composer + pipeline layered
  in a staggered 3D stack, chips animating status (big motion, entrance + hover)
3 CLI strip: typing terminal of the real public API (curl POST /public/v1/posts)
4 Bento grid: 6 dense tiles (mini-replicas, real entitlement numbers, capability
  chips) — Vercel "recently shipped" energy, zero fabricated claims
5 Pillar deep-dives with TABS: Compose / Schedule / Deliver (tab-switched replicas)
6 CREAM BAND: reliability architecture (pipeline diagram re-cut navy-on-cream)
7 Measure + Reply split (analytics + inbox replicas, navy idiom)
8 Networks: 10 official-API grid with brand dots
9 Pricing timetable teaser (real config)
10 Final CTA + taxonomy footer (multi-column: Product/Platform/Company/Legal)

## Interior pilot page: /publishing
Styled via product-page.tsx template → proves the language for 6 routes at once.

## Files (pilot)
REWRITE: marketing.css · home page.tsx · chrome.tsx (nav + taxonomy footer) ·
hero-deck.tsx (new; keeps CHIPS data; hero-cinema.tsx retired) · 4 replica CSS
(navy re-cut). EDIT: layout.tsx (Geist, theme-color, color-scheme, skip-link) ·
motion.tsx (keep MotionRuntime; drop ScrollScene; add Tabs + Typing helpers,
client-only where interaction demands) · product-page.tsx (+ /publishing data) ·
replica TSX touch-ups. NEW: terminal.tsx (typing block). UNTOUCHED this phase:
other 14 pages' markup, proxy.ts (routes unchanged), legal substance, pricing
wiring, brand assets (favicon/manifest/OG = follow-up decision).

## Verification
Production build green · cookie-less smoke of all 17 URLs · served-HTML probes for
new sections · guidelines spot-checklist (focus-visible, reduced-motion, no
transition:all, theme-color, skip-link, tabular-nums) · OPERATOR REVIEW on :4200 =
the success criterion. Then rollout plan for remaining 14 pages.

## Risks
Geist fetch at build (fallback: keep current font vars, swap later) · marquee/tabs
client code stays tiny (perf budget) · concurrent session file collisions —
re-check git status before writes; stage narrowly at commit.
