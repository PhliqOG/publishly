# Stripe → Publishly 1:1 clone map (operator-directed, AtlasPages method:
# copy the structure exactly, swap the substance. Structure/patterns cloned;
# Stripe's actual copy text, images, and code are NOT copied — ours throughout.)

| # | Stripe section (live 2026-08) | Publishly 1:1 swap |
|---|---|---|
| 0 | Nav: logo · Products · Solutions · Developers · Resources · Pricing · Sign in · Start now | Same items verbatim. Mega-dropdowns map to real routes: Products→Composer(/features), Calendar(/calendar), Publishing(/publishing), Analytics(/analytics), Engagement(/engagement), API(/api-docs) · Solutions→Agencies(/agencies), Teams(/features), Open source(/source) · Developers→Docs(/api-docs), Source(/source), Security(/security) · Resources→About, Contact, Terms, Privacy, Acceptable use · Pricing→/pricing |
| 1 | Hero: "Financial infrastructure to grow your revenue" over animated wave gradient; "Global GDP running on Stripe" fact line; [Get started] [Sign up with Google] | "Publishing infrastructure for every channel you own." over LAVA gradient (WebGL fbm flow in #133458/#838921/#D99B21/#FAF7BB); fact line = "10 networks · official APIs · open source"; [Start now] [Sign up with Google] (google.provider.ts is real; needs GOOGLE_CLIENT_ID/SECRET) |
| 2 | Customer logo carousel (OpenAI, Amazon, Nvidia…) | PLATFORM carousel — every real posting target, top networks first: TikTok, Instagram, Facebook, LinkedIn, YouTube, X, Threads, Pinterest, Bluesky, Mastodon, then engine-inherited: Reddit, Discord, Slack, Telegram, Medium, Dev.to, Hashnode, WordPress, Tumblr, Warpcast, Lemmy, Twitch, Kick, Dribbble, Google Business, VK, Nostr, MeWe, Skool… (all genuinely supported by the engine). Auto-scroll, pause on hover, static under reduced motion. Text wordmarks + brand dots (nominative use). |
| 3 | "Flexible solutions for every business model" — 6 product feature cards w/ imagery | "One pipeline for every kind of publisher" — 6 cards: Composer / Calendar / Durable publishing / Bulk CSV / Analytics / Inbox — each with image slot (gen-prompt in image-queue.md, gradient-art fallback) + arrow link to its route |
| 4 | "The backbone of global commerce" metrics: 135+ currencies, $1.9T, 99.999%, 200M+ | "The backbone of your publishing" — REAL numbers only: 10 first-class networks · 30+ publishing targets · exactly-once durable workflows (architecture fact) · 4 plans w/ 7-day trials · hashed scoped API keys · AGPL-3.0 open source. NO invented volume/uptime/user figures. |
| 5 | Enterprise + startup case-study carousels w/ customer stories & metrics | Use-case story cards (no fabricated customers/quotes): Agencies (multi-workspace isolation, audit log) · Creators (one draft, every voice) · Teams (roles, approvals) — each "Products used" list + image slot + arrow link. Testimonial slots DESIGNED but ship empty until real quotes exist. |
| 6 | Testimonial quotes w/ headshots (Mindbody, Substack…) | OMITTED (honesty constraint) — grid space folds into use-case cards. Drop-in ready when real. |
| 7 | Dev section (dark): "Reliable, extensible infrastructure", API metrics, code, docs/GitHub CTAs | DARK NAVY band (Night Rail tokens reused): ApiTerminal typing block + real facts (deny-by-default scopes, per-org rate limits, bulk endpoints) + [View API docs] [Get the source] |
| 8 | "What's happening" news cards | "What's shipping" — honest changelog/roadmap cards (bulk CSV, inbox framework, analytics snapshots, aud log — features that actually shipped) |
| 9 | "Ready to get started?" CTA + pricing/integration info cards | Same: [Start now] [See pricing] + 2 info cards (transparent pricing → /pricing; start building → /api-docs) |
| 10 | Mega footer: 7 columns of products/solutions/dev/resources/company | 5 columns, real routes only + AGPL source link + footer note |

Design system deltas (v4 "Stripe-cut"): light canvas #fff with cream-tint section
bands; ink = navy #133458; pill buttons (radius 999) navy-solid + arrow-slide links;
diagonal section cuts (skewY wrappers, Stripe signature); mega-menu translucent
dropdowns (blur, the "transparent parts"); lava WebGL hero w/ static-gradient
fallback (no-WebGL + reduced-motion); replicas & terminal stay DARK = product
windows on light canvas (Stripe pattern). Logo v2: clean wordmark ("publishly",
Geist 650, navy) with amber parallelogram dotting the i (Stripe-motif accent);
old P-cell mark retires to favicon until asset regen.

Images: public/marketing/<slot>.png; every slot has a crafted prompt in
image-queue.md; CSS gradient-art fallback ships so the site is complete today;
Chrome-extension imagegen session (or Atlas pipeline run) fills them when live.
