# Problem Definition — Publishly repositioning: "The reliability layer for social posting at scale"

Date: 2026-08-10 · Status: VERIFIED — awaiting operator gates

## Verification results (full detail in codebase-reality.md / competitor-pricing.md)

- TRUE-TODAY and safe to market hard: delivery receipts (PublishingJob states +
  provider post ID/URL, readable via `GET /v1/posts/:id/status`), failure reason on
  every post (+ two-layer category taxonomy), conservative duplicate-safe retries
  (Temporal; publish mutations deliberately fire once), dead-account detection
  (refreshNeeded + immediate email/in-app + posts blocked), AI suite (image/text/
  slides/voice/copilot), analytics on 12 networks (NOT Bluesky/Mastodon/personal
  LinkedIn — never claim analytics breadth there).
- ABSENT (dishonest if claimed today): **failure webhooks** (only `post.published`
  fires; every failure path exits before dispatch — though the dispatcher itself is
  excellent: HMAC-signed, retried, audited) and **"billed on successful posts only"**
  (quota counts scheduled posts pre-publish; no per-post metering).
- PARTIAL (narrow the language): token handling (auto-refresh at expiry + instant
  alert when refresh fails — but no *advance* warning), success-rate widget (data
  model supports it; no org-scoped aggregate endpoint exists).
- Existing marketing.config has two overreaches to fix regardless: "or a token
  refresh" in the sweeper claim (sweeper excludes dead channels; such posts error
  terminally) and "the calendar shows exactly what happened per network" (receipt
  detail is admin-only today).
- Competitor numbers: Ayrshare $1,228.30/mo @100 profiles CONFIRMED; Buffer @30
  channels ≈ **$300**/mo (not $360 — use the verifiable number); bundle.social $100
  entry CONFIRMED; Metricool caps at 50 brands, no unlimited tier; Hootsuite entry
  $99/mo annual (10 accounts). Provenance with URLs + dates in competitor-pricing.md.

## Problem statement

The current marketing site sells a *scheduler* (calendar-first, mechanism-heavy copy that
over-explains how the pipeline works). The operator wants it repositioned to sell a
*reliability layer for fleet operators* — people running 20–500+ accounts across brands,
clients, and locations — with the promise: **"Nothing fails silently. Flat price,
unlimited accounts."** Copy must be about the reader (their fleet, their risk, their
growth tax), not about our internals.

Two visual centerpieces evolve, not restart:
1. **Hero** — animate a full post lifecycle: API request → queued → sent → confirmed-live
   → delivery-receipt webhook payload; second loop: a failure gets classified,
   auto-retried, alert fires. (Evolves the existing ApiTerminal, keeps the halftone panel.)
2. **Journey diagram** — the current horizontal fan-in becomes a **vertical journey**:
   calendar → multi-brand routing → platforms → delivery/receipts → analytics →
   AI learning loop (what performed feeds the next captions).

## Problem type

Bounded rebuild (pages, copy, pricing UI, animations) **with three embedded decisions
that are the operator's to make** (gates below) and one unbounded strand (AI
"auto-improvement" feature ideation → how it may appear on the site honestly).

## IS / IS-NOT

- IS: repositioning of copy, information architecture (new pages), pricing presentation,
  hero + diagram animation, SEO metas. IS: server pricing.ts change **if** Gate 1 approves.
- IS NOT: building the backend features the spec markets (delivery-receipt webhooks,
  failure taxonomy, token-expiry warnings, success-rate widget) — unless Gate 2 chooses
  "build minimal real versions," which becomes a separate follow-on build.
- IS NOT: discarding the Clean Sky aesthetic, the halftone hero panel, or the editorial
  system. The spec says evolve.
- IS NOT: any bot/farm/mass-account framing. All multi-account language is
  multi-brand / multi-client / multi-location / multi-market (Meta/TikTok app reviewers
  read marketing copy).

## Constraints (non-negotiable)

- **Honesty floor (operator's own standing rule):** no fabricated logos, testimonials,
  stats, or feature claims. "Each row describes shipping behavior, not a roadmap" is
  currently *printed on the product pages*. Every claim on the new site must be
  TRUE-TODAY, clearly labeled as launching/roadmap, or backed by a real minimal
  implementation.
- **Comparison pages publish factual competitor pricing** — numbers must come from the
  competitors' current official pricing pages (verification in
  `competitor-pricing.md`), with an as-of date on the page.
- **Compliance framing rule** (from the spec): never "run X accounts on autopilot,"
  never automation-farm language.
- **Privacy/money absolutes:** no pushes to any remote, no paid services. GSAP + existing
  stack only.
- Server remains the price authority (`pricing.ts`); marketing reads from it.

## Known tensions (drive the gates)

1. **Pricing reversal.** This morning the operator set $20/$45/$100/$209 with channel
   caps 10/25/60/145 (server + UI + Stripe plan for tomorrow). The spec replaces this
   with Free/$29/$99/$299, **unlimited accounts**, metered on ~successful posts/mo
   (50 / ~2k / ~15k / ~100k). These are different business models; both cannot ship.
   "Billed on successful posts only" additionally requires post-metering the backend
   does not currently do (verification pending) — at minimum the marketing must not
   claim billing behavior the billing system doesn't implement.
2. **Marketed-but-unbuilt reliability features.** Delivery-receipt webhooks with
   payloads, failure classification, token-expiry warnings, dead-account detection,
   live success-rate widget + status page. Codebase audit pending; anything ABSENT
   cannot be claimed as shipping.
3. **AI auto-improvement suite** (operator's new ideas): caption learning from
   top-performing posts, per-brand knowledge folder with guided tutorial, AI video
   understanding (frames + transcript) for personalized captions. All future. Site can
   present these only as a clearly-labeled preview/roadmap section — or they become a
   product build, which is out of this task's scope.
4. **"Live" proof widgets with no traffic.** A success-rate widget on day one has no
   data. Honest options: wire it to the instance's real aggregate (shows small real
   numbers), or ship the widget behind the status page at launch and keep the hero
   lifecycle animation illustrative (labeled as such).

## Gates for the operator (Step 8)

- **Gate 1 — pricing:** adopt the spec's flat/unlimited-accounts post-volume tiers
  (reverses this morning's tiers, changes pricing.ts + tomorrow's Stripe setup)?
- **Gate 2 — honesty handling for reliability claims:** (a) market only what's
  TRUE-TODAY and downgrade the rest to "launching" labels; (b) authorize a follow-on
  backend build of minimal real versions (failure-reason surfacing, failure webhooks,
  token-health flags, success counters) so the flagship claims are true; or (c) both —
  claim what's true now, build the rest next, upgrade copy as each lands.
- **Gate 3 — AI suite placement:** roadmap-labeled section/page now, or hold it off the
  site until built.

## Scope

IN: home rebuild (hero lifecycle animation, pain narrative, fleet-health glimpse,
pricing teaser, integrations row), /pricing (new tiers + growth-tax calculator),
/reliability flagship, 4 comparison pages, 4 solutions pages, integration pages
(n8n / Make / MCP), vertical journey diagram, sitewide copy re-voice (reader-first),
SEO title/meta per page, favicon/nav untouched.

IN (GEO layer — operator spec 2026-08-10, second message): AI-answer-engine
extractability across every page, no manipulation tricks (no hidden text, cloaking,
stuffing, or LLM-directed markup — explicitly banned by the operator):
- Answer-first: 2–3 sentence "Quick answer" block atop every major page; short
  self-contained body paragraphs.
- Real HTML comparison tables with identical rows (pricing model, account cap,
  per-post vs per-profile, silent-failure handling, receipts, retries, token alerts)
  on every comparison/solutions page — numbers only from `competitor-pricing.md`.
- Evergreen listicle resource pages ("Best social media posting APIs for
  multi-account operators 2026", "Best Ayrshare alternatives 2026", "Best
  flat-pricing posting APIs") — neutral tone, honest competitor entries, tables.
- Per-page FAQ blocks answering literal long-tail buyer queries (silent-failure,
  per-account pricing, 100-accounts-via-API, disconnected-account detection...).
- Extractable fact blocks: standalone factual sentences with numbers (only claims
  that survive Gate 1/Gate 2 — a fact block is the *most* dangerous place to be wrong).
- Entity clarity: ONE canonical "Publishly is a [category] that [job] for [ICP]"
  sentence reused verbatim on home / about / docs.
- Authorship + freshness: visible author byline + publish/updated dates on content
  pages (needs Gate 4: what public byline name to use).
- JSON-LD hygiene: Organization, Product, FAQPage — accurate only, low effort.
- robots.txt: explicitly allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended,
  CCBot (site is local-only today; this matters at deploy).
- Docs as citation bait: public docs pages with copy-paste curl against the real
  /public/v1 API; "how it works" explainers for reliability features (only ones that
  exist per Gate 2).

## GEO layer, items 11–30 (operator spec 2026-08-10, third message) — triaged

Governing rule the operator set: original facts + technical precision + primary data +
freshness + crawlability + corroboration. No GEO folklore, no fabricated measurements,
no manipulation. Triage below separates what is buildable on a local, undeployed site
from what physically requires a live domain and traffic.

### Buildable NOW (this project)
- **11 Crawler policy** — `docs/seo/crawler-policy.md` (crawler / operator / purpose /
  allow / source / last-verified) + robots.txt that separates discovery crawlers
  (OAI-SearchBot, PerplexityBot, Googlebot) from training crawlers (GPTBot, ClaudeBot,
  CCBot, Google-Extended), documented correctly: OAI-SearchBot ≠ GPTBot; Google
  AI Overviews ride normal Googlebot indexing, Google-Extended is a training control;
  ClaudeBot/CCBot allowance recorded as a content-use decision, not a ranking lever.
  Cloudflare challenge/403/429 audit → written as a deploy-day checklist in the same
  doc (no CF sits in front of the local instance today).
- **15 Canonical fact registry** — `data/public-product-facts.json`: every externally
  stated fact (prices, quotas, networks, formats, API limits, webhook/retry/receipt
  behavior, token alerts, SDK/MCP/n8n, storage, support, security, restrictions, each
  with last-verified). Marketing pages import from it; automated consistency test
  (registry ↔ pricing.ts ↔ rendered claims).
- **16 Claim provenance** — `data/claim-provenance.json` seeded from
  `.building/reposition/competitor-pricing.md` (claim / source URL / publisher /
  retrieved / verified / evidence excerpt / confidence / first-vs-third-party /
  affected pages). Comparison pages render "Pricing last checked: <date>"; stale-flag
  script (30d competitors, 90d platform facts) per item 25.
- **18 Entity markup** — accurate Organization (`@id: <origin>/#organization`) +
  SoftwareApplication JSON-LD, cross-referenced; zero fake ratings/reviews/counts/
  awards; schema validation wired into the build/test step.
- **19 Changelog + error KB (+status stub)** — `/changelog` from real git/release
  history only; `/docs/errors/<real-error>` pages **generated from the codebase's real
  failure taxonomy** (failureCategory values + provider error paths in
  `codebase-reality.md`) so docs cannot drift from code; `/status` only if it shows
  real operational data from the running instance — otherwise a truthful "status page
  live at launch" placeholder, never fake green lights.
- **20 Platform spec pages** — `/platforms/<platform>` for genuinely supported
  networks, derived from each provider's actual integration code (capabilities,
  formats, limits, analytics presence per audit #10) + platform-doc facts with
  SUPPORTED-BY-PLATFORM vs SUPPORTED-BY-PUBLISHLY vs REQUIRES-APPROVAL vs
  NOT-SUPPORTED distinctions and last-verified dates.
- **21 Programmatic quality gate** — index only pages with unique intent + verified
  facts + real value; `noindex` otherwise; no near-duplicate spam pages.
- **22 Server-rendered facts** — marketing stays server-components; pricing, tables,
  FAQs, fact blocks in initial HTML (already the architecture; keep it that way).
- **23 Topic authority graph** — deliberate hub structure with contextual links
  (/social-media-api → platform pages → docs → errors; → /webhooks →…; → /compare →…);
  no keyword footer blocks.
- **24 Machine-readable feeds** — sitemap.xml with honest lastmod; RSS/Atom changelog
  feed; dataset CSV/JSON only when real benchmark data exists (17).
- **26 Methodology page** — `/methodology/api-comparisons` explaining weighting;
  conclusions defensible from provenance data.
- **27 Honest tradeoffs** — "Publishly may not be the best choice if…" + "Choose
  Ayrshare/Metricool/Upload-Post if…" on comparison/buyer pages, accurate.

### Scaffold now, ACTIVATE at deploy (needs live site/traffic/credentials)
- **12 Preferred Sources CTA** — tasteful CTA component on editorial pages, separate
  tracking event; meaningful only once live.
- **13 Search Console AI reporting** + **14 ChatGPT referral funnel** — build the
  measurement doc + utm_source=chatgpt.com attribution notes and dashboard spec;
  actual data collection starts post-deploy. No visitor fingerprinting.
- **17 Benchmark engine** — harness + methodology skeleton + result schema (CSV/JSON,
  Dataset markup) may be scaffolded; **nothing publishes until real measured runs
  exist** — never fabricate measurements. Realistically a separate follow-on project.
- **28/29 Regression suite + success metrics** — fixed query set + observation log
  template + metric definitions now; observations only from legitimate manual checks
  post-launch; no hammering consumer AI products.

OUT of this task: backend feature builds (separate task if Gate 2b), real status-page
infra, Stripe reconfiguration (operator's morning task), any deployment, live
benchmark runs, Search Console/analytics wiring (post-deploy).

## Success criteria

- Every published claim maps to a row in `codebase-reality.md` marked TRUE-TODAY, or
  carries an explicit launching/roadmap label.
- Comparison-page numbers match `competitor-pricing.md` (official-source, dated).
- Copy passes the "about the reader" test: hero + section leads address "you/your
  fleet," mechanisms demoted to supporting lines.
- No compliance-red-flag phrasing anywhere (grep for autopilot/mass/farm/bot).
- Production build green; all routes 200; diagram + hero animations run with
  reduced-motion fallbacks; commit local only.
