#!/usr/bin/env node

'use strict';

const { randomUUID } = require('node:crypto');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const required = [
  'R2_CANARY_ENDPOINT',
  'R2_CANARY_ACCESS_KEY_ID',
  'R2_CANARY_SECRET_ACCESS_KEY',
  'R2_CANARY_PUBLIC_BUCKET',
  'R2_CANARY_PRIVATE_BUCKET',
];

async function readBody(body) {
  if (typeof body?.transformToString === 'function') {
    return body.transformToString();
  }
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function verifyBucket(client, bucket) {
  const key = `.publishly-credential-canary/${randomUUID()}.txt`;
  const expected = `publishly-r2-canary:${randomUUID()}`;
  let created = false;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: expected,
        ContentType: 'text/plain',
        CacheControl: 'no-store',
      })
    );
    created = true;
    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    if ((await readBody(object.Body)) !== expected) {
      throw new Error(`R2 canary readback did not match for ${bucket}.`);
    }
  } finally {
    if (created) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  }
}

async function main() {
  for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} is required.`);
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_CANARY_ENDPOINT,
    forcePathStyle: false,
    credentials: {
      accessKeyId: process.env.R2_CANARY_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_CANARY_SECRET_ACCESS_KEY,
    },
  });
  await verifyBucket(client, process.env.R2_CANARY_PUBLIC_BUCKET);
  await verifyBucket(client, process.env.R2_CANARY_PRIVATE_BUCKET);
  console.log(
    'R2 credential canary passed for public and private Publishly buckets; test objects were deleted.'
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { readBody, verifyBucket };
