# Architecture

## Monorepo layout

| Path | Role |
| --- | --- |
| `apps/frontend` | Next.js 16 (React 19) app: product UI under `(app)`, public marketing site under `(marketing)`, request gating in `src/proxy.ts` |
| `apps/backend` | NestJS 11 REST API (port 3000), Temporal *client* only |
| `apps/orchestrator` | NestJS + Temporal *worker*: workflows/activities, health on :3002 |
| `apps/commands`, `apps/extension`, `apps/sdk` | CLI, Chrome extension, public SDK (untouched tonight) |
| `libraries/nestjs-libraries` | shared server code: Prisma schema + repositories/services, 35 social providers, Stripe, email, Temporal module |
| `libraries/helpers` | leaf utilities: auth/crypto, config checker, CSV parser, fetch helpers |
| `libraries/react-shared-libraries` | shared UI helpers, brand module, variable context |

Backend layering is strict: `DTO → Controller → (Manager) → Service →
Repository`; repositories are the only Prisma call sites; no raw SQL.

## Request path

Browser → Next.js (`proxy.ts` decides marketing vs auth vs app; auth = `auth`
JWT cookie) → NestJS backend. `AuthMiddleware` verifies the JWT **and re-loads
the user from the database** (claims are never trusted), resolves the active
organization from the `showorg` cookie intersected with actual memberships, and
attaches `req.user`/`req.org`. Public API requests instead pass
`PublicAuthMiddleware` (see docs/API.md).

## Publishing pipeline (Temporal)

Workflows live in `apps/orchestrator/src/workflows`: `postWorkflowV101…V106`
(V106 live; older versions kept because deployed workflows are immutable —
never edit one that shipped, add a version), `autoPostWorkflow`,
`digestEmailWorkflow`, `missingPostWorkflow`, `refreshTokenWorkflow`,
`sendEmailWorkflow`, `streakWorkflow`.

V106 semantics (the exactly-once story):

- Scheduling starts `postWorkflowV106` with **`workflowId = post_<postId>`**
  and `workflowIdConflictPolicy: TERMINATE_EXISTING` — rescheduling replaces
  the run, and two concurrent schedules cannot both publish.
- Publish activities retry up to 3×; the **state-mutating
  `postSocialPending`/`finalizePost` proxy runs with `maximumAttempts: 1`** so
  a crash after platform acceptance can never re-run the mutation.
- Providers that return `pending` are polled via read-only `checkPostStatus`;
  the interface contract requires `completed` (never `ready` again) once
  finalize mutations landed, so a finalize retry cannot duplicate.
- `missingPostWorkflow` loops hourly (`RUN_CRON` gates its boot registration)
  and `signalWithStart`s any post whose slot passed — missed ≠ lost.
- Task queues: `main` plus one queue per provider
  (`identifier.split('-')[0]`), concurrency budgeted from each provider's
  `maxConcurrentJob`.
- Terminal failures land in the `Errors` table + in-app notification; there is
  no separate DLQ (documented operational choice).

**Elasticsearch is required** for Temporal visibility here: the app registers
more than 3 `Text` search attributes and SQL visibility hard-caps Text at 3
(the boot error is `Unable to create search attributes: cannot have more than
3 search attribute of type Text`). The dev compose runs ES 7.17 with 256 MB
heap.

## Data model highlights

Upstream core: `Organization` (tenant) ↔ `UserOrganization` (role:
SUPERADMIN/ADMIN/USER) ↔ `User`; `Integration` (a connected channel;
`organizationId+internalId` unique); `Post` is **per destination** with a
`group` id linking the multi-network batch (partial success is native);
`Subscription`/`Customer` for billing; `Media`, `Webhooks`, `Sets`,
`Signatures`, `AutoPost`, `OAuthApp`/`OAuthAuthorization`.

Added tonight:

| Model | Purpose |
| --- | --- |
| `ApiKey` | hashed scoped public-API keys (prefix shown, SHA-256 stored) |
| `AuditLog` | per-org trail of security-relevant actions |
| `ProcessedWebhookEvent` | replay ledger for incoming webhooks (Stripe) |
| `AnalyticsSnapshot` | daily persisted provider metrics (`integrationId+day+label` unique) |
| `BulkImport` | CSV import lifecycle: totals, progress, per-row report JSON |
| `User.resetCode` | single-use password-reset consume token |

Schema changes are additive; upstream applies schema with `prisma db push`
(no migration files) — see DEPLOYMENT.md for the production recommendation.

## Provider capability system

`SocialProvider` (libraries/nestjs-libraries/src/integrations/social/
social.integrations.interface.ts) is the whole contract: auth
(`generateAuthUrl`/`authenticate`/`refreshToken`), publishing
(`post`/`postPending`/`comment` + pending finalization), validation
(`maxLength`, `checkValidity`), optional `analytics`, `mention`, and — new —
optional **`listComments`/`replyToComment`** powering the inbox. Generic code
never branches on a specific platform; capability presence drives behavior.

`provider.env.registry.ts` maps each provider to the env vars it needs.
`IntegrationManager.getAllIntegrations()` exposes per provider: `configured`,
`missingEnv`, `maxLength`, `supportsInbox`, `supportsReplies` — the UI renders
unconfigured providers dimmed with an honest tooltip instead of a broken flow.
The `testprovider` (registered only when `ENABLE_TEST_PROVIDER=true`)
implements the full contract including pending finalization, failure
injection, a file sink for exactly-once assertions, and the inbox pair.

## At-rest encryption v2

`libraries/helpers/src/auth/crypto.v2.ts`: HKDF-SHA256 over
`ENCRYPTION_SECRET || JWT_SECRET` → AES-256-GCM, random 12-byte IV, format
`v2:<iv>:<tag>:<ct>`. `open()` accepts v2, legacy `fixedEncryption` hex
(AES-CBC, printable-plaintext guard), or raw plaintext — so pre-existing rows
keep working and re-seal on their next write. Sealing happens in
`integration.repository` (`createOrUpdateIntegration`, `updateIntegration`);
opening happens **just-in-time at every provider seam** — and where a provider
receives the whole Integration object, call sites pass
`withOpenToken(integration)` (an opened in-memory copy) so tokens stay sealed
in Temporal activity payloads and workflow history.

## Fork divergence from upstream

Baseline: tag `upstream-baseline-20260809` = upstream commit `7d08f5b6`
(2026-08-08). Remote `upstream` → gitroomhq/postiz-app. **Never push to
`upstream`.**

Merge strategy: `git fetch upstream && git merge <new upstream tag>` — new
files never conflict; expect conflicts only in the modified files below and
re-apply their one-line intents.

Modified upstream files (grouped, with why):

- **Compile fix:** `bluesky.provider.ts` (atproto thread union narrowing —
  upstream HEAD did not compile).
- **Crypto seams:** `integration.repository/service`, `posts.service`,
  `refresh.integration.service`, `post.activity`, `integrations.controller`,
  `public.integrations.controller`, `chat/tools/integration.trigger.tool`
  (seal-on-write / open-at-use).
- **Auth:** `auth.service` (single-use reset jti), `users.repository/service`
  (consume methods), `public.auth.middleware` (pub_ key branch + scope map,
  synthetic role ADMIN not SUPERADMIN).
- **Billing safety:** `stripe.controller` (replay ledger claim/release),
  `pricing.ts` (env-JSON entitlement overrides).
- **Registry/config:** `integration.manager` (capability payload + test
  provider registration), `configuration.checker` (+ secret strength,
  all-or-nothing groups), both `main.ts` (config checks, CONFIG_STRICT),
  `throttler.provider` (all /public/v1 buckets), `database.module`,
  `api.module` (new providers/controllers), `schema.prisma` (additive models),
  `package.json` (test scripts), `jest.config.ts` (was unrunnable @nx import),
  `.gitignore`, `next.config.js` (turbopack root), `proxy.ts` (public
  marketing paths).
- **Rebrand surface:** the `(app)` page-title/component sweep listed by
  `git diff upstream-baseline-20260809 --name-only -- apps/frontend`
  (brand module + honest copy replacements; upstream merge conflicts here are
  cosmetic and safe to re-resolve brand-side).
