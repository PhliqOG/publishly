// End-to-end scheduling proof against the running dev stack:
//   register -> seed a test-provider channel -> schedule a post ~70s out ->
//   wait for the Temporal pipeline to publish it -> assert PUBLISHED state,
//   releaseURL, and exactly-once delivery via the test-provider sink.
//
// Run:  node test/e2e/schedule.e2e.mjs
// Needs: backend :3000, orchestrator worker, Temporal, Postgres, and
//        ENABLE_TEST_PROVIDER=true + TEST_PROVIDER_SINK in the orchestrator env.

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const BACKEND = process.env.TEST_BACKEND_URL || 'http://127.0.0.1:3000';
const SINK =
  process.env.TEST_PROVIDER_SINK ||
  resolve(process.cwd(), '.building/logs/testprovider-sink.jsonl');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://publishly-local:publishly-local-pwd@localhost:5433/publishly-db-local',
    },
  },
});

const log = (...a) => console.log('[e2e]', ...a);
const fail = (msg) => {
  console.error('[e2e] FAIL:', msg);
  process.exit(1);
};

async function api(path, options = {}, auth) {
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { auth } : {}),
      ...(options.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.clone().json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status: res.status, body, headers: res.headers };
}

const email = `e2e-${Date.now()}@test.publishly.invalid`;

log('registering', email);
const reg = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password: 'Str0ngPassw0rd!e2e',
    company: 'E2E Org',
    provider: 'LOCAL',
    providerToken: '',
  }),
});
if (reg.status >= 400) fail(`register ${reg.status}: ${JSON.stringify(reg.body)}`);
const setCookie = reg.headers.get('set-cookie') || '';
const auth =
  /auth=([^;]+)/.exec(setCookie)?.[1] || reg.body?.jwt || '';
if (!auth) fail('no auth token from register');

const user = await prisma.user.findFirst({
  where: { email },
  include: { organizations: true },
});
const orgId = user?.organizations?.[0]?.organizationId;
if (!orgId) fail('org not found after register');
log('org', orgId);

const integration = await prisma.integration.create({
  data: {
    organizationId: orgId,
    internalId: 'e2e-' + Date.now(),
    name: 'E2E Test Channel',
    providerIdentifier: 'testprovider',
    token: 'e2e-plain-token',
    type: 'social',
    profile: 'test.account',
  },
});
log('integration', integration.id);

const publishDate = new Date(Date.now() + 70_000).toISOString();
const create = await api(
  '/posts',
  {
    method: 'POST',
    headers: { 'Idempotency-Key': `schedule-e2e:${Date.now()}` },
    body: JSON.stringify({
      type: 'schedule',
      shortLink: false,
      date: publishDate,
      tags: [],
      posts: [
        {
          integration: { id: integration.id },
          value: [
            {
              content: 'E2E scheduled hello from Publishly ' + Date.now(),
              id: '',
              image: [],
            },
          ],
          settings: { __type: 'testprovider' },
        },
      ],
    }),
  },
  auth
);
if (create.status >= 400)
  fail(`create post ${create.status}: ${JSON.stringify(create.body)}`);
log('scheduled for', publishDate, '->', JSON.stringify(create.body));

const deadline = Date.now() + 5 * 60_000;
let post = null;
while (Date.now() < deadline) {
  post = await prisma.post.findFirst({
    where: { organizationId: orgId, integrationId: integration.id },
    orderBy: { createdAt: 'desc' },
  });
  if (post?.state === 'PUBLISHED' || post?.state === 'ERROR') break;
  await new Promise((r) => setTimeout(r, 5000));
}

if (!post) fail('post row never appeared');
if (post.state !== 'PUBLISHED')
  fail(
    `post ended in state ${post.state} (error: ${post.error || 'none'}) - check orchestrator log / Temporal UI (workflow post_${post.id})`
  );
if (!post.releaseURL?.includes('testprovider.invalid'))
  fail(`unexpected releaseURL: ${post.releaseURL}`);
log('PUBLISHED', post.releaseURL);

let sinkCount = null;
if (existsSync(SINK)) {
  const lines = readFileSync(SINK, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.event === 'post' && e.ids.includes(post.id));
  sinkCount = lines.length;
  if (sinkCount !== 1)
    fail(`expected exactly one provider post() delivery, saw ${sinkCount}`);
  log('exactly-once confirmed via sink');
} else {
  log(
    'sink file absent - orchestrator running without TEST_PROVIDER_SINK; DB state verified, delivery count not independently confirmed'
  );
}

console.log(
  JSON.stringify(
    {
      result: 'PASS',
      postId: post.id,
      state: post.state,
      releaseURL: post.releaseURL,
      exactlyOnceViaSink: sinkCount === 1 ? true : 'not-verified',
    },
    null,
    2
  )
);
await prisma.$disconnect();
