# Disaster recovery

## Targets and priorities

Set contractual RPO/RTO before launch. The reference objective is a 15-minute
database RPO with PITR and a four-hour service RTO for a single-region loss.
Recovery order is secrets/network, databases, Temporal, Redis, object storage
access, backend, worker, then frontend. Keep outbound publishing disabled until
data and workflow consistency are checked.

## Total-region recovery

1. Declare the incident; freeze deploys and provider/manual retries.
2. Provision a clean network and restore app PostgreSQL and Temporal PostgreSQL
   to a mutually consistent timestamp where possible.
3. Restore/inject the exact prior `JWT_SECRET` and `ENCRYPTION_SECRET`; point to
   the replicated media bucket or restore it.
4. Deploy the same image revision that created the backup. Run
   `prisma migrate status`, then `migrate deploy` only if intentionally moving
   forward.
5. Start Redis and Temporal/visibility, then one backend with `RUN_CRON=false`,
   one worker, and the frontend behind an internal-only route.
6. Verify health, tenant isolation, token decryption, media, and Stripe replay
   ledger. Inspect publishing jobs around the outage window.
7. Reconcile `PROCESSING`/`outcome_unknown` destinations against provider
   accounts manually. Never bulk-retry ambiguous mutations.
8. Enable the missed-post reconciler, then customer traffic, then additional
   workers. Run one test-provider post before each real-provider canary.
9. Move DNS only after internal acceptance; reduce TTL in advance as part of
   normal readiness, not during the emergency.

## Database corruption or bad migration

Stop writers, snapshot the broken state for forensics, and restore into a new
database. Prefer a forward corrective migration for additive schema errors. Do
not use `migrate reset`, `db push --accept-data-loss`, or an unreviewed down SQL
script. Compare tenant/post/job counts and run authorization tests before
cutover.

## Lost Temporal state

Application PostgreSQL remains the content/job ledger, but in-flight workflow
timers are gone. Start a clean Temporal namespace, run the missed-post
reconciliation path, and compare every due `SCHEDULED/QUEUED/RETRYING` job with
provider state. Published and ambiguous jobs must not be replayed automatically.

## Lost encryption key

There is no recovery from ciphertext without the original
`ENCRYPTION_SECRET`. Keep content and account rows, revoke/blank unreadable
tokens through a reviewed maintenance script, notify affected tenants, and
require reconnect. Do not replace the key and pretend existing tokens remain
valid.

## Provider or credential compromise

1. Disable the provider in the deployment and stop its worker queue.
2. Rotate app secrets in the provider portal and environment manager.
3. Revoke affected user/app tokens through the provider where available.
4. Review audit, publishing, webhook, and provider logs without exposing token
   values.
5. Redeploy, connect a dedicated canary, and re-enable tenants gradually.

## Ransomware/account compromise

Revoke cloud sessions/API keys, isolate workloads, preserve evidence, rotate
infrastructure/provider/Stripe/email credentials from a clean device, and
restore into a separate account from immutable backups. Legal and customer
notification requirements depend on jurisdiction and data affected.

## Drill record

For every exercise record date, image/schema version, restore point, observed
RPO/RTO, object counts, test results, gaps, owner, and remediation deadline.
An untested backup is not a recovery plan.
