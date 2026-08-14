# Stage 8 evidence - controlled real-provider certification

Recorded: 2026-08-13 (America/New_York)

Decision: `DECISIONS.md`, ADR-033. The code and harness portion of Stage 8 is
complete. Real-provider certification is **NO-GO / externally blocked** because
the environment contains no designated canary API URL, credential, tenant,
integration, MP4, or attestation. No real post was triggered. Every tuple
remains `not_run`, `defaultEligible=false`, and customer-disabled.

## Delivered certification boundary

- `scripts/bulk-scheduler-canary.cjs` has only two explicit modes. `--preflight`
  is four authenticated reads. `--execute` additionally requires public HTTPS,
  a local MP4, unique evidence path, exact tuple/integration confirmation
  phrase, and the literal Publishly-owned/no-customer-data attestation.
- Preflight cross-checks `/users/self`, `/integrations/list`, the generated
  capability snapshot, and the server canary preflight. Tenant, exact visible
  destination label, provider, tuple, allowlists, connection health, matrix
  hash, immutable build revision, materializer state, and authoritative
  calendar state must agree before a write.
- Execution uses only campaign creation, native resumable chunks, processing,
  deterministic plan/reservation, short-horizon materialization, the normal
  V109 Post, publishing job, receipts, attempts, and issues APIs. It creates one
  asset x one destination = one job. It never calls an adapter or retry route.
- `GET /bulk/scheduler/canary/preflight` returns no connection credential.
  `GET /posts/:id/publishing-job` returns bounded safe attempt and
  private-fetch evidence but omits activity keys, mutation fingerprints,
  sealed attempt evidence, grant identities/capabilities, and storage keys.
  Count projections make any truncated evidence page fail certification.
- A pass requires campaign and publishing states `PUBLISHED`, durable
  `confirmed_live`, provider ID/URL, the tuple's exact confirmation method, a
  resolved attempt ledger, no open issue, and no silent terminal outcome.
  `sent` or HTTP `2xx` is explicitly rejected.
- An ambiguous mutation is accepted only if same-attempt provider readback
  durably records `CONFIRMED`; proof-backed `ABSENT` may precede a later
  accepted mutation. `STARTED`, unresolved `AMBIGUOUS`, or `NEEDS_REVIEW`
  blocks certification and is never blindly retried.
- Provider-pull certification additionally requires a matching job-scoped
  grant with a classified served GET and positive bytes, with no failed,
  rejected, or unresolved fetch event. This proves the advertised private
  provider transport, not just a final platform post.
- Evidence is exclusive-create JSON and is recursively redacted for auth,
  cookies, tokens, secrets, capabilities, storage keys, private URLs,
  signatures, and provider-media capabilities, then scanned again before
  write. A redaction failure aborts certification.
- `PUBLISHLY_BUILD_REVISION` is required by production preflight. Canary mode
  is rejected unless the exact internally complete tuple is allowlisted, the
  materializer is enabled, private storage is isolated, and calendar
  enforcement is authoritative.

## Provider-media defect found before canary

The Stage 8 audit found that provider-pull URLs ended at the opaque capability.
Instagram's existing adapter determines video/image from a `.mp4` extension
before fetching, so the URL could be misclassified even though its response
would later have `video/mp4`. Provider-facing URLs now end in
`/<capability>/video.mp4`; the backend accepts both the new route and the
legacy capability-only route for in-flight compatibility. Capability parsing,
logging redaction, range behavior, and expiry/fetch policy remain unchanged.

## Tests and exact results

```text
> pnpm exec jest --selectProjects unit --runInBand \
    libraries/helpers/src/bulk-scheduler/bulk-canary-harness.spec.ts \
    apps/backend/src/api/routes/bulk-import.canary.spec.ts \
    libraries/nestjs-libraries/src/database/prisma/bulk-scheduler/provider-media.service.spec.ts \
    libraries/helpers/src/bulk-scheduler/provider-media.contract.spec.ts

Test Suites: 4 passed, 4 total
Tests:       38 passed, 38 total
Snapshots:   0 total
```

The harness cases cover: no confirmation/no request, label mismatch/read-only
requests, build mismatch/no campaign, `sent` rejection, resolved versus
unresolved ambiguity, `NEEDS_REVIEW` with no retry call, exact confirmed-live
success, provider-pull fetch proof, redaction/leak rejection, and execution
HTTPS. Controller cases cover non-secret success, wrong provider, and
cross-tenant not-found behavior.

Final full validation is shared with Stage 7: 102/102 unit suites (725 tests),
9/9 integration suites (49 tests), all three typechecks, full lint,
architecture guard, 27-migration status/fresh chain, and all three production
builds passed after the bounded evidence and ambiguity refinements.

## External blocker and unedited fail-closed proof

No `BULK_CANARY_*` environment variable was present. The documented command
stopped before any HTTP request:

```text
> pnpm canary:bulk-scheduler -- --preflight
{
  "verdict": "FAIL",
  "code": "canary_input_missing",
  "reason": "BULK_CANARY_API_BASE_URL is required for this canary mode.",
  "evidenceFile": null
}
CANARY_PREFLIGHT_EXIT=1
```

The exact inputs and commands are in
`docs/BULK_SCHEDULER_CANARY.md`. Supplying them is an external operator action:
the account must be provider-owned, designated for testing, and contain no
customer data. A customer connection may not substitute.

## Capability verdict

`instagram.professional.reel.video` is the only canary candidate because it is
the only row with adapter, private transport, confirmation, and ambiguity
recovery implemented. It remains **uncertified and disabled** until a controlled
real Instagram canary writes a reviewed `PASS` artifact. The other eight rows
lack ambiguity recovery and remain disabled without even canary eligibility.

No matrix row was edited by the harness. After an independently reviewed pass,
certification evidence and default customer rollout are separate reviewed
changes. The global and every per-tuple kill switch remain permanent.

## Content-addressed checkpoint

Because the shared worktree already contained extensive unrelated user work,
the clean Stage 8 checkpoint is the scoped 27-file SHA-256 manifest at
`docs/evidence/bulk-scheduler/STAGE_8_CHECKPOINT.sha256`. Its verification
checked all 27 entries with zero mismatches.

## Rollback

Set the tuple kill switch (or `BULK_SCHEDULER_KILL_ALL=true`), set
`BULK_SCHEDULER_MATERIALIZER_ENABLED=false`, revoke provider-media grants if
transport is involved, pause affected campaigns, and retain all campaign,
issue, reservation, attempt, receipt, grant, and fetch evidence. Do not delete
or retry a possibly accepted canary until provider readback proves absence.
