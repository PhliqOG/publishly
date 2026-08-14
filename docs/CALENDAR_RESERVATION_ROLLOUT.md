# Calendar reservation ledger rollout

`CalendarReservation` is the database authority for account calendar slots.
Stage 4 installed it in shadow mode; Stage 5 routes every production `Post`
writer through a dual-write/cutover gate. Redis
and Temporal may transport IDs, but neither may own a slot.

## States and invariants

- `SHADOW / COMMITTED`: a legacy post mirror; it never blocks another row.
- `SHADOW / CONFLICTED`: multiple legacy root posts already use the same
  tenant, account, and UTC instant. Every affected row remains visible with
  `legacy_slot_conflict` and a reason.
- `AUTHORITATIVE / HELD`: owns a slot until its lease expires.
- `AUTHORITATIVE / COMMITTED`: owns a slot without a lease.
- `RELEASED` and `CANCELLED`: terminal history retained but no longer owns the
  slot.
- `CONFLICTED`: terminal, durable outcome; never a silently skipped item.

Only authoritative `HELD` and `COMMITTED` rows participate in the partial
unique slot index. Acquisition also takes a transaction advisory lock derived
from tenant + connection + UTC instant, expires abandoned holds, rechecks the
slot, and then inserts. Idempotency is tenant-scoped; changed intent under an
existing key fails explicitly.

Every row stores UTC plus the original timezone, local wall-clock value,
offset, and optional DST fold. Legacy posts are honestly marked as UTC because
their original local intent cannot be reconstructed. Published and manually
pinned reservations cannot be released by ordinary replanning.

`ownerRevision` orders immutable slot intents. `revision` is only the
optimistic row version. Keeping them separate allows an old intent to become
`RELEASED` without colliding with the next owner intent.

## Shadow backfill

For each tenant:

1. Keep `CALENDAR_RESERVATION_SHADOW_ENABLED=true` and
   `CALENDAR_RESERVATION_ENFORCEMENT=false`.
2. `POST /api/calendar/reservations/backfill/batches?limit=500` repeatedly.
   The first call records a fixed `(createdAt,id)` high watermark. Each call
   processes a bounded keyset page and can be replayed safely.
3. When `GET /api/calendar/reservations/backfill` reports `VERIFYING`, call
   `POST /api/calendar/reservations/backfill/verify`.
4. Require `VERIFIED`, `mismatchCount=0`, and investigate every classified
   legacy conflict. A post created after the fixed watermark is not fabricated
   into that snapshot; Stage 5 shadow writes cover ongoing mutations.
5. Keep writers in shadow mode for the soak. Every create, edit, import,
   autopost, generated draft, fleet distribution, MCP/API call, reschedule,
   and cancellation now crosses `PostCalendarWriterService` before dispatch.
   Connection replacement/deletion, workspace erasure, Meta erasure, and
   composer group retirement use the same transaction-level reservation
   cancellation primitive; pinned/published history is not erased by ordinary
   retirement.
6. Promote verified rows in bounded pages with
   `POST /api/calendar/reservations/authority/batches?limit=250`. Repeat until
   `activated=true`. The final batch rechecks every live root Post against an
   exact authoritative tenant/account/instant row while holding the tenant
   cutover lock. Each promotion also requires an exact shadow row for that
   tenant/Post/account/instant. Missing shadow proof is retained as
   `calendar_writer_shadow_missing`; slot conflicts are retained as
   `calendar_slot_conflict`. Both prevent activation until repaired.
7. Set `CALENDAR_RESERVATION_ENFORCEMENT=true`. For a bounded rollout, also set
   `CALENDAR_RESERVATION_ENFORCED_TENANTS` to a comma-separated tenant ID list.
   Non-selected tenants continue shadow dual-write. An empty list means all
   tenants; do that only after all active tenants show `authorityActivatedAt`.
8. Run `pnpm run verify:calendar-writers` in CI and deployment validation. It
   must pass; do not allowlist a new writer without routing it through the
   service and adding conflict/failure tests.

A new batch request after `FAILED` restarts keyset scanning from the same fixed
high watermark. Existing deterministic rows replay, missing rows are inserted,
and verification must pass again; the restart never widens the snapshot.

Reads use `GET /api/calendar/reservations` with bounded cursor pagination and
optional `mode`/`state` filters. Never load a fleet calendar unbounded.

## Metrics and alerts

Monitor:

- `calendar_reservation_created`, `_replayed`, `_conflicted`, and
  `_transitioned`;
- `calendar_reservation_ledger_failed` (page immediately on any sustained
  occurrence; callers must not create posts after it);
- `calendar_backfill_rows_scanned`, `_inserted`, `_verified`, and `_failed`;
- `calendar_writer_finalized` and `calendar_writer_failed` by mode/code;
- `calendar_retirement_ledger_failed` (page immediately; the surrounding
  source mutation is rolled back and safe to retry);
- `calendar_authority_rows_promoted`,
  `calendar_authority_promotion_conflicted`, and
  `calendar_authority_activated`;
- held leases past expiry, backfills in `RUNNING` over 30 minutes, backfills in
  `VERIFYING` over 15 minutes, any `FAILED` verification, and conflict rate by
  tenant/account without using content as labels.

Audit actions record reservation creation/conflict/transition and backfill
start/verification. Codes and human reasons are stored on the authoritative
rows; logs are additional diagnostics, not state.

## Rollback

1. Remove affected IDs from `CALENDAR_RESERVATION_ENFORCED_TENANTS`, or set
   `CALENDAR_RESERVATION_ENFORCEMENT=false` globally. Writers immediately use
   shadow dual-write; a real shadow mutation invalidates the tenant activation
   marker so authority must be caught up again before re-enabling.
2. Set `CALENDAR_RESERVATION_KILL_ALL=true` only for a ledger incident; callers
   fail classified and must not fall back to direct calendar writes.
3. Pause campaign planners/materializers. Preserve reservation and audit rows.
4. Revert application routing if necessary; retain the additive migration.
   Schema removal requires a reviewed forward migration after backup and
   retention review.

Never “recover” by disabling the guard and writing `Post.publishDate` directly.
The global rollback switch remains after launch.
