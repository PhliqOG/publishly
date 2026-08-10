# Assumptions audit (assumptions-auditor agent, 2026-08-09) — condensed, repo-verified

## High-risk
1. Assumes "i dont like it" rejected the DESIGN LANGUAGE. No diagnosis performed;
   if the defect was palette-feel/emptiness/voice/a render bug, the remake inherits it.
2. Assumes "insane animations and zoom" was withdrawn. The draft kills the zoom hero
   on its own authority. VERIFIED: the existing hero is guidelines-compliant
   (input-driven scrub, transform/opacity, reduced-motion branch motion.tsx:18-20).
   Taste call presented as compliance call.
3. Assumes it knows Vercel's visuals. vercel-guidelines.md contains ZERO visual spec —
   crosshair grid/Geist/dark bands/radii are all from the agent's training memory,
   possibly stale. Verify against the live site or an operator screenshot.
4. Assumes palette outranks Vercel's near-neutral strategy where they conflict, and
   that all 4 hexes are equal-priority page colors (vs brand/accent set). Roles were
   authored by the agent, not the operator.
5. Assumes cream canvas / navy ink. Entire contrast budget + "amber decorative only"
   collapse if the operator meant navy-first (which a #133458-led palette often signals).
6. Assumes marketing-only is clean despite "full remake". VERIFIED brand bleed:
   public/publishly.svg = favicon for (app)/(provider)/(extension) layouts;
   site.webmanifest theme_color=#4F46E5 (contradicts guidelines' theme-color rule);
   logo-text.component.tsx:28 + new-layout/logo.tsx:27 carry the indigo dot;
   OG images publishly-social.svg/.png + app icons — NO generation script exists
   (scripts/ has only fetch-gtm.mjs) → manual re-authoring, in no scope bucket.
   docs/BRAND.md declares the OLD system of record. proxy.ts:126-130: signed-in
   users see marketing pages (both palettes visible in one session).
7. Assumes success is verifiable without operator eyes. Previous design passed every
   objective criterion and was rejected in four words.
8. Assumes marketing copy is the agent's to rewrite. marketing.config.ts carries
   FACTUAL product claims under a no-fabrication header — voice pass risks honesty
   regressions.
9. Asserts legal copy is "counsel-frozen" — VERIFIED FALSE. terms/page.tsx:27-31
   renders "Draft template — the operator must have counsel review…". Typographic
   normalization (curly quotes/ellipsis) is permissible; substance stays. The
   .mk-draft class carries disclaimers across 8 files / 17 occurrences — if dropped
   in the CSS rewrite, legal disclaimers lose treatment silently.

## Medium-risk
10. 16 page.tsx files, 17 URLs; /analytics only serves marketing when LOGGED OUT
    (proxy.ts:56-60) — cookied smoke tests false-pass. Test cookie-less.
11. "No new hues" vs 10 platform brand colors (--net-*, 7 files) — those are data +
    trademark identity, not decoration. Success criterion must exempt them.
12. Chart/color-blind rules vs a palette with effectively one text-safe accent.
13. Hero isn't the only autoplay: mk-marquee-scroll 36s infinite (css:499) and
    mk-mark-pop on load (css:455) violate "input-driven, no autoplay" too.
14. Geist is inferred, not requested; overriding docs/BRAND.md type system unasked.
15. PricingCards is a build-time static import, not live wiring; real risk is the
    currency/tabular-nums rules against `${plan.month_price} /month`.
16. Replicas kept-as-content is assumed; Vercel's idiom is diagrams/terminal blocks,
    not app screenshots. Unasked.
17. Reference target ambiguity: homepage vs design-system pages vs guidelines page.
18. IA assumed design-agnostic; Vercel doesn't run 16 marketing routes; the 15-link
    footer is itself a design statement preserved by default.
19. "Build green" needs a recorded baseline (green before = still green after).
20. No urgency/effort envelope established.

## Unverifiable without the operator
Operator's mental image of "Vercel design"; whether vercel.com matches training
memory; whether "all aspects" includes IA; provenance/priority of the 4 hexes;
device/viewport the operator judges on.

## Recommended verifications (the ones that matter)
- One operator message: what disliked / motion still wanted? / 4 colors = whole
  palette or accents? / cream-first or navy-first / one exact reference URL or
  screenshot / same 16 pages or shorter.
- WebFetch vercel.com + vercel.com/design before writing CSS; don't build from memory.
- Pilot gate: home hero + one interior page reviewed by operator BEFORE the other 14.
- rg "4F46E5" → 12 non-doc hits; ask whether favicon/manifest/OG recolor in this pass.
- Run cookie-less route smoke; record baseline build result before starting.
