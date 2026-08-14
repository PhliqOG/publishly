# Bulk Scheduler real-provider canary

This is the only path that can certify a Bulk Scheduler capability tuple. It
uses the authenticated campaign, resumable upload, authoritative reservation,
short-horizon materializer, and V109 publishing paths. It does not call an
adapter directly. Provider mocks, Test Provider runs, HTTP `2xx`, and `sent`
receipts are not certification.

The CLI defaults to no action unless exactly one of `--preflight` or
`--execute` is supplied. Preflight performs four authenticated `GET` requests.
Execution cannot begin unless the exact confirmation phrase and the
provider-test-account attestation are both present.

## Server-side canary window

Deploy the exact image that passed the mandatory Stage 7 gates. Set an
immutable build identity and restrict both allowlists to Publishly-owned test
resources:

```text
PUBLISHLY_BUILD_REVISION=<exact-git-sha-or-image-digest>
BULK_SCHEDULER_KILL_ALL=false
BULK_SCHEDULER_CANARY_MODE=true
BULK_SCHEDULER_CANARY_TUPLES=instagram.professional.reel.video
BULK_SCHEDULER_CANARY_INTEGRATIONS=<publishly-owned-test-integration-id>
BULK_SCHEDULER_MATERIALIZER_ENABLED=true
CALENDAR_RESERVATION_SHADOW_ENABLED=true
CALENDAR_RESERVATION_ENFORCEMENT=true
CALENDAR_RESERVATION_ENFORCED_TENANTS=<publishly-canary-organization-id>
```

The canary tenant must already have a verified calendar backfill and an
activated authoritative watermark. Configure the private storage and provider
media variables in [PRIVATE_PROVIDER_MEDIA.md](PRIVATE_PROVIDER_MEDIA.md).
`PROVIDER_MEDIA_BASE_URL` must be public HTTPS and reach the same backend
revision. Never add a customer integration ID to the canary allowlist.

Run the production environment verifier before opening the window:

```bash
pnpm run verify:production -- .env.production
```

## Operator inputs

Use a dedicated test-only user with Bulk Tools permission in the designated
organization. Keep these values in the operator shell or secret manager; never
write them to a checked-in env file or command transcript:

```text
BULK_CANARY_API_BASE_URL=https://<host>/api
BULK_CANARY_AUTH_TOKEN=<test-user-session-jwt>
BULK_CANARY_ORGANIZATION_ID=<publishly-canary-organization-id>
BULK_CANARY_TUPLE_ID=instagram.professional.reel.video
BULK_CANARY_INTEGRATION_ID=<publishly-owned-test-integration-id>
BULK_CANARY_EXPECTED_DESTINATION_LABEL=<exact-visible-provider-account-name>
BULK_CANARY_EXPECTED_BUILD_REVISION=<exact-git-sha-or-image-digest>
```

The API base includes `/api`. The selected local MP4 must be non-sensitive,
small, valid, and safe to leave visible on the provider test account until the
evidence review is complete.

## Read-only preflight

```bash
pnpm canary:bulk-scheduler -- --preflight
```

Preflight fails unless all of the following agree: authenticated tenant,
integration ID and exact label, provider, tuple matrix row, per-integration
canary decision, build revision, matrix hash, connection health, materializer,
and authoritative calendar writer. It also verifies that the row is still
customer-disabled and has implemented adapter, private transport, provider
confirmation, and ambiguity recovery prerequisites.

## Explicit one-post execution

Only after reviewing preflight, add:

```text
BULK_CANARY_MEDIA_FILE=/absolute/path/to/non-sensitive-canary.mp4
BULK_CANARY_EVIDENCE_FILE=/absolute/path/to/stage8-instagram-reel-<git-sha>.json
BULK_CANARY_ACCOUNT_ATTESTATION=publishly-owned-test-account-no-customer-data
BULK_CANARY_CONFIRM=publishly-real-canary:instagram.professional.reel.video:<publishly-owned-test-integration-id>
```

Then run:

```bash
pnpm canary:bulk-scheduler -- --execute
```

Execution creates exactly one campaign, native upload, asset, destination,
reservation, campaign job, Post, and V109 PublishingJob. It never invokes the
per-item retry endpoint and never converts `NEEDS_REVIEW` into retryable work.
The CLI does not automatically cancel or delete evidence after a failure,
because doing so could hide an accepted provider mutation. Inspect the ledgers
first. Delete the visible canary post through the designated provider test
account only after evidence capture.

## Passing evidence

A `PASS` artifact requires all of these from the same exact run:

- expansion is `1 asset x 1 destination = 1 job`, with zero overflow;
- one committed authoritative reservation and one materialized V109 job;
- campaign job and PublishingJob are both `PUBLISHED`;
- the latest stage and a durable receipt are `confirmed_live`;
- provider post ID, public provider URL, and the tuple's exact confirmation
  method are present;
- at least one accepted durable V109 mutation attempt exists and no attempt is
  `STARTED`, `AMBIGUOUS`, or `NEEDS_REVIEW`;
- for provider-pull tuples, a matching grant records at least one classified
  served `GET` with positive bytes and no failed, rejected, or unresolved
  fetch event;
- no unresolved campaign issue remains.

The JSON artifact contains the matrix hash, build revision, non-secret
destination identity, run marker, media SHA-256, campaign/upload/asset/job/Post
IDs, reservation and lifecycle evidence, attempts, receipts, confirmation,
and safe provider-fetch metadata. Credentials, grant capabilities, private
URLs, signatures, and tokens are redacted and checked again before the file is
written. Evidence files use exclusive creation so reruns cannot overwrite an
earlier result.

A passing artifact does not edit the capability matrix. Review the provider
post and artifact independently, then make a reviewed change for only that
exact tuple: first `certificationStatus=certified` with its immutable evidence
path, and separately `defaultEligible=true` for rollout. Keep the global and
tuple kill switches permanently.

## Failure and rollback

Any failure is NO-GO. Preserve the classified artifact and ledgers. If a
provider result is ambiguous, leave the item `NEEDS_REVIEW`; provider readback
must prove confirmed or absent before any retry. For immediate rollback:

1. set the tuple kill switch, or `BULK_SCHEDULER_KILL_ALL=true` for a broad
   incident;
2. set `BULK_SCHEDULER_MATERIALIZER_ENABLED=false` to stop new materialization;
3. revoke outstanding provider-media grants if transport is implicated;
4. pause the canary campaign while retaining campaign, reservation, attempt,
   receipt, issue, grant, and fetch ledgers;
5. leave every matrix row disabled until a new exact-revision canary passes.

