# v5 "Clean Sky" — problem definition + plan (operator directive 2026-08-09 ~23:00)

## Directive decoded
- KILL the mesh/lava gradient hero. White base, darker text.
- Clean, professional, minimal, NON-SALESY — Apple-marketing restraint, Metricool-class
  layout (researched live: centered hero → full-width product screenshot → feature
  cards → tabbed deep-dive → platform grid → FAQ → footer).
- CENTER-ORIENTED layout (not the current left-column Stripe hero).
- GSAP for custom animations — operator explicitly authorized install (GSAP is 100%
  free incl. plugins since 2025; pnpm add, no cost).
- NEW LOGO: operator-supplied blue wordmark (cropped → public/publishly-wordmark.png).
- PALETTE: light-blue-led, white base, palette choice delegated ("find a cool palette,
  maybe a light yellow").
- Features must match the REAL program (verified against repo): composer with
  per-network variants + real limits; month/week/day calendar with drag-drop; durable
  Temporal publishing (duplicate-resistant, hourly sweeper); CSV bulk import
  preview→commit; platform-reported analytics snapshots; capability-gated inbox;
  hashed scoped API keys; audit log; teams/workspaces; 10 first-class networks via
  official APIs (+engine targets); AGPL open source. Nothing else claimed.

## Palette v5 (derived from the logo blue)
- Base #FFFFFF · tint band #F6FAFE (blue-tinted) · ink #14233B (deep slate-navy,
  the "darker text") · body rgba(20,35,59,.72/.5)
- Action blue #2563EB (buttons/links, 5.2:1 on white) · bright blue #3B82F6
  (hover/highlights, logo-adjacent) · sky wash #EAF2FE (chips, soft cards)
- Soft yellow #FFD34D (the one warm accent: small marks, highlights — sparing)
- Borders rgba(20,35,59,.1) · shadows soft blue-gray
- Platform --net-* colors stay (data).

## Layout v5 (centered, Metricool structure, Apple tone)
1 Nav: white, wordmark IMAGE, mega-menus (restyle), Sign in + blue "Create free account"
2 Hero (CENTERED): short Apple-cadence headline ("Plan once. Publish everywhere."),
  one-line sub, ONE primary CTA + quiet text link; below: full-width LIGHT product
  board (replicas re-cut light = clean UI screenshot w/ soft shadow)
3 Networks row: static centered strip of the 10 + "and 20 more" (quiet, no marquee)
4 Three cards: Plan / Publish / Measure (minimal copy)
5 Tabbed deep-dive: Calendar · Composer · Publishing · Analytics · Inbox · API
  (existing Tabs, light replicas + dark terminal for API)
6 Numbered real-benefits list (5 items)
7 Quiet reliability strip (durable delivery, one diagram, one sentence)
8 Pricing (centered timetable)
9 FAQ (6 real Q&As: official APIs, open source/AGPL, data ownership, trials/cancel,
  networks, API access)
10 Final CTA (centered, minimal) · footer (light taxonomy)

## Motion (GSAP)
pnpm add gsap (root). ScrollTrigger reveals (fade/rise, small stagger) replacing IO
runtime on marketing; hero intro timeline (headline → sub → CTA → screenshot rise);
subtle tab crossfades; all inside gsap.matchMedia with prefers-reduced-motion off-ramp.
Restraint per Apple: nothing bouncy, nothing looping, durations 0.5-0.8s.

## Kills
Lava/mesh canvas + scrim + fallback gradient (component retired), amber/olive/navy
token system (ink becomes slate-navy; amber/olive removed), dark dev band (terminal
stays dark as a code block on white), Stripe left-hero layout, glass fact pills.

## Keeps
MegaNav structure (restyled) + mobile menu + a11y model; taxonomy footer (light);
honest metrics/FAQ content; image slots + queue; mk-* scoping; guidelines compliance
(focus-visible, reduced motion, no transition:all, skip link, theme-color→#FFFFFF).

## Plan
A (core, me): install gsap · marketing.css v5 (light-blue system, centered layouts) ·
motion-v5 (GSAP wrapper client component replacing MotionRuntime reveals on marketing)
· nav restyle w/ wordmark image · centered home v5 · light re-cut of CalendarBoard CSS.
B (fan-out): light re-cuts of 4 replica CSS · FAQ component · subpage polish · review.
C: build, smoke, present. Then rollout of remaining pages on approval.
