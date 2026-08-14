# Environment configuration

`.env.example` is the exhaustive annotated reference.
`.env.production.example` is the deployment template. Never commit populated
environment files; inject them from a secret manager or an operator-owned file
with restrictive permissions.

## Required core

| Variable                                 | Meaning                                                       |
| ---------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                           | PostgreSQL connection string for tenant/application data      |
| `REDIS_URL`                              | Redis connection for OAuth state, cache, locks, and limits    |
| `TEMPORAL_ADDRESS`                       | Temporal frontend address (`temporal:7233` in compose)        |
| `TEMPORAL_NAMESPACE`                     | Temporal namespace, normally `default`                        |
| `WORKER_DEFAULT_ACTIVITY_CONCURRENCY`    | Per-queue activity cap; defaults to `32`, bounded at `256`    |
| `WORKER_DEFAULT_WORKFLOW_CONCURRENCY`    | Per-queue workflow-task cap; defaults to `8`, bounded at `64` |
| `WORKER_ACTIVITY_POLLS`                  | Per-queue activity pollers; defaults to `4`                   |
| `WORKER_WORKFLOW_POLLS`                  | Per-queue workflow pollers; defaults to `4`                   |
| `ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS` | Readiness heartbeat age; defaults to `180` seconds            |
| `JWT_SECRET`                             | at least 32 random characters; session/reset signing          |
| `ENCRYPTION_SECRET`                      | different high-entropy key for provider-token sealing         |
| `FRONTEND_URL`                           | exact public app origin, no trailing slash                    |
| `MAIN_URL`                               | canonical marketing/app origin, no trailing slash             |
| `NEXT_PUBLIC_BACKEND_URL`                | browser-visible API base; build-time for frontend             |
| `BACKEND_INTERNAL_URL`                   | service-network API base used by server code                  |
| `IS_GENERAL`                             | `true` for the commercial multi-user application              |
| `CONFIG_STRICT`                          | set `true` in production so invalid groups refuse boot        |

## Public legal and reviewer identity

These values are compiled into the public legal pages. Use the exact identity
shown in the provider portals and do not abbreviate it differently between
submissions:

- `NEXT_PUBLIC_LEGAL_ENTITY_NAME`
- `NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS`
- `NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE` in `YYYY-MM-DD` form
- `NEXT_PUBLIC_GOVERNING_LAW`
- `NEXT_PUBLIC_PRIVACY_EMAIL`
- `NEXT_PUBLIC_SUPPORT_EMAIL`

Optional `AGENCY_REVIEW_EMAIL` receives agency-directory review requests. If
unset, Publishly uses the support or transactional sender address; it never
sends customer submissions to an upstream project address.

Production verification rejects missing/example values. Because they are
`NEXT_PUBLIC_*` build arguments, changing them requires rebuilding the frontend
image. Serve `/privacy`, `/terms`, `/acceptable-use`, `/data-deletion`, and
`/platform-review` without authentication before submitting any review.

Generate separate 64-byte secrets, for example `openssl rand -base64 64`.
Changing `ENCRYPTION_SECRET` without a key-ring migration makes existing social
tokens unreadable and requires every channel to reconnect.

## Storage

Production should set `STORAGE_PROVIDER=s3` and provide:

- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_PUBLIC_URL`
- `S3_ENDPOINT` when the service is not standard AWS S3
- `S3_FORCE_PATH_STYLE=true` for MinIO/services that require it

The principal needs least-privilege object get/put/delete and multipart actions
for one bucket/prefix. Configure bucket CORS for the production app origin and
`GET, HEAD, PUT, POST`; expose only the media origin, not bucket listing. Add a
bucket lifecycle rule that aborts incomplete multipart uploads after 1–7 days.
`REMOTE_MEDIA_MAX_BYTES` bounds server-side URL ingestion and
`MEDIA_DELETE_RETENTION_DAYS` controls delayed physical cleanup.

Local development can use `STORAGE_PROVIDER=local`, an absolute
`UPLOAD_DIRECTORY`, and `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY`.

## Bulk Scheduler certification controls

`PUBLISHLY_BUILD_REVISION` is required in production and must be an immutable
git SHA or image digest. The authenticated canary preflight exposes it so an
operator cannot certify code other than the revision whose internal gates
passed.

Bulk Scheduler stays fail-closed through `BULK_SCHEDULER_KILL_ALL`, every
matrix row's generated tuple kill switch, certification state, and default
eligibility. A real-provider canary additionally needs
`BULK_SCHEDULER_CANARY_MODE`, exact tuple and integration allowlists,
`BULK_SCHEDULER_MATERIALIZER_ENABLED=true`, and authoritative calendar
enforcement for a verified test tenant. The production verifier rejects an
unknown/incomplete canary tuple, disabled materializer, non-authoritative
calendar configuration, public/private bucket reuse, or incomplete private
transport configuration.

CLI-only `BULK_CANARY_*` values are documented in
[BULK_SCHEDULER_CANARY.md](BULK_SCHEDULER_CANARY.md). They belong in the
operator process, not backend/frontend/worker environment files. In particular,
never place the canary session JWT or confirmation phrase in application logs,
CI artifacts, or source control.

## Transactional email

Choose one:

- Resend: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`,
  `EMAIL_FROM_NAME`;
- SMTP: `EMAIL_PROVIDER=nodemailer`, `EMAIL_HOST`, `EMAIL_PORT`,
  `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, plus from address/name.

Without a provider, local accounts activate immediately and password/activation
mail cannot be delivered. Production launch requires a verified sending domain,
SPF, DKIM, and DMARC.

## Stripe

Provide the all-or-none core group:

- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_SIGNING_KEY` for `POST /stripe`

Optional: `STRIPE_SIGNING_KEY_CONNECT`, `STRIPE_DISCOUNT_ID`, and `FEE_AMOUNT`.
Publishly resolves or creates one Product and monthly/yearly Price per paid tier
from the authoritative server catalog when checkout is first opened; legacy
lookup keys are not required. Open every plan in Stripe test mode before live
mode and confirm its amount, interval, tax behavior, trial, portal, and invoice.
`PRICING_OVERRIDES_JSON` can override validated server-side prices and
entitlements such as channels, workspaces, seats, storage, retention, API,
webhooks, and bulk tools. Apply price changes deliberately: Stripe Prices are
immutable, so Publishly creates a new matching Price and leaves historical
subscriptions attached to their original Price until changed.

## Social provider credential groups

Each row is atomic: set every variable in the row or none. Partial groups are a
configuration error. Exact redirect URLs are documented in
[PLATFORM_INTEGRATIONS.md](PLATFORM_INTEGRATIONS.md).

| Provider                                | Variables                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Facebook Pages + Instagram via Facebook | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`; `META_GRAPH_VERSION=v25.0`                             |
| Instagram Login                         | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`                                                       |
| Threads                                 | `THREADS_APP_ID`, `THREADS_APP_SECRET`                                                           |
| TikTok                                  | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`                                                       |
| YouTube                                 | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`                                                     |
| X                                       | `X_API_KEY`, `X_API_SECRET`; optional `X_URL`, `DISABLE_X_ANALYTICS`, `STRIP_LINKS_FROM_X_POSTS` |
| LinkedIn member/page                    | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`                                                   |
| Pinterest                               | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`                                                 |
| Mastodon                                | None; a scoped OAuth app is registered dynamically on each user-selected instance                |
| Google Business Profile                 | `GOOGLE_GMB_CLIENT_ID`, `GOOGLE_GMB_CLIENT_SECRET`                                               |
| Reddit                                  | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`                                                       |
| Discord                                 | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN_ID`                             |
| Slack                                   | `SLACK_ID`, `SLACK_SECRET`; `SLACK_SIGNING_SECRET` if Slack events are enabled                   |
| Telegram                                | `TELEGRAM_TOKEN`, `TELEGRAM_BOT_NAME`                                                            |
| Skool (optional extension adapter)       | `EXTENSION_ID`, `NEXT_PUBLIC_CHROME_EXTENSION_URL`; disabled unless both reference a reviewed Publishly extension |

Bluesky uses per-user app passwords and needs no server credential. Several
preserved providers accept per-connection credentials; see `.env.example` for
the full upstream list.

When TikTok is in `PUBLISHLY_REQUIRED_PROVIDERS`, production also requires
`TIKTOK_MEDIA_URL_PREFIX_VERIFIED=true`. Set it only after TikTok has accepted
the exact HTTPS media host/path prefix used by `S3_PUBLIC_URL`; it is an
operator attestation, not a bypass. Exact reviewed scopes and callbacks are in
`data/provider-approval-manifest.json`; the submission runbook is
[APPROVAL_AND_LAUNCH.md](APPROVAL_AND_LAUNCH.md).

## Authentication providers

Dashboard social login can use `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` or the
`POSTIZ_OAUTH_*` generic OIDC group. These are separate from social publishing
connections. Local email/password auth remains available unless registration is
disabled.

## Optional integrations and observability

- AI: `OPENAI_API_KEY` and provider-specific optional keys. Missing keys disable
  or return actionable 503 responses; they do not block core scheduling.
- Sentry: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
  `SENTRY_PROJECT`.
- Product analytics: `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_POSTHOG_KEY`,
  optional GTM/pixel variables. Do not enable until consent/privacy review.
- Brand: `NEXT_PUBLIC_BRAND_NAME=Publishly`, `NEXT_PUBLIC_SOURCE_URL`,
  `NEXT_PUBLIC_SUPPORT_EMAIL`.
- Public API: `API_LIMIT`; keep `ALLOW_LEGACY_API_KEYS=false`.
- Browser extension: optional compatibility channels stay disabled unless
  `EXTENSION_ID` and `NEXT_PUBLIC_CHROME_EXTENSION_URL` identify a separately
  reviewed Publishly extension whose origin allowlist contains the production
  domain. Publishly never falls back to an upstream product's extension.

## Development-only switches

`ENABLE_TEST_PROVIDER`, `TEST_PROVIDER_MODE`, `TEST_PROVIDER_FAIL_TIMES`,
`TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES`, and `TEST_PROVIDER_SINK` exist for
automated publishing tests. Never enable the test provider in production.
`NOT_SECURED=true` relaxes cookie behavior for local HTTP only and must never be
set in production.

## Validation

```bash
pnpm run verify:production -- .env.production
pnpm run prisma-validate
pnpm run prisma-migrate-status
docker compose --env-file .env.production \
  -f deploy/compose.production.yaml config --quiet
```

`verify:production` is the release gate, while Compose validation only checks
YAML interpolation. The command never prints secret values. It also checks
that `PUBLISHLY_REQUIRED_PROVIDERS` has credentials for every network included
in the intended website launch set, that Stripe uses live-mode keys, and that
registration remains open for the public “Get started free” CTA. The command
first runs `verify:providers`, which rejects manifest/scope/callback drift and
review-critical security or legal regressions.

At boot, provider discovery reports `configured=false` and `missingEnv` for
credential groups that are intentionally absent. With `CONFIG_STRICT=true`,
weak core secrets, partial groups, or incomplete selected storage/billing
configuration stop startup.
