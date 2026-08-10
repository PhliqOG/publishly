# Stripe-cut remake (v4) — operator directive 2026-08-09 late

Directive: clone stripe.com's layout/feel for Publishly. Lava gradient hero, mega-menu
nav (Products/Solutions/Developers/Resources/Pricing), transparent/diagonal sections,
pill buttons, Google signup CTA, cleaner Stripe/Metricool-style logo, real imagery,
insanely smooth. Palette stays #133458/#838921/#D99B21/#FAF7BB (used IN the gradient;
light canvas like Stripe). Supersedes Night Rail's navy-first canvas; Night Rail's dark
tokens survive as the DEV band + product-replica windows (Stripe's dev section is dark).

HONESTY SUBSTITUTIONS (constraint, non-negotiable):
- Logo cloud → 10 real network logos (nominative use), NOT customer logos.
- Metrics → real numbers only: 10 networks, 30+ engine targets, real plan entitlements,
  real API rate limits, AGPL open source. No volume/user claims.
- Testimonials/case studies → use-case story cards (agencies/creators/teams), no
  invented quotes/headshots. Slots designed so real quotes drop in later.

Google signup: google.provider.ts EXISTS → hero "Sign up with Google" → /auth
(works once GOOGLE_CLIENT_ID/SECRET set — added to credentials checklist).

IMAGES: Chrome extension not connected at build time → every image slot ships with
(a) a crafted generation prompt in image-queue.md, (b) a polished CSS gradient-art
fallback. Pipeline run (or connected extension session) fills public/marketing/.

Section order (mirrors stripe.com):
1 Nav: wordmark logo + mega-menus + Sign in + Start now (pill)
2 Hero: lava canvas (WebGL fbm, palette colors, reduced-motion static), diagonal cut,
  headline + sub + [Start now] [Sign up with Google], real-fact strip above headline
3 Network logo cloud (auto-scroll, pause on hover, reduced-motion static)
4 Feature pillar cards (6, Stripe "flexible solutions" style, image slots)
5 Metrics band ("The backbone of your publishing") — real numbers grid + viz
6 Use-case stories (agencies/creators/teams cards with image slots, "products used")
7 Dev section (DARK navy band): terminal + real API facts + docs/source CTAs
8 What's shipping (honest changelog/roadmap cards)
9 CTA section ("Ready to get started?") + pricing/link cards
10 Mega footer (Products/Solutions/Developers/Resources/Company columns, real routes)

Files: lava.tsx (new, client WebGL) · mega-nav.tsx (new, client dropdowns) ·
logo v2 wordmark (logo.tsx rewrite) · marketing.css v4 (light Stripe system, keeps
mk-* API + dark-band tokens) · page.tsx v4 · image-queue.md · fan-out: pillars/
stories/footer/subpage-reskin/review · build+smoke+present.
