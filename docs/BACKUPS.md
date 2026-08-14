# Backups

## Protection set

Back up all four durable classes; none replaces another:

1. application PostgreSQL: users, workspaces, content, connections (sealed),
   billing state, jobs, analytics, inbox, keys, and audit logs;
2. S3-compatible media bucket, including generated thumbnails;
3. Temporal PostgreSQL: workflow histories and timers for in-flight schedules;
4. deployment configuration and secrets, encrypted separately from database
   backups.

Redis is primarily cache/lock/OAuth state. The reference deployment enables AOF
and snapshots, but recovery must not depend on Redis as the source of tenant or
publishing truth. Elasticsearch is Temporal visibility/index data and can be
rebuilt from the Temporal persistence database; protect it if faster recovery
matters.

## Recommended policy

Adjust to contractual RPO/RTO, but a safe starting point is:

- PostgreSQL continuous WAL/PITR plus daily encrypted snapshots, 35 daily and
  12 monthly restore points;
- S3 versioning, server-side encryption, cross-account or cross-region copy,
  and retention that exceeds `MEDIA_DELETE_RETENTION_DAYS`;
- Temporal PostgreSQL on the same PITR class as application PostgreSQL;
- encrypted secret-manager export after every credential/key change;
- quarterly restore drill and a restore drill before the first paid launch.

Keep at least one backup copy outside the production account and protect backup
deletion with separate credentials/MFA. Monitor backup age, size, completion,
and restore-test results.

## PostgreSQL examples

Logical backup (portable, not a replacement for PITR):

```bash
pg_dump --format=custom --no-owner --file=publishly.dump "$DATABASE_URL"
pg_restore --list publishly.dump >/dev/null
```

Restore into a new empty database and verify before cutover:

```bash
createdb publishly_restore_test
pg_restore --no-owner --dbname=publishly_restore_test publishly.dump
```

For Docker volumes, run `pg_dump` through the PostgreSQL container; do not copy
a live data directory as a backup. Managed databases should use their native
PITR/snapshot service and documented cross-account export.

## Object storage

- Enable bucket versioning before launch.
- Replicate or inventory objects and compare counts/bytes to `Media` rows.
- Abort abandoned multipart uploads after 1–7 days.
- Do not grant the application permission to delete backup versions.
- Test restoration of a representative image, video, and thumbnail through the
  public media hostname—not only direct bucket download.

## Secret escrow

Loss of `JWT_SECRET` logs everyone out; loss of `ENCRYPTION_SECRET` makes all
sealed provider tokens unreadable and forces channel reconnection. Escrow these
keys in an encrypted, access-audited system with a tested break-glass process.
Never store them inside the same unencrypted database backup they protect.

## Restore acceptance checklist

- `prisma migrate status` reports the restored schema current;
- backend `/health` and worker `/health/status` are healthy;
- an existing user can authenticate and sees only their workspace;
- media bytes and thumbnails resolve;
- future Temporal timers exist, or the missed-post reconciliation runbook is
  executed if Temporal was not restored;
- test-provider safe-retry and ambiguous-outcome canaries pass;
- Stripe/webhook ledgers still suppress replay;
- provider tokens decrypt without logging their values.
