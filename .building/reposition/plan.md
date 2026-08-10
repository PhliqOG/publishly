# Program Plan — Publishly repositioning + reliability completion + AI suite

Date: 2026-08-10 · Gates resolved: pricing = flat/unlimited tiers · claims = copy for
the finished product (site unlaunched; features get built) · AI suite = BUILD it ·
byline = "Liam, founder of Publishly".

Governing consequence of the claims gate: the site may describe the finished product,
but **the deploy checklist blocks going live until every claimed feature exists**.
Claims-to-code mapping is tracked in `data/public-product-facts.json` (item 15) so the
gap is always visible, never vibes.

## Phase 1 — Backend truth (small, unblocks the flagship claims)

- **1a `post.failed` webhook event.** Reuse the existing HMAC-signed, retried, audited
  dispatcher (`post.activity.ts`); add event type `post.failed` with payload
  { postId, integration, failureCategory, error, attempts, occurredAt }; dispatch from
  the failure branches of `post.workflow.v1.0.6.ts` (all `return false` paths after
  job transition). Also `post.unconfirmed` for the markUnconfirmed path.
- **1b Org success-rate endpoint.** `GET /posts/publishing-jobs/stats` — org-scoped
  groupBy(state) + failureCategory breakdown over a time window; powers both the app
  fleet-health panel and (later, aggregated) any public proof widget.
- **1c Advance token-expiry alert.** In the refresh workflow: notification fired
  N days (default 7) before `tokenExpiration` for providers that can't silently
  refresh, plus the existing failure alert. Makes "know a token's dying before your
  post does" true.
- **1d Quota semantics fix.** Monthly counter excludes ERROR/deleted posts explicitly
  → "failed posts never count against your plan" becomes literally true (that is the
  honest form of "billed on successful posts only").
- **1e pricing.ts new tiers.** FREE 50 posts/5 channels · STARTER $29 ~2k ·
  GROWTH $99 ~15k (priority retries flag, SLA note) · SCALE $299 ~100k; paid tiers
  channel-unlimited (drop `channel` cap; verify every UI/permission read of `channel`
  handles unlimited). Year = ×10. Display names update.
- **1f Fleet-health panel (app).** Minimal org dashboard card: success rate, failed
  posts with reasons, dead accounts needing reconnect — consumes 1b. (The marketing
  "dashboard glimpse" screenshots this honestly later.)
- Tests for all of the above; alerts.send stubbed in tests (standing rule).

## Phase 2 — Marketing site rebuild (spec + GEO 1–10)

- **2a Copy system.** Sitewide re-voice: reader-first ("you run 50 brands…"), pain
  narrative (silent failures → token death → no reasons → growth tax), copy bank
  integrated, compliance framing (multi-brand/multi-client, never autopilot/mass/bot),
  canonical entity sentence everywhere: "Publishly is a social publishing API and
  scheduler that gives every post a delivery receipt, a failure reason, and an
  automatic retry — for teams running many brands, clients, and locations."
  (final wording tuned in build). Fix the two audited overreaches.
- **2b Hero evolution.** Keep halftone panel; ApiTerminal becomes the post-lifecycle
  animation: request → queued → sent → confirmed-live → signed receipt webhook JSON;
  loop 2: failure classified → retried → alert. Real payload shapes from 1a.
- **2c Vertical journey diagram.** Calendar → brand routing → platforms → delivery
  receipts → analytics → learning loop feeding back to captions (GSAP draw + pulses,
  reduced-motion safe).
- **2d Pages.** Home (pain narrative, proof, fleet-health glimpse, pricing teaser,
  integrations row REST/n8n/Make/MCP) · /pricing (new tiers + growth-tax calculator
  slider vs Ayrshare/Buffer/Metricool at verified rates) · /reliability flagship
  (failure taxonomy from real categories, receipts, retries, token health,
  dead-account detection) · /compare/{ayrshare,buffer,hootsuite,bundle-social}
  (+ metricool, upload-post given verified data) · /for-{agencies,multi-brand,
  creator-networks,developers} · /integrations/{n8n,make,mcp} · listicle resources
  ("Best social media posting APIs for multi-account operators 2026", "Best Ayrshare
  alternatives 2026", "Best flat-pricing posting APIs").
- **2e GEO 1–10 on every page.** Quick-answer block · comparison tables (same rows
  everywhere) · FAQ blocks with long-tail Q&As · extractable fact sentences ·
  byline "Liam, founder of Publishly" + publish/updated dates · JSON-LD
  (Organization @id, SoftwareApplication, FAQPage — accurate only) · robots.txt
  (11's policy) · unique title/meta per page.

## Phase 3 — GEO infrastructure (items 11–27 buildable set)

- 3a `docs/seo/crawler-policy.md` + robots.txt (OAI-SearchBot/PerplexityBot/Googlebot
  discovery vs GPTBot/ClaudeBot/CCBot/Google-Extended training; Cloudflare deploy-day
  checklist). 3b `data/public-product-facts.json` + consistency test wired to
  pricing.ts and page renders. 3c `data/claim-provenance.json` + "last checked" on
  comparison pages + stale-flag script. 3d /changelog (real history) + RSS/Atom.
  3e /docs/errors/* generated from the real failure taxonomy. 3f /platforms/* spec
  pages from integration code capabilities. 3g sitemap.xml honest lastmod.
  3h /methodology/api-comparisons. 3i "When not to use Publishly" + "Choose X if…"
  sections. 3j topic-graph contextual links; noindex gate on thin pages.
  3k Scaffolds only: benchmark harness skeleton (publishes nothing), measurement/
  regression templates, Preferred-Sources CTA component.

## Phase 4 — AI suite (product build; largest)

- **4a Brand Folder.** Prisma model (org-scoped BrandProfile: voice, banned words,
  product facts, persona, story, winners, competitor refs) + CRUD API + guided intake
  wizard UI with per-field tutorials + generation prompts grounded in the folder.
  Isolation: strictly org/brand-scoped, exportable.
- **4b Caption Memory.** Join post captions ↔ analytics snapshots; per-brand
  performance records + insight digests ("question hooks out-perform 2.1×");
  generation consumes top-performer exemplars. v1 heuristic features + exemplars
  (no vector DB dependency).
- **4c Video Understanding.** On video upload: ffmpeg frame sampling + Whisper
  transcription + vision summary (OpenAI, runtime-gated on OPENAI_API_KEY exactly
  like existing AI); stored media summary feeds per-video caption generation.
- **4d Self-tuning schedule (v1 light).** Per brand+network best-hour suggestion from
  snapshots, bounded ±2h, explainable, opt-in. (A/B fleet experiments + post-mortem
  cards + intelligent recycling = later roadmap, still shown on site as coming.)
- All entitlement-gated per tier; tests stub OpenAI + alerts; zero live API calls in
  tests or builds.

## Phase 5 — Verification + close

Suite green (backend + frontend build) · route smoke on every page · claims
consistency test green (facts registry ↔ pages ↔ pricing.ts) · compliance grep
(autopilot/mass/farm/bot) · reduced-motion pass · local commits (narrow staging;
concurrent session's uncommitted work untouched) · deploy checklist doc (features
required before go-live; Cloudflare crawler audit; Stripe products at new amounts;
robots verification).

## Order & parallelism

1 → 2 → 3 sequential-ish (2 needs 1's payload shapes; 3 needs 2's pages), 4 runs as
its own workstream after 1 (agents fan out per phase). Site copy references 4's
features as product capabilities; go-live blocked until 4a–4c land.

## Out / later

Live benchmark runs, Search Console + referral dashboards (post-deploy), status-page
infra (truthful placeholder until launch), Stripe reconfiguration (operator, morning),
fleet A/B + post-mortem cards + recycling (roadmap v2).
