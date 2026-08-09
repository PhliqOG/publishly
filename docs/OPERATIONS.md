# Operations

## Health

| Probe | What it checks | Healthy |
| --- | --- | --- |
| `GET <backend>/health` | Postgres query + Redis PING (2.5 s timeouts) | 200 `{status:"ok"}`; 503 lists the failing check |
| `GET <orchestrator>:3002/health/status` | live Temporal `describeNamespace` | 200 |
| Temporal UI `:8082` (dev) | workflow-level truth | inspect `post_<postId>` |

First backend boot after a deploy takes 2–3 minutes before it listens (large
module graph) — health timing out during that window is normal; crash output
lands at the end of the app log.

Dev logs: `.building/logs/` — `app-backend.log`, `app-orchestrator.log`,
`frontend.log`, `tsc-backend.log` (compiler watch). Nest logs are ANSI-colored;
strip with `sed -e 's/\x1b\[[0-9;]*m//g'` before grepping for `error TS` etc.

## Posts stuck in QUEUE

1. Is the orchestrator worker up? `app-orchestrator.log` should show worker
   registration, not `Webpack finished with errors` (that error = the
   orchestrator was built with plain tsc; rebuild with `nest build` — see
   DEPLOYMENT.md).
2. Temporal UI → search workflow id `post_<postId>`. No workflow → scheduling
   never reached Temporal (backend log). Failed activity → the error and its
   provider body are recorded on the workflow and in the `Errors` table +
   in-app notification.
3. The hourly sweeper (`missingPostWorkflow`, registered when a backend runs
   with `RUN_CRON`) re-queues posts whose slot passed >3 h ago; after an
   outage, waiting one sweep cycle usually self-heals the backlog.

## Provider 401s / refresh loops

Expired tokens: the pipeline refreshes automatically (`refreshToken` →
re-seal + retry once). A channel that cannot refresh gets `refreshNeeded=true`,
an in-app notification, and shows disconnected in the UI — the fix is always
the user reconnecting the channel. Look for `RefreshToken` failures in the
workflow history; never hand-edit token columns (they are sealed —
`v2:` prefix).

## Elasticsearch down

Symptoms: Temporal visibility queries fail; on boot the apps may fail
registering search attributes (`cannot have more than 3 search attribute of
type Text` means the server fell back to SQL visibility — ES misconfigured).
Restore ES, restart the temporal container, then the apps.

## Stripe webhooks

Signature failures → check `STRIPE_SIGNING_KEY` matches the endpoint secret.
Duplicate deliveries are absorbed by the replay ledger
(`ProcessedWebhookEvent`); a handler exception releases the claim so Stripe's
retry can succeed. Prune old rows periodically
(`WebhookEventLedgerService.cleanup(30)`).

## Bulk imports

Lifecycle: `validating → preview → processing → completed |
completed_with_errors | failed`. The per-row report (`GET /bulk/import/:id`)
says exactly why any row was rejected (structure at preview, full provider
validation at commit). Processing is in-process on the backend: a backend
restart mid-processing leaves the import in `processing` — re-commit is not
possible by design; re-upload the remainder (rows already created are in the
calendar).

## Audit logs

Settings → Audit log (org admins), or `GET /audit-logs?page=&action=&userId=`.
Writes are fire-and-forget; absence of an expected entry with a
`Audit log write failed` warning in the backend log means a DB hiccup, not a
silent action.

## Test provider (demos without credentials)

`ENABLE_TEST_PROVIDER=true` registers the internal sandbox channel: connect it
like a real network (the OAuth hop loops straight back), schedule to it, watch
the full pipeline run, try the inbox. Knobs: `TEST_PROVIDER_MODE=pending`
(exercise finalize path), `TEST_PROVIDER_FAIL_TIMES=n` (retry behavior),
`TEST_PROVIDER_SINK=<file>` (side-effect journal). **Keep it off in
production** — it is a publish-to-nowhere channel that would confuse users and
pollute quotas; the flag defaults off and the provider is simply absent
without it.

## Windows development caveats

- Antivirus makes installs/compiles slow (17-minute pnpm install is normal);
  exempt the repo directory if policy allows.
- Don't run `nest start --watch` for backend/orchestrator (silent no-spawn,
  taskkill races) — use the compile+run split from the README.
- A stray `pnpm-workspace.yaml` in a parent directory hijacks Next's inferred
  workspace root; `next.config.js` pins `turbopack.root` to the repo.
- Keep ~15 GB free: node_modules (~5 GB), Docker images (~2.5 GB incl. ES),
  Next/Turbopack caches.
