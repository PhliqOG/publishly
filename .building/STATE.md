# Publishly — Overnight Build State Ledger

Product: **Publishly** — multi-tenant social scheduling SaaS built on Postiz (AGPL-3.0).
Operator directives: autonomous overnight build; credential-independent; brand = "Publishly";
marketing site must get a distinctive creative design pass (frontend-design skill), not a template.

## Baseline
- Upstream: gitroomhq/postiz-app @ 7d08f5b6 (2026-08-08, post-v2.23.0). Remote `upstream`, tag `upstream-baseline-20260809`.
- Repo path: Desktop/publishly (renamed from publora; the "lock" was the session shell's own cwd).
- License: **AGPL-3.0, no custom terms** (verified from LICENSE). Commercial SaaS permitted.
  Obligation (AGPL §13): network users must be offered the Corresponding Source of the modified
  version. Action: LICENSE stays intact + LICENSE-COMPLIANCE.md + source-offer link in app footer.

## Architecture (audited)
- apps/backend — NestJS API, port 3000. Layering rule: DTO >> Controller >> (Manager) >> Service >> Repository.
- apps/orchestrator — NestJS + Temporal workflows/activities (background jobs, publishing). Has health.controller.ts.
- apps/frontend — Next.js 16 (repo CLAUDE.md claims Vite — code says Next; trust code), port 4200.
- apps/commands, apps/extension (Chrome ext), apps/sdk.
- libraries/nestjs-libraries — shared server code incl. Prisma schema + 30+ social providers
  (libraries/nestjs-libraries/src/integrations/social/*). All 10 required networks present.
- libraries/helpers, libraries/react-shared-libraries.
- Prisma models: Organization, User, UserOrganization(Role), Subscription, Customer, Integration,
  Post, Media, Comments, Webhooks, AutoPost, Sets, Signatures, OAuthApp/OAuthAuthorization,
  Errors, Mentions, mastra_* (AI), Announcement.
- Temporal rules from repo CLAUDE.md: never modify a workflow already on origin/main — create a
  versioned new workflow; never change activity parameter shapes — add new activities.
- Provider rule: no platform-specific branches in generic code; extend the provider interface.

## Environment decisions
- Machine: Windows 11, Node 25 global — repo needs Node >=22.12 <23 → isolated toolchain at
  ~/.publishly-tools/ (node-v22.23.2-win-x64 + pnpm 10.6.1 standalone exe). PATH-prepend per command.
  No global mutation. pnpm 9 global must NOT be used (pnpm 10 honors onlyBuiltDependencies=[bcrypt],
  which skips canvas's native build — canvas has no Win prebuilt for node22).
- .npmrc: node-linker=hoisted (flat node_modules; rename-safe).
- Infra: docker-compose.publishly.dev.yaml — Postgres 17 @5433, Redis @6380, Temporal 1.28.1
  @7233 (ENABLE_ES=false, SQL visibility), Temporal UI @8082. Ports 6379/5000/5678/9090 belong to
  other local stacks; never touch them.
- .env: dev-only values, TEMPORAL_ADDRESS=localhost:7233, STORAGE_PROVIDER=local, IS_GENERAL=true.

## Task board (harness tasks #1–#16)
1 audit · 2 boot stack · 3 branding · 4 tenant core · 5 capability registry/health · 6 test provider+publishing
7 composer/calendar/CSV · 8 analytics · 9 billing · 10 public API · 11 admin+logs · 12 security pass
13 marketing site · 14 inbox · 15 docs+approval packages · 16 final verification+report

## Progress log
- 2026-08-09 ~08:00 Cloned upstream, license verified, architecture mapped, providers enumerated.
- ~08:15 Gap analysis complete → full findings in docs/AUDIT.md (19 gap items, severity-ordered).
  Headlines: zero tests; plaintext social tokens; weak CBC/static-IV crypto; recoverable API
  keys; no webhook replay guard; no audit log/inbox/CSV/marketing/branding/config-validation.
- ~08:20 Infra containers up (PG 5433, Redis 6380, Temporal PG). Checkpoint 0 committed (309994c0).
- pnpm install running (isolated Node 22.23.2 + pnpm 10.6.1). Task #1 done; #2 in progress.
- ~08:50 install OK (17m36s; pnpm10 script-allowlist worked — sharp/esbuild/swc use prebuilt
  optional deps). prisma db push OK; infra containers up under project publishly.
- BOOT SAGA: (1) upstream TS break in bluesky.provider (atproto union) blocked ALL compiles —
  fixed with narrowing; (2) nest-cli watch on Windows proved unreliable (no spawn after initial
  failure; manualRestart; taskkill crashes) — ABANDONED for backend/orchestrator. New regime:
  plain `tsc -p tsconfig.build.json --watch` per app (logs .building/logs/tsc-*.log) + apps run
  directly from dist via dotenv+node (logs .building/logs/app-*.log, pids .building/*.pid).
  Frontend stays on `pnpm run dev:frontend` (Next dev works fine; first-request compiles are
  slow — use curl -m 60). (3) Temporal SQL visibility caps Text search attrs at 3 — Postiz needs
  more → Elasticsearch added to compose (mirrors upstream), ENABLE_ES=true. Temporal+ES healthy.
- Built during compiles: test provider (env-gated, pending-mode, fail-injection, sink);
  provider env registry + configured/missingEnv/maxLength in integrations payload; config
  validation (secret strength, all-or-nothing groups, CONFIG_STRICT) backend+orchestrator;
  backend /health; Stripe webhook replay ledger (claim/release); single-use password reset;
  hashed scoped API keys (pub_ prefix, middleware branch, scope rules, mgmt controller);
  audit logs (model/service/controller + team/integration/api-key/bulk call sites); throttler
  now covers ALL /public/v1 routes (read/write/posts buckets); pricing overridable via
  PRICING_OVERRIDES_JSON (client-bundle-safe); at-rest encryption v2 (AES-256-GCM) for
  Integration token/refreshToken sealed at repository writes + opened just-in-time at every
  provider seam (post.activity object-boundary copies; providers untouched); CSV bulk import
  (RFC4180 parser, preview→commit lifecycle, per-row report) + bulk shift/delete endpoints.
- Branding fork running (in-app rename sweep, original logo, disabled-provider UI, api-key +
  audit-log settings UIs). Approval packages done earlier (docs/platform-approval/, 12 files).
- ~10:00-10:45 Shipped: API keys/audit/bulk/webhook-ledger/crypto/pricing (checkpoint 2
  3f518100); marketing site + inbox fork + docs fork + export/deletion + admin/system +
  snapshots (checkpoint 3 54c28dc0). Docs fork also fixed the never-executed upstream remote
  rename (origin→upstream + baseline tag) — a real push-hazard catch.
- MACHINE RESTARTED mid-run (~3h gap). Recovery: containers auto-restarted; recompiled
  backend (one-shot tsc) + orchestrator (nest build — REQUIRED for Temporal workflow
  bundling); relaunched all three apps. Frontend serves marketing '/' 200 with the
  departures-board hero. Orchestrator worker queues RUNNING incl. 'testprovider'.
- VERIFICATION: unit 27/27 (twice); integration vs LIVE API 17/17 (IDOR matrix 7,
  api-keys 6, webhook replay ledger 4). Secrets scan of tracked files: clean.
- E2E scheduling proof: first run exposed testprovider missing from the settings-DTO
  discriminator whitelist — fixed, backend recompiling/restarting, E2E re-running.
- POST-REPORT FOLLOW-UP (operator "continue"): production `next build` PASS (9/9 static,
  full route table, proxy bundled); `next start` on :4200 serves marketing+app routes 200
  with Publishly markup; E2E scheduling re-run PASS on the production-frontend stack.
  Ops note: killing a backgrounded launch task does NOT always kill the node child — the
  original orchestrator (pid 8508) survived a task kill and held :3002 (EADDRINUSE on
  relaunch, which is how it was noticed). Check ports before relaunching.
  Browser-level UI E2E still open: Claude-in-Chrome extension not connected on this box.

## Open risks
- canvas (node-canvas 2.x) native build skipped by pnpm 10 → runtime failure only if server code
  eagerly imports it. Check on boot; shim/lazy-load if needed.
- Windows dev "not well-tested" per Postiz docs — expect path/script friction (rm -rf in scripts
  works via git-bash sh for pnpm scripts? pnpm runs scripts with cmd.exe on Windows by default —
  scripts use `rm -rf`, `cross-env` exists for some; may need shell-emulator or git-bash PATH).
- Disk: ~21GB free at start. Monitor after install + docker pulls.
- Next.js 16 + React 19: recent stack; fine.

## Credentials needed tomorrow (running list — keep updated)
- Stripe: STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_SIGNING_KEY (+_CONNECT optional)
- Storage: CLOUDFLARE_* (R2) or S3-compatible equivalents
- Email: RESEND_API_KEY (+EMAIL_FROM_ADDRESS/NAME)
- Socials: FACEBOOK_APP_ID/SECRET, THREADS_APP_ID/SECRET, YOUTUBE_CLIENT_ID/SECRET,
  TIKTOK_CLIENT_ID/SECRET, X_API_KEY/SECRET, LINKEDIN_CLIENT_ID/SECRET, PINTEREST_CLIENT_ID/SECRET,
  REDDIT_CLIENT_ID/SECRET, MASTODON_CLIENT_ID/SECRET, DISCORD_*, SLACK_* (Bluesky needs none —
  app-password login; Mastodon default server works via per-instance app creation)
- OPENAI_API_KEY (optional AI features)
