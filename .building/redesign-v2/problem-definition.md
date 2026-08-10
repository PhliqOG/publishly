# Problem definition v2 — Publishly marketing remake (post-review)

## OPERATOR GATE ANSWERS (2026-08-09, binding)
1. Diagnosis — ALL FOUR failed: colors & overall feel, too empty/plain, the
   hero/motion, layout & structure. Nothing from the Swiss design is protected;
   "too empty" makes DENSITY a positive requirement of the remake.
2. Motion: BIG polished motion (Vercel-marketing energy; compositor-clean per
   the guidelines).
3. Canvas: NAVY-FIRST DARK (#133458 canvas, cream text, amber CTAs, occasional
   cream bands).
4. Rollout: PILOT FIRST — token system + home + one interior page, operator
   reviews live, then the remaining 14.

Status: definition CONFIRMED via gate; planning in progress. Supersedes problem-definition-draft.md after
adversarial review (definition-critique.md, assumptions-audit.md, context-map.md).

## The problem, honestly stated
The operator rejected the shipped Swiss/scroll-cinema design ("i dont like it")
and directed a remake "like vercel.com/design … take all aspects of design from
them" with palette #133458 / #838921 / #D99B21 / #FAF7BB, and pasted Vercel's
Web Interface Guidelines. WHAT specifically failed was never diagnosed — the
rejection could target palette-feel, emptiness, motion, layout, or the whole
gestalt. The gate below asks. Without the diagnosis, any remake risks preserving
the actual defect.

## Two authorities, kept distinct
1. OPERATOR-PASTED GUIDELINES (vercel-guidelines.md) — an enforceable craft +
   copywriting spec. Applies fully: focus-visible, keyboard, reduced-motion,
   compositor-only animation, no autoplay, links-are-links, tabular-nums, curly
   quotes, theme-color, skip-link, sentence-case marketing headings, active voice.
2. VERCEL'S VISUAL LANGUAGE — NOT specified by the pasted document. To be taken
   from the live site at design time (WebFetch vercel.com + vercel.com/design;
   operator screenshot if offered), not from training memory. Working hypothesis
   (to verify): bordered grid sections, mono labels, generous whitespace,
   light/dark banding, precise diagrams, Geist type.

## Palette (roles are an OPERATOR DECISION — the gate asks)
#133458 navy · #838921 olive · #D99B21 amber · #FAF7BB cream.
Physics that constrain ANY mapping (WCAG now, APCA spot-check at build):
navy↔cream 11.5:1 (the only body-text pair) · amber/cream 2.2:1 (never text on
cream) · amber/navy 5.2:1 (text-safe) · navy-on-amber 5.2:1 (CTA label safe) ·
olive large-text-only on either ground. Derived alpha tints of navy/cream allowed
for borders/surfaces. EXEMPT from the 4-hex contract: the ten --net-* platform
brand colors (data + trademark identity) and a to-be-derived error red if any
form state needs one. Amber CTAs on cream need a border/shadow treatment for the
2.2:1 shape-boundary problem.

## Scope
IN: all 16 (marketing) page files + chrome + replicas + marketing.css token
system + layout (fonts, theme-color, color-scheme, skip-link) + docs/BRAND.md
update + fix the live defect on about/contact/acceptable-use (missing
container/section wrappers).
GATED (operator): motion level; canvas polarity; rollout mode; palette roles.
DEFAULTS unless operator objects: same 16 routes/IA; Geist Sans + Geist Mono;
light-touch copy pass ONLY where the guidelines demand voice fixes (never
altering factual claims — no-fabrication header stays law); legal pages keep
substance verbatim (they are DRAFT TEMPLATES, not counsel-frozen — verified;
typographic normalization like curly quotes is permitted); brand-asset recolor
(favicon, site.webmanifest theme_color #4F46E5, OG images, app logo dots) is a
FOLLOW-UP decision because it changes the signed-in app too; replicas stay as
content but restyled (Vercel-idiom diagrams welcome where stronger).
OUT: app product UI redesign; route/IA restructuring.

## Corrections from review (binding on the plan)
- 16 page files, 17 URLs; /analytics is a logged-out rewrite → smoke tests run
  cookie-less.
- proxy.ts marketingPaths allowlist must be re-verified if any route changes.
- The marquee (36s autoplay) and logo pop (on-load) violate "input-driven, no
  autoplay" — redesign or gate them under interaction/visibility, not just
  reduced-motion.
- mk-draft styling carries legal disclaimers across 8 files — must survive the
  CSS rewrite.
- Record the baseline build result BEFORE starting; "build green" = still green.
- The existing scroll hero is guidelines-COMPLIANT; whether it dies is a taste
  decision the operator makes at the gate, not a compliance necessity.

## Success criteria (falsifiable, early-abort)
1. PILOT GATE (if operator accepts): home + one interior page built first;
   operator looks and says yes/no. A no costs 2 pages, not 16. This is THE
   success criterion; everything else is guardrail.
2. Guardrails: production build still green; 17 URLs 200 cookie-less; guidelines
   checklist audit (tracked per item); no honesty regressions; AGPL /source page
   + footer link intact; legal substance unchanged; mk-*/mkr-* scoping intact;
   platform colors preserved.

## Effort envelope
Pilot ≈ one working session (token system + home + one interior). Rollout to the
remaining 14 pages + docs/BRAND.md ≈ one to two more. Brand-asset recolor pass
(if approved later) ≈ small, but touches the signed-in app.
