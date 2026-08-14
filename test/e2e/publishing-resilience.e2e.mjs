// Live publishing safety canary. Restart the worker with one of:
//   TEST_PROVIDER_FAIL_TIMES=1 TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES=0
//     and run with EXPECTED_PROVIDER_MODE=transient (safe retry => published)
//   TEST_PROVIDER_FAIL_TIMES=0 TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES=1
//     and run with EXPECTED_PROVIDER_MODE=ambiguous (no replay => failed)

import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const BACKEND = process.env.TEST_BACKEND_URL || 'http://127.0.0.1:3000';
const SINK =
  process.env.TEST_PROVIDER_SINK ||
  resolve(process.cwd(), '.building/logs/testprovider-sink.jsonl');
const mode = process.env.EXPECTED_PROVIDER_MODE;
if (!['transient', 'ambiguous'].includes(mode)) {
  throw new Error(
    'Set EXPECTED_PROVIDER_MODE to "transient" or "ambiguous" for this canary'
  );
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://publishly-local:publishly-local-pwd@localhost:5433/publishly-db-local',
    },
  },
});

async function api(path, options = {}, auth) {
  const response = await fetch(`${BACKEND}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { auth } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response
    .clone()
    .json()
    .catch(() => response.text());
  return { response, body };
}

const email = `resilience-${mode}-${Date.now()}@test.publishly.invalid`;
const registration = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password: 'Str0ngPassw0rd!e2e',
    company: `Resilience ${mode}`,
    provider: 'LOCAL',
    providerToken: '',
  }),
});
if (!registration.response.ok) {
  throw new Error(`Registration failed: ${JSON.stringify(registration.body)}`);
}
const auth =
  /auth=([^;]+)/.exec(registration.response.headers.get('set-cookie') || '')?.[1] ||
  registration.body?.jwt;
const user = await prisma.user.findFirst({
  where: { email },
  include: { organizations: true },
});
const organizationId = user?.organizations?.[0]?.organizationId;
if (!auth || !organizationId) throw new Error('Could not resolve test tenant');

const integration = await prisma.integration.create({
  data: {
    organizationId,
    internalId: `resilience-${mode}-${Date.now()}`,
    name: `Resilience ${mode}`,
    providerIdentifier: 'testprovider',
    token: 'resilience-token',
    type: 'social',
    profile: 'test.account',
  },
});

const idempotencyKey = `resilience:${mode}:${Date.now()}`;
const creationPayload = {
  type: 'now',
  shortLink: false,
  date: new Date().toISOString(),
  tags: [],
  posts: [
    {
      integration: { id: integration.id },
      value: [
        {
          content: `Publishly ${mode} publishing canary ${Date.now()}`,
          id: '',
          image: [],
        },
      ],
      settings: { __type: 'testprovider' },
    },
  ],
};
const created = await api(
  '/posts',
  {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(creationPayload),
  },
  auth
);
if (!created.response.ok) {
  throw new Error(`Post creation failed: ${JSON.stringify(created.body)}`);
}

const postId = created.body?.[0]?.postId;
if (!postId) throw new Error('Post creation returned no post id');

const replayed = await api(
  '/posts',
  {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(creationPayload),
  },
  auth
);
if (
  !replayed.response.ok ||
  replayed.body?.[0]?.postId !== postId ||
  replayed.response.headers.get('idempotency-replayed') !== 'true'
) {
  throw new Error(
    `Idempotency replay did not return the original post: ${JSON.stringify(
      replayed.body
    )}`
  );
}

const expectedState = mode === 'transient' ? 'PUBLISHED' : 'ERROR';
const deadline = Date.now() + 3 * 60_000;
let post;
let job;
let receipts = [];
while (Date.now() < deadline) {
  [post, job, receipts] = await Promise.all([
    prisma.post.findUnique({ where: { id: postId } }),
    prisma.publishingJob.findUnique({ where: { postId } }),
    prisma.publishingReceipt.findMany({
      where: { postId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
  ]);
  // Post and publishing-job state are persisted by consecutive Temporal
  // activities. Do not observe the transient gap after Post becomes ERROR but
  // before the durable job receives its fail-closed category.
  const jobReachedExpected =
    mode === 'ambiguous'
      ? job?.state === 'FAILED' && job?.failureCategory === 'outcome_unknown'
      : job?.state === 'PUBLISHED' &&
        job?.deliveryStage === 'confirmed_live';
  if (post?.state === expectedState && jobReachedExpected) break;
  if (
    mode === 'transient' &&
    post?.state === 'ERROR' &&
    job?.state === 'FAILED'
  )
    break;
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

if (post?.state !== expectedState) {
  throw new Error(
    `Expected ${expectedState}, received ${post?.state}: ${post?.error || 'no error'}`
  );
}

const sinkEvents = existsSync(SINK)
  ? readFileSync(SINK, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event.event === 'post' && event.ids.includes(postId))
  : [];
if (sinkEvents.length !== 1) {
  throw new Error(
    `Expected exactly one provider side effect, found ${sinkEvents.length}`
  );
}

if (mode === 'ambiguous') {
  if (job?.state !== 'FAILED' || job?.failureCategory !== 'outcome_unknown') {
    throw new Error(
      `Ambiguous job was not fail-closed: ${JSON.stringify(job)}`
    );
  }
} else if (
  job?.state !== 'PUBLISHED' ||
  job?.deliveryStage !== 'confirmed_live' ||
  (job?.attempts || 0) < 2
) {
  throw new Error(`Safe transient was not retried: ${JSON.stringify(job)}`);
}

const receiptStages = receipts.map((receipt) => receipt.stage);
if (mode === 'transient') {
  for (const stage of ['queued', 'uploading', 'sent', 'confirmed_live']) {
    if (!receiptStages.includes(stage)) {
      throw new Error(
        `Missing ${stage} delivery receipt: ${JSON.stringify(receiptStages)}`
      );
    }
  }
} else if (!receiptStages.includes('failed')) {
  throw new Error(
    `Ambiguous outcome did not create a failed receipt: ${JSON.stringify(
      receiptStages
    )}`
  );
}

console.log(
  JSON.stringify(
    {
      result: 'PASS',
      mode,
      postId,
      postState: post.state,
      jobState: job?.state,
      attempts: job?.attempts,
      failureCategory: job?.failureCategory,
      deliveryStage: job?.deliveryStage,
      receipts: receiptStages,
      providerSideEffects: sinkEvents.length,
    },
    null,
    2
  )
);
await prisma.$disconnect();
