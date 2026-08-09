// Smoke: inbox endpoints against the live backend using a fresh user + seeded
// test-provider channel. Verifies capability listing, comment fetch, and reply.
import { PrismaClient } from '@prisma/client';

const BACKEND = 'http://127.0.0.1:3000';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://publishly-local:publishly-local-pwd@localhost:5433/publishly-db-local',
    },
  },
});
const fail = (m) => {
  console.error('FAIL:', m);
  process.exit(1);
};

const email = `inbox-${Date.now()}@test.publishly.invalid`;
const reg = await fetch(`${BACKEND}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    password: 'Str0ngPassw0rd!x',
    company: 'Inbox Smoke',
    provider: 'LOCAL',
    providerToken: '',
  }),
});
const auth =
  /auth=([^;]+)/.exec(reg.headers.get('set-cookie') || '')?.[1] ||
  (await reg.clone().json().catch(() => ({})))?.jwt;
if (!auth) fail('no auth');
const user = await prisma.user.findFirst({
  where: { email },
  include: { organizations: true },
});
const orgId = user.organizations[0].organizationId;
const integration = await prisma.integration.create({
  data: {
    organizationId: orgId,
    internalId: 'inbox-' + Date.now(),
    name: 'Inbox Smoke Channel',
    providerIdentifier: 'testprovider',
    token: 'x',
    type: 'social',
  },
});

const channels = await (
  await fetch(`${BACKEND}/inbox/channels`, { headers: { auth } })
).json();
const chan = (Array.isArray(channels) ? channels : channels.channels || []).find(
  (c) => c.id === integration.id
);
if (!chan?.supportsInbox) fail('channel missing supportsInbox');

const comments = await (
  await fetch(`${BACKEND}/inbox/${integration.id}`, { headers: { auth } })
).json();
if (!comments?.comments?.length) fail('no seeded comments');

const reply = await (
  await fetch(`${BACKEND}/inbox/${integration.id}/reply`, {
    method: 'POST',
    headers: { auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commentId: comments.comments[0].id,
      message: 'Smoke reply',
    }),
  })
).json();
if (!reply?.id) fail(`reply failed: ${JSON.stringify(reply)}`);

console.log(
  JSON.stringify({
    result: 'PASS',
    channels: true,
    comments: comments.comments.length,
    replyId: reply.id,
  })
);
await prisma.$disconnect();
