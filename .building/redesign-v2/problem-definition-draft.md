# Problem definition (DRAFT) — Publishly marketing remake v2

Status: draft for adversarial review, then operator gate. 2026-08-09.

## The problem
The operator rejected the current marketing design (Swiss Studio × scroll-cinema,
commit 89a5fe29): "i dont like it." Directive: full remake taking "all aspects of
design" from Vercel (vercel.com/design), governed by Vercel's Web Interface
Guidelines (operator-pasted; canonical copy: vercel-guidelines.md), using exactly
this palette:

| Hex | Name | Measured luminance | Role (proposed) |
|---|---|---|---|
| #133458 | Deep navy | 0.033 | Ink (text) on cream; canvas of dark sections |
| #FAF7BB | Butter cream | 0.904 | Page canvas; text on navy |
| #D99B21 | Amber | 0.383 | THE accent: CTAs, interactive highlights |
| #838921 | Olive | 0.225 | Secondary: borders, chips, success, muted labels |

Contrast math (WCAG ratios; APCA to be spot-checked in build):
navy/cream 11.5:1 (body text ✓) · amber/cream 2.2:1 (NEVER text on cream —
decorative only) · olive/cream 3.5:1 (large text only) · amber/navy 5.2:1 (text ✓)
· navy-on-amber 5.2:1 (CTA label ✓) · olive/navy 3.3:1 (large only).
Derived tokens allowed: alpha tints of navy for hairlines/borders on cream
(hue-consistent per guidelines), alpha tints of cream on navy. No new hues.

## What "Vercel design" means concretely (the reference decomposed)
Visual language: 1px-bordered sections forming a continuous grid (the signature
crosshair "+" at grid intersections), flat bordered cards, generous whitespace,
6-8px concentric radii, Geist Sans + Geist Mono (both on Google Fonts — swap from
Bricolage/Public Sans/IBM Plex), small mono uppercase section labels, restrained
single-accent color use, alternating light/dark sections, engineering diagrams and
terminal/code blocks as illustration, layered subtle shadows only where elevation
is real.
Quality bar (the pasted guidelines — enforceable checklist): :focus-visible rings
everywhere; keyboard operability; hit targets ≥24px; reduced-motion variants;
compositor-only animation (transform/opacity), no transition:all, input-driven,
no autoplay; links are <a>; tabular-nums; curly quotes; ellipsis character;
scroll-margin-top anchors; skip-to-content link; theme-color meta matching canvas;
image dimensions (no CLS); font preloading/subsetting.
Copy voice: sentence-case marketing headings, active voice, second person,
"&" over "and", numerals for counts, positive framing, unambiguous labels.

## Scope
IN: all 17 (marketing) routes + chrome (nav/footer) + all replicas + hero +
marketing.css token system + copy pass to the Vercel voice + logo recolor.
KEEP (design-agnostic): route structure, proxy carve-outs, metadata/OG pattern,
marketing.config honesty constraints (no fabricated claims), PricingCards
live-pricing wiring, mk-* class scoping, AGPL /source offer, legal copy VERBATIM
(counsel-frozen), server-component discipline (client JS only where interaction
demands it).
KILL: 320vh scroll-scrubbed hero (replaced by a Vercel-style static-confident hero;
"insane" now means craft, not spectacle), Swiss hairline-everything language,
current display font stack.
OUT (unless operator says otherwise): app-shell palette re-theming beyond the
logo recolor; app product UI redesign.

## Open decisions for the operator gate
1. Canvas polarity: (a) cream-canvas light site with navy dark sections
   [recommended — matches vercel.com's white-first with black bands, best
   text contrast budget], or (b) navy-canvas dark-first site.
2. Logo: keep the P-calendar-cell mark with dot recolored #4F46E5→#D99B21
   [recommended — mark is 1 day old and geometry is sound], or design a new mark.
3. App shell: thread the new palette into the product UI now, or marketing-only.

## Success criteria
- Production build green; all 17 routes 200; visual language unmistakably
  Vercel-grade; palette exactly the 4 hex + documented derived tints.
- Guidelines-compliance checklist audit passes (tracked per-item at build time).
- No honesty regressions; AGPL link intact; legal pages byte-identical copy.

## Risks / unknowns
- Amber is weak on cream (2.2:1): the accent must lean on navy surfaces or
  amber-filled elements with navy labels; a naive "amber text on cream" reading
  of the palette would fail accessibility.
- Geist via next/font/google requires build-time network (present on this box).
- A parallel session is actively editing this repo (incl. marketing routes);
  remake must re-sync file inventory at implementation start and commit scope
  narrowly.
- Butter-cream full-page canvas is unusual; needs a disciplined neutral ramp
  (cream→white-lifted surfaces) to avoid a "yellow page" feel while keeping the
  palette contract.
