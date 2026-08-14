#!/usr/bin/env node

'use strict';

const { PrismaClient } = require('@prisma/client');

const DISPOSABLE_PREFIX = 'launch-check-';
const DISPOSABLE_SUFFIX = '@publishly.invalid';

function parseArgs(argv) {
  const options = { origin: 'https://publishlyapi.com' };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--origin') {
      options.origin = argv[++index];
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.origin && !options.help) throw new Error('--origin requires a value.');
  return options;
}

function normalizeOrigin(input) {
  const parsed = new URL(String(input || ''));
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('The signup verification origin must be a pathless HTTPS origin.');
  }
  return parsed.origin;
}

function normalizeVerifierDatabaseUrl(environment = process.env) {
  if (!environment.DATABASE_URL) return;
  const databaseUrl = new URL(environment.DATABASE_URL);
  if (databaseUrl.hostname === 'localhost') {
    // The interim Windows host can have an unrelated Docker PostgreSQL
    // listener on IPv6 localhost. The Publishly API is deliberately pinned to
    // the native IPv4 cluster, so the verifier must inspect the same server.
    databaseUrl.hostname = '127.0.0.1';
    environment.DATABASE_URL = databaseUrl.toString();
  }
}

async function removeDisposableUser(prisma, user) {
  if (!user) return { userDeleted: false, organizationsDeleted: 0 };
  const links = await prisma.userOrganization.findMany({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  let organizationsDeleted = 0;
  await prisma.$transaction(async (transaction) => {
    await transaction.userOrganization.deleteMany({ where: { userId: user.id } });
    await transaction.user.delete({ where: { id: user.id } });
    for (const link of links) {
      const remaining = await transaction.userOrganization.count({
        where: { organizationId: link.organizationId },
      });
      if (remaining === 0) {
        await transaction.organization.delete({
          where: { id: link.organizationId },
        });
        organizationsDeleted++;
      }
    }
  });
  return { userDeleted: true, organizationsDeleted };
}

async function removeLeftovers(prisma) {
  const users = await prisma.user.findMany({
    where: {
      email: { startsWith: DISPOSABLE_PREFIX, endsWith: DISPOSABLE_SUFFIX },
    },
  });
  for (const user of users) await removeDisposableUser(prisma, user);
  return users.length;
}

async function waitForDisposableUser(prisma, email, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const user = await prisma.user.findFirst({
      where: { email },
    });
    if (user) return user;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  return null;
}

async function verifyPublicSignup({ origin, fetchImpl = fetch, prisma }) {
  const normalizedOrigin = normalizeOrigin(origin);
  const stamp = `${Date.now()}-${process.pid}`;
  const email = `${DISPOSABLE_PREFIX}${stamp}${DISPOSABLE_SUFFIX}`;
  let createdUser;
  const staleRowsRemoved = await removeLeftovers(prisma);

  try {
    const response = await fetchImpl(`${normalizedOrigin}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'LOCAL',
        providerToken: '',
        email,
        password: 'PublishlyLaunchCheck!2026',
        company: `Publishly Launch Check ${stamp}`,
        datafast_visitor_id: '',
      }),
    });
    const body = await response.text();
    // The public request and this verifier use independent database sessions.
    // Allow a short bounded window for the committed row to become visible
    // before declaring that the API acknowledged a non-persistent signup.
    createdUser = await waitForDisposableUser(prisma, email);
    const cookie = response.headers.get('set-cookie') || '';
    const passed =
      response.status === 200 &&
      /"register"\s*:\s*true/.test(body) &&
      /(?:^|[,;]\s*)auth=/i.test(cookie) &&
      /\bHttpOnly\b/i.test(cookie) &&
      /\bSecure\b/i.test(cookie) &&
      Boolean(createdUser);
    if (!passed) {
      throw new Error(
        `Public signup verification failed (status=${response.status}, body=${/"register"\s*:\s*true/.test(body)}, secureCookie=${/\bHttpOnly\b/i.test(cookie) && /\bSecure\b/i.test(cookie)}, persisted=${Boolean(createdUser)}).`
      );
    }
    return { passed: true, status: response.status, staleRowsRemoved };
  } finally {
    if (!createdUser) {
      createdUser = await waitForDisposableUser(prisma, email, 2_000);
    }
    await removeDisposableUser(prisma, createdUser);
  }
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (options.help) {
    console.log('Usage: node scripts/verify-public-signup.cjs [--origin https://domain]');
    return 0;
  }

  normalizeVerifierDatabaseUrl();
  const prisma = new PrismaClient();
  try {
    const result = await verifyPublicSignup({ ...options, prisma });
    console.log(
      `Public signup passed with HTTP ${result.status}; secure session cookie verified; disposable records removed.`
    );
    if (result.staleRowsRemoved > 0) {
      console.log(`Removed ${result.staleRowsRemoved} stale disposable signup record(s).`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = {
  normalizeOrigin,
  normalizeVerifierDatabaseUrl,
  parseArgs,
  removeDisposableUser,
  waitForDisposableUser,
  verifyPublicSignup,
};

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}
