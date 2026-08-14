const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);
const source = process.env.DATABASE_URL;
if (!source) throw new Error('DATABASE_URL is required.');
const base = new URL(source);
if (!allowedHosts.has(base.hostname)) {
  throw new Error(
    'Fresh migration verification is restricted to local PostgreSQL.'
  );
}

const database = `publishly_migration_verify_${Date.now()}_${randomBytes(
  3
).toString('hex')}`;
if (!/^publishly_migration_verify_[a-z0-9_]+$/.test(database)) {
  throw new Error(
    'Generated disposable database name failed its safety check.'
  );
}

const adminUrl = new URL(base);
adminUrl.pathname = '/postgres';
const disposableUrl = new URL(base);
disposableUrl.pathname = `/${database}`;

const requestedTables = (process.env.VERIFY_MIGRATION_TABLES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const expectedLatest = process.env.VERIFY_LATEST_MIGRATION || '';

async function main() {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--schema',
        'libraries/nestjs-libraries/src/database/prisma/schema.prisma',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: disposableUrl.toString() },
        encoding: 'utf8',
      }
    );
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) {
      throw new Error(`Prisma migration deployment exited ${result.status}.`);
    }

    const verify = new Client({ connectionString: disposableUrl.toString() });
    await verify.connect();
    try {
      const tables = await verify.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         ORDER BY table_name`,
        [requestedTables]
      );
      const constraints = await verify.query(
        `SELECT c.relname AS table_name, pc.conname,
                pg_get_constraintdef(pc.oid) AS definition
         FROM pg_constraint pc
         JOIN pg_class c ON c.oid = pc.conrelid
         WHERE pc.connamespace = 'public'::regnamespace
           AND c.relname = ANY($1::text[])
         ORDER BY table_name, conname`,
        [requestedTables]
      );
      const tokenColumns = await verify.query(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'ProviderMediaGrant'
           AND column_name ILIKE '%token%'
         ORDER BY column_name`
      );
      const latest = await verify.query(
        `SELECT migration_name, finished_at IS NOT NULL AS finished
         FROM "_prisma_migrations"
         ORDER BY finished_at DESC NULLS LAST LIMIT 1`
      );
      if (tables.rowCount !== requestedTables.length) {
        throw new Error(
          `Expected ${requestedTables.length} tables, found ${tables.rowCount}.`
        );
      }
      if (expectedLatest && latest.rows[0]?.migration_name !== expectedLatest) {
        throw new Error(
          `Expected latest migration ${expectedLatest}, found ${latest.rows[0]?.migration_name}.`
        );
      }
      const inspection = {
        database,
        tables: tables.rows.map((row) => row.table_name),
        constraintNames: constraints.rows.map((row) => row.conname),
        tokenColumns: tokenColumns.rows,
        latestMigration: latest.rows[0],
        ...(process.env.VERIFY_MIGRATION_VERBOSE === 'true'
          ? { constraints: constraints.rows }
          : {}),
      };
      process.stdout.write(
        `FRESH_MIGRATION_INSPECTION=${JSON.stringify(inspection)}\n`
      );
    } finally {
      await verify.end();
    }
  } finally {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`,
      [database]
    );
    await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
    process.stdout.write(`DISPOSABLE_DATABASE_DROPPED=${database}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
