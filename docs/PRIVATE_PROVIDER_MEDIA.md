# Private provider media transport

Bulk Scheduler assets never use the public `Media.path` pipeline. `BulkAsset`
stores tenant-scoped metadata and a private storage key; video bytes live in a
separate non-public bucket or, for local development only, a directory outside
the public upload root. A provider receives either an internal direct-upload
stream or a short-lived, job-scoped Publishly capability URL. Direct-upload
adapters also authenticate each fetch with a backend/orchestrator-only header;
the capability URL alone is insufficient for that transport. Publishly never
redirects that URL to object storage.

Exact transport and fetch behavior is generated from
`data/bulk-scheduler-capabilities.json`. Provider-pull rows may permit repeated
HEAD, GET, and byte-range requests until their tuple-specific TTL expires.
Direct-upload rows never receive an external capability. Transport readiness
does not certify a tuple or make it customer-visible.

## Production prerequisites

When canary mode is enabled, or after any tuple becomes default eligible, the
backend and production preflight require:

- `PROVIDER_MEDIA_BASE_URL`: public HTTPS backend origin (normally
  `https://<domain>/api`) with no credentials, query, fragment, or trailing
  slash;
- `BULK_PRIVATE_INTERNAL_TOKEN`: an independent random secret of at least 32
  characters, available only to the backend and orchestrator processes (never
  to the browser or a provider);
- `BULK_PRIVATE_STORAGE_PROVIDER=s3` or `cloudflare`;
- a `BULK_PRIVATE_S3_BUCKET` different from the public media bucket;
- private bucket credentials and region in the corresponding
  `BULK_PRIVATE_S3_*` variables;
- `BULK_SCHEDULER_CANARY_TUPLES` naming exact matrix rows while canary mode is
  active.

The bucket policy must deny anonymous reads, public ACLs, and public bucket
policies. Grant the backend identity only object read/write/delete within the
Bulk Scheduler prefix. Enable encryption at rest, versioning or an equivalent
recovery control, incomplete multipart cleanup, and a retention policy aligned
with campaign deletion. Do not put a CDN public origin in front of the bucket.

The reverse proxy may expose
`/api/provider-media/<capability>/video.mp4` to provider fetchers. The explicit
filename is required because existing adapters classify media before fetching;
the legacy capability-only route remains only for in-flight compatibility.
The proxy must disable caching and redact the capability path segment in access,
firewall, tracing, and error logs. Strip the internal adapter header at any
external observability/export boundary and never forward it to a provider.
Preserve GET, HEAD, `Range`, `Content-Range`, and 206 responses. Rate-limit by a
non-secret edge request identity/IP and route class; never make the raw URL a
metric label.

Run before enabling canary mode:

```text
node scripts/verify-production-env.cjs .env.production
node scripts/generate-bulk-scheduler-capabilities.mjs --check
node node_modules/prisma/build/index.js migrate status --schema libraries/nestjs-libraries/src/database/prisma/schema.prisma
```

## Failure visibility and alerts

Every known grant fetch is persisted in `ProviderMediaFetchEvent` as
`AUTHORIZED`, then `SERVED`, `REJECTED`, or `FAILED`, with a stable code and
human reason. Logs and metrics contain grant/job/asset identifiers or a
one-way capability fingerprint, never the capability, storage key, object URL,
or provider token.

Alert on:

- any `provider_media_fetch_ledger_failed` event;
- `provider_media_fetch_failed` above 1% for five minutes or any sustained
  private-storage 5xx response;
- authorized fetch events not completed within five minutes;
- expired/revoked/tampered rejection spikes by tuple (never by URL);
- private-media egress saturation, open-file exhaustion, or provider fetch
  latency above the shortest tuple TTL.

An unknown or malformed capability cannot be associated safely with a tenant,
so it produces a redacted structured rejection but no fabricated tenant row.
Known tampered, expired, revoked, over-limit, invalid-range, and storage-failed
requests are durable.

## Rollback and incident response

1. Set `BULK_SCHEDULER_KILL_ALL=true` to prevent new grants and reject active
   tuple access.
2. Revoke grants for affected job IDs through the tenant-scoped repository path.
3. Pause campaign materialization/dispatch; do not delete asset, grant, or fetch
   ledgers during an incident.
4. If credentials may be exposed, rotate the private storage identity and
   invalidate edge caches (which should already be disabled). Stored
   capabilities are hashes and cannot be replayed from the database.
5. Revert application code if needed while retaining the additive migration;
   schema removal is a reviewed forward migration after backup/retention review.

Keep the global and per-tuple kill switches after launch. A passed canary does
not remove rollback controls.
