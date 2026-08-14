#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { sign } = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const GRAPH_VERSION = 'v25.0';
const GRAPH_ORIGIN = `https://graph.facebook.com/${GRAPH_VERSION}`;
const REQUIRED_SCOPES = Object.freeze([
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
]);
const ATTESTATION = 'publishly-owned-test-account-no-customer-data';
const RUNTIME_DIRECTORY = '/run/publishly-canary';
const API_BASE = 'http://gateway:8080/api';

class ProvisionError extends Error {
  constructor(code, message, failureClass = 'user_action_needed', details) {
    super(message);
    this.name = 'ProvisionError';
    this.code = code;
    this.failureClass = failureClass;
    this.details = details || null;
  }
}

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) {
    throw new ProvisionError(
      'canary_provision_input_missing',
      `${name} is required for this provisioning mode.`,
      'data_problem'
    );
  }
  if (/\r|\n/.test(value)) {
    throw new ProvisionError(
      'canary_provision_input_invalid',
      `${name} contains a newline.`,
      'data_problem'
    );
  }
  return value;
}

function seal(plaintext, encryptionSecret) {
  const key = Buffer.from(
    crypto.hkdfSync(
      'sha256',
      encryptionSecret,
      'publishly-hkdf-salt',
      'publishly-at-rest-v2',
      32
    )
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return `v2:${iv.toString('base64')}:${cipher
    .getAuthTag()
    .toString('base64')}:${ciphertext.toString('base64')}`;
}

function parseEnv(contents) {
  return Object.fromEntries(
    String(contents)
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function serializeEnv(values) {
  return (
    Object.entries(values)
      .map(([key, value]) => `${key}=${String(value ?? '')}`)
      .join('\n') + '\n'
  );
}

async function writeRestricted(filePath, contents) {
  const temp = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(temp, contents, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(temp, filePath);
  await fsp.chmod(filePath, 0o600).catch(() => undefined);
}

async function updateManifest(update) {
  const filePath = path.join(RUNTIME_DIRECTORY, 'manifest.json');
  const current = JSON.parse(await fsp.readFile(filePath, 'utf8'));
  const next = { ...current, ...update };
  await writeRestricted(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function normalizeGraphReason(payload, status) {
  const reason = payload?.error?.message || payload?.message;
  return typeof reason === 'string' && reason.trim()
    ? reason.trim().slice(0, 500)
    : `Meta Graph returned HTTP ${status}.`;
}

async function graphRequest(relativePath, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${GRAPH_ORIGIN}${relativePath}`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error',
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.error) {
    throw new ProvisionError(
      response.status === 429
        ? 'canary_provider_rate_limited'
        : 'canary_provider_validation_failed',
      normalizeGraphReason(payload, response.status),
      response.status === 429 ? 'recoverable' : 'user_action_needed',
      { status: response.status }
    );
  }
  return payload;
}

function collectForbiddenIds(input, output = new Set(), parentKey = '') {
  if (Array.isArray(input)) {
    for (const value of input) collectForbiddenIds(value, output, parentKey);
    return output;
  }
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      collectForbiddenIds(value, output, key);
    }
    return output;
  }
  if (
    typeof input === 'string' &&
    /(?:^|_)(?:id|pageid|page_id|instagramid|instagram_id)$/i.test(parentKey)
  ) {
    output.add(input.trim());
  }
  return output;
}

function forbiddenIds(env) {
  const ids = new Set(
    String(env.BULK_CANARY_FORBIDDEN_DESTINATION_IDS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
  const filePath = String(
    env.BULK_CANARY_FORBIDDEN_DESTINATION_FILE || ''
  ).trim();
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new ProvisionError(
        'canary_forbidden_destination_file_missing',
        'The forbidden-destination inventory file does not exist.',
        'data_problem'
      );
    }
    collectForbiddenIds(JSON.parse(fs.readFileSync(filePath, 'utf8')), ids);
  }
  return ids;
}

function validateProviderSnapshot(snapshot, expected, denied = new Set()) {
  const granted = new Set(
    (snapshot.permissions?.data || [])
      .filter((permission) => permission.status === 'granted')
      .map((permission) => permission.permission)
  );
  const missingScopes = REQUIRED_SCOPES.filter((scope) => !granted.has(scope));
  if (missingScopes.length) {
    throw new ProvisionError(
      'canary_provider_scope_missing',
      `The designated token is missing ${missingScopes.join(', ')}.`
    );
  }
  if (String(snapshot.page?.id) !== expected.pageId) {
    throw new ProvisionError(
      'canary_provider_page_mismatch',
      'Meta returned a different Facebook Page than the designated test Page.'
    );
  }
  if (
    String(snapshot.page?.instagram_business_account?.id) !==
    expected.instagramId
  ) {
    throw new ProvisionError(
      'canary_provider_link_mismatch',
      'The designated Page is not linked to the designated Instagram professional account.'
    );
  }
  if (String(snapshot.instagram?.id) !== expected.instagramId) {
    throw new ProvisionError(
      'canary_provider_instagram_mismatch',
      'Meta returned a different Instagram account than the designated test account.'
    );
  }
  if (
    !['BUSINESS', 'MEDIA_CREATOR'].includes(snapshot.instagram?.account_type)
  ) {
    throw new ProvisionError(
      'canary_provider_account_type_invalid',
      'The designated Instagram account is not a business or creator account.'
    );
  }
  const label = String(
    snapshot.instagram?.name || snapshot.instagram?.username || ''
  );
  if (label !== expected.label) {
    throw new ProvisionError(
      'canary_provider_label_mismatch',
      'The live provider label does not match the exact designated destination label.'
    );
  }
  if (!/^publishly(?:[ _-].*)?canary/i.test(label)) {
    throw new ProvisionError(
      'canary_provider_not_test_named',
      'The designated provider account must have an explicit Publishly Canary label.'
    );
  }
  if (denied.has(expected.pageId) || denied.has(expected.instagramId)) {
    throw new ProvisionError(
      'canary_provider_customer_destination_rejected',
      'The designated destination appears in the customer/store denylist.'
    );
  }
  if (!snapshot.page?.access_token) {
    throw new ProvisionError(
      'canary_provider_page_token_missing',
      'Meta did not return a Page access token for the designated test Page.'
    );
  }
  const quota = snapshot.publishingLimit?.data?.[0];
  if (!quota || !Number.isFinite(Number(quota.quota_usage))) {
    throw new ProvisionError(
      'canary_provider_publish_limit_unavailable',
      'Meta did not return the designated account content-publishing limit.'
    );
  }
  return {
    pageId: expected.pageId,
    pageName: String(snapshot.page.name || ''),
    instagramId: expected.instagramId,
    label,
    username: String(snapshot.instagram.username || ''),
    accountType: snapshot.instagram.account_type,
    quotaUsage: Number(quota.quota_usage),
  };
}

async function inspectProvider(input, fetchImpl = fetch) {
  const fields = encodeURIComponent(
    'id,name,access_token,instagram_business_account{id,username}'
  );
  const [permissions, page, instagram, publishingLimit] = await Promise.all([
    graphRequest('/me/permissions', input.userToken, fetchImpl),
    graphRequest(
      `/${encodeURIComponent(input.pageId)}?fields=${fields}`,
      input.userToken,
      fetchImpl
    ),
    graphRequest(
      `/${encodeURIComponent(
        input.instagramId
      )}?fields=id,username,name,account_type,profile_picture_url`,
      input.userToken,
      fetchImpl
    ),
    graphRequest(
      `/${encodeURIComponent(
        input.instagramId
      )}/content_publishing_limit?fields=quota_usage,config`,
      input.userToken,
      fetchImpl
    ),
  ]);
  return { permissions, page, instagram, publishingLimit };
}

async function apiRequest(relativePath, options, fetchImpl = fetch) {
  const headers = {
    auth: options.authToken,
    showorg: options.organizationId,
    ...(options.headers || {}),
  };
  let body;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await fetchImpl(
    `${options.apiBase || API_BASE}${relativePath}`,
    {
      method: options.method || 'GET',
      headers,
      body,
      redirect: 'error',
    }
  );
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { reason: text.slice(0, 500) };
  }
  if (!response.ok) {
    const detail =
      payload?.message && typeof payload.message === 'object'
        ? payload.message
        : payload || {};
    throw new ProvisionError(
      detail.code || 'canary_api_request_failed',
      detail.reason ||
        (typeof payload?.message === 'string' ? payload.message : null) ||
        `${relativePath.split('?')[0]} returned HTTP ${response.status}.`,
      detail.failureClass ||
        (response.status >= 500 ? 'recoverable' : 'data_problem'),
      { status: response.status }
    );
  }
  return payload;
}

function operatorEnvironment(env, token, destinationLabel = '') {
  const evidenceName = `stage8-instagram-reel-${env.PUBLISHLY_BUILD_REVISION.replace(
    /[^a-z0-9]/gi,
    '-'
  )}.json`;
  return {
    BULK_CANARY_API_BASE_URL: `${env.MAIN_URL}/api`,
    BULK_CANARY_AUTH_TOKEN: token,
    BULK_CANARY_ORGANIZATION_ID: env.BULK_CANARY_ORGANIZATION_ID,
    BULK_CANARY_TUPLE_ID: env.BULK_CANARY_TUPLE_ID,
    BULK_CANARY_INTEGRATION_ID: env.BULK_CANARY_INTEGRATION_ID,
    BULK_CANARY_EXPECTED_DESTINATION_LABEL: destinationLabel,
    BULK_CANARY_EXPECTED_BUILD_REVISION: env.PUBLISHLY_BUILD_REVISION,
    BULK_CANARY_MEDIA_FILE: path.join(
      RUNTIME_DIRECTORY,
      'publishly-stage8-canary.mp4'
    ),
    BULK_CANARY_EVIDENCE_FILE: path.join(RUNTIME_DIRECTORY, evidenceName),
    BULK_CANARY_ACCOUNT_ATTESTATION: ATTESTATION,
    BULK_CANARY_CONFIRM: `publishly-real-canary:${env.BULK_CANARY_TUPLE_ID}:${env.BULK_CANARY_INTEGRATION_ID}`,
  };
}

async function writeOperatorEnvironment(values) {
  await writeRestricted(
    path.join(RUNTIME_DIRECTORY, 'operator.env'),
    serializeEnv(values)
  );
}

async function seedTenant(prisma, env) {
  const organizationId = required(env, 'BULK_CANARY_ORGANIZATION_ID');
  const userId = required(env, 'BULK_CANARY_USER_ID');
  const runId = required(env, 'BULK_CANARY_RUN_ID');
  const existing = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { users: true },
  });
  if (existing) {
    if (
      existing.name !== `Publishly Provider Canary ${runId}` ||
      existing.users.length !== 1 ||
      existing.users[0].userId !== userId
    ) {
      throw new ProvisionError(
        'canary_tenant_collision',
        'The generated canary tenant ID already belongs to different data.',
        'data_problem'
      );
    }
  } else {
    const counts = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.integration.count(),
      prisma.post.count(),
      prisma.bulkCampaign.count(),
    ]);
    if (counts.some((count) => count !== 0)) {
      throw new ProvisionError(
        'canary_database_not_empty',
        'The isolated canary database contains unexpected tenant or publishing data.',
        'data_problem',
        { counts }
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.organization.create({
        data: {
          id: organizationId,
          name: `Publishly Provider Canary ${runId}`,
          description: 'Isolated Publishly-owned real-provider canary tenant.',
          allowTrial: true,
        },
      });
      await tx.user.create({
        data: {
          id: userId,
          email: `bulk-canary+${runId}@publishly.invalid`,
          providerName: 'LOCAL',
          name: 'Publishly',
          lastName: 'Canary',
          timezone: 0,
          activated: true,
        },
      });
      await tx.userOrganization.create({
        data: {
          userId,
          organizationId,
          role: 'SUPERADMIN',
        },
      });
      await tx.auditLog.create({
        data: {
          id: `audit_canary_tenant_${crypto.randomBytes(8).toString('hex')}`,
          organizationId,
          userId,
          actorType: 'system',
          action: 'bulk-canary.tenant-provisioned',
          targetType: 'organization',
          targetId: organizationId,
          metadata: JSON.stringify({ runId, isolated: true }),
        },
      });
    });
  }
  const authToken = sign({ id: userId }, required(env, 'JWT_SECRET'), {
    expiresIn: '12h',
    jwtid: crypto.randomUUID(),
  });
  return { organizationId, userId, authToken };
}

async function activateCalendarAuthority(tenant, fetchImpl = fetch) {
  const request = (relativePath, method = 'GET') =>
    apiRequest(
      relativePath,
      {
        method,
        authToken: tenant.authToken,
        organizationId: tenant.organizationId,
      },
      fetchImpl
    );
  let batch;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    batch = await request(
      '/calendar/reservations/backfill/batches?limit=500',
      'POST'
    );
    if (batch?.backfill?.state === 'VERIFYING') break;
  }
  if (batch?.backfill?.state !== 'VERIFYING') {
    throw new ProvisionError(
      'canary_calendar_backfill_incomplete',
      'The empty canary tenant did not reach calendar backfill verification.',
      'recoverable'
    );
  }
  const verification = await request(
    '/calendar/reservations/backfill/verify',
    'POST'
  );
  if (verification?.backfill?.state !== 'VERIFIED') {
    throw new ProvisionError(
      verification?.backfill?.outcomeCode || 'canary_calendar_backfill_failed',
      verification?.backfill?.outcomeReason ||
        'The canary calendar backfill failed verification.',
      'data_problem'
    );
  }
  let promotion;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    promotion = await request(
      '/calendar/reservations/authority/batches?limit=500',
      'POST'
    );
    if (promotion?.activated) break;
  }
  const final = await request('/calendar/reservations/backfill');
  if (
    !promotion?.activated ||
    final?.state !== 'VERIFIED' ||
    !final?.authorityActivatedAt
  ) {
    throw new ProvisionError(
      'canary_calendar_authority_incomplete',
      'The canary tenant did not activate the authoritative reservation ledger.',
      'recoverable'
    );
  }
  return {
    state: final.state,
    authorityActivatedAt: final.authorityActivatedAt,
    scannedCount: final.scannedCount,
    insertedCount: final.insertedCount,
    conflictCount: final.conflictCount,
    mismatchCount: final.mismatchCount,
  };
}

async function provisionTenant(prisma, env, fetchImpl = fetch) {
  const tenant = await seedTenant(prisma, env);
  const authority = await activateCalendarAuthority(tenant, fetchImpl);
  await writeOperatorEnvironment(operatorEnvironment(env, tenant.authToken));
  await updateManifest({
    state: 'ready_for_provider_provisioning',
    tenantProvisionedAt: new Date().toISOString(),
    calendarAuthority: authority,
    providerCertified: false,
  });
  return {
    verdict: 'PASS',
    mode: 'tenant',
    organizationId: tenant.organizationId,
    calendarAuthority: authority,
    operatorEnvironmentFile: path.join(RUNTIME_DIRECTORY, 'operator.env'),
  };
}

async function stageProviderIntegration(prisma, env, input) {
  const integrationId = required(env, 'BULK_CANARY_INTEGRATION_ID');
  const organizationId = required(env, 'BULK_CANARY_ORGANIZATION_ID');
  const existing = await prisma.integration.findUnique({
    where: { id: integrationId },
  });
  if (existing) {
    if (
      existing.organizationId !== organizationId ||
      existing.providerIdentifier !== 'instagram'
    ) {
      throw new ProvisionError(
        'canary_integration_collision',
        'The generated canary integration ID belongs to different data.',
        'data_problem'
      );
    }
    return existing;
  }
  const now = new Date();
  const expires = new Date(now.getTime() + 59 * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const created = await tx.integration.create({
      data: {
        id: integrationId,
        internalId: `canary_staged_${input.pageId}`,
        organizationId,
        name: 'Publishly Canary (provider validation pending)',
        providerIdentifier: 'instagram',
        type: 'social',
        token: seal(input.userToken, required(env, 'ENCRYPTION_SECRET')),
        refreshToken: seal(input.userToken, required(env, 'ENCRYPTION_SECRET')),
        inBetweenSteps: true,
        rootInternalId: `canary_staged_${input.pageId}`,
        tokenIssuedAt: now,
        tokenExpiration: expires,
        tokenLifetimeDays: 59,
        tokenHealthState: 'HEALTHY',
        tokenHealthReason:
          'The designated canary token passed live Meta validation.',
        tokenHealthCheckedAt: now,
        tokenHealthChangedAt: now,
        connectionHealthState: 'HEALTHY',
        connectionHealthReason:
          'The designated canary account passed live Meta validation.',
        connectionHealthChangedAt: now,
        lastProviderContactAt: now,
        additionalSettings: '[]',
      },
    });
    await tx.auditLog.create({
      data: {
        id: `audit_canary_provider_${crypto.randomBytes(8).toString('hex')}`,
        organizationId,
        actorType: 'system',
        action: 'bulk-canary.provider-staged',
        targetType: 'integration',
        targetId: integrationId,
        metadata: JSON.stringify({
          provider: 'instagram',
          pageId: input.pageId,
          instagramId: input.instagramId,
          attestation: ATTESTATION,
        }),
      },
    });
    return created;
  });
}

async function recordProviderFailure(prisma, env, error) {
  const integrationId = String(env.BULK_CANARY_INTEGRATION_ID || '');
  const organizationId = String(env.BULK_CANARY_ORGANIZATION_ID || '');
  if (integrationId && organizationId) {
    await prisma.integration
      .updateMany({
        where: { id: integrationId, organizationId },
        data: {
          refreshNeeded: true,
          connectionHealthState: 'RECONNECT_REQUIRED',
          connectionHealthReason: error.message,
          connectionHealthChangedAt: new Date(),
          lastConnectionErrorCode: error.code,
          lastConnectionErrorReason: error.message,
          consecutiveErrors: { increment: 1 },
        },
      })
      .catch(() => undefined);
    await prisma.auditLog
      .create({
        data: {
          id: `audit_canary_provider_failed_${crypto
            .randomBytes(8)
            .toString('hex')}`,
          organizationId,
          actorType: 'system',
          action: 'bulk-canary.provider-failed',
          targetType: 'integration',
          targetId: integrationId,
          metadata: JSON.stringify({
            failureClass: error.failureClass,
            code: error.code,
            reason: error.message,
          }),
        },
      })
      .catch(() => undefined);
  }
  const artifact = {
    verdict: 'FAIL',
    occurredAt: new Date().toISOString(),
    failureClass: error.failureClass,
    code: error.code,
    reason: error.message,
  };
  await writeRestricted(
    path.join(RUNTIME_DIRECTORY, 'provider-provision-failure.json'),
    `${JSON.stringify(artifact, null, 2)}\n`
  );
  await updateManifest({
    state: 'provider_provision_failed',
    providerProvisionFailure: artifact,
    providerCertified: false,
  }).catch(() => undefined);
}

async function provisionProvider(prisma, env, fetchImpl = fetch) {
  const input = {
    userToken: required(env, 'BULK_CANARY_PROVIDER_USER_TOKEN'),
    pageId: required(env, 'BULK_CANARY_EXPECTED_PAGE_ID'),
    instagramId: required(env, 'BULK_CANARY_EXPECTED_INSTAGRAM_ID'),
    label: required(env, 'BULK_CANARY_EXPECTED_DESTINATION_LABEL'),
  };
  if (required(env, 'BULK_CANARY_ACCOUNT_ATTESTATION') !== ATTESTATION) {
    throw new ProvisionError(
      'canary_account_attestation_missing',
      'The exact Publishly-owned test-account attestation is required.',
      'data_problem'
    );
  }
  const tenant = await prisma.user.findUnique({
    where: { id: required(env, 'BULK_CANARY_USER_ID') },
  });
  const authority = await prisma.calendarReservationBackfill.findFirst({
    where: {
      organizationId: required(env, 'BULK_CANARY_ORGANIZATION_ID'),
      state: 'VERIFIED',
      authorityActivatedAt: { not: null },
    },
  });
  if (!tenant || !authority) {
    throw new ProvisionError(
      'canary_tenant_not_ready',
      'Provision and verify the isolated tenant and calendar authority first.',
      'data_problem'
    );
  }
  const snapshot = await inspectProvider(input, fetchImpl);
  const destination = validateProviderSnapshot(
    snapshot,
    input,
    forbiddenIds(env)
  );
  await stageProviderIntegration(prisma, env, input);
  const authToken = sign({ id: tenant.id }, required(env, 'JWT_SECRET'), {
    expiresIn: '12h',
    jwtid: crypto.randomUUID(),
  });
  try {
    await apiRequest(
      `/integrations/provider/${encodeURIComponent(
        env.BULK_CANARY_INTEGRATION_ID
      )}/connect`,
      {
        method: 'POST',
        authToken,
        organizationId: env.BULK_CANARY_ORGANIZATION_ID,
        json: { pageId: input.pageId, id: input.instagramId },
      },
      fetchImpl
    );
    const refreshed = await apiRequest(
      `/integrations/${encodeURIComponent(
        env.BULK_CANARY_INTEGRATION_ID
      )}/platform-truth/refresh`,
      {
        method: 'POST',
        authToken,
        organizationId: env.BULK_CANARY_ORGANIZATION_ID,
      },
      fetchImpl
    );
    if (refreshed?.platformTruth?.state !== 'READY') {
      throw new ProvisionError(
        refreshed?.platformTruth?.code || 'canary_platform_truth_not_ready',
        refreshed?.platformTruth?.reason ||
          'The designated Instagram connection is not ready to publish.'
      );
    }
    const listed = await apiRequest(
      '/integrations/list',
      {
        authToken,
        organizationId: env.BULK_CANARY_ORGANIZATION_ID,
      },
      fetchImpl
    );
    const integration = listed?.integrations?.find(
      (item) => item.id === env.BULK_CANARY_INTEGRATION_ID
    );
    if (
      !integration ||
      integration.identifier !== 'instagram' ||
      integration.internalId !== input.instagramId ||
      integration.name !== input.label ||
      integration.refreshNeeded ||
      integration.connectionHealthState !== 'HEALTHY'
    ) {
      throw new ProvisionError(
        'canary_provider_projection_invalid',
        'The saved connection does not match the live designated test destination.'
      );
    }
    await writeOperatorEnvironment(
      operatorEnvironment(env, authToken, input.label)
    );
    await updateManifest({
      state: 'ready_for_real_canary',
      providerProvisionedAt: new Date().toISOString(),
      providerDestination: destination,
      providerCertified: false,
    });
    return {
      verdict: 'PASS',
      mode: 'provider',
      integrationId: env.BULK_CANARY_INTEGRATION_ID,
      destination,
      platformTruth: refreshed.platformTruth,
      operatorEnvironmentFile: path.join(RUNTIME_DIRECTORY, 'operator.env'),
    };
  } catch (error) {
    const classified =
      error instanceof ProvisionError
        ? error
        : new ProvisionError(
            'canary_provider_provision_failed',
            error instanceof Error ? error.message : String(error),
            'recoverable'
          );
    await recordProviderFailure(prisma, env, classified);
    throw classified;
  }
}

function usage() {
  return [
    'Usage:',
    '  node scripts/provision-bulk-canary.cjs tenant',
    '  node scripts/provision-bulk-canary.cjs provider',
    '',
    'provider requires a live user token, exact Page/Instagram IDs and label,',
    'the test-account attestation, and optionally a destination denylist.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  if (argv.length !== 1 || !['tenant', 'provider'].includes(argv[0])) {
    throw new ProvisionError('canary_provision_usage', usage(), 'data_problem');
  }
  const env = dependencies.env || process.env;
  const prisma = dependencies.prisma || new PrismaClient();
  try {
    const result =
      argv[0] === 'tenant'
        ? await provisionTenant(prisma, env, dependencies.fetchImpl || fetch)
        : await provisionProvider(prisma, env, dependencies.fetchImpl || fetch);
    if (!dependencies.silent) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    return result;
  } catch (error) {
    const classified =
      error instanceof ProvisionError
        ? error
        : new ProvisionError(
            'canary_provision_failed',
            error instanceof Error ? error.message : String(error),
            'recoverable'
          );
    if (argv[0] === 'provider') {
      await recordProviderFailure(prisma, env, classified).catch(
        () => undefined
      );
    }
    throw classified;
  } finally {
    if (!dependencies.prisma) await prisma.$disconnect();
  }
}

module.exports = {
  API_BASE,
  ATTESTATION,
  GRAPH_ORIGIN,
  ProvisionError,
  REQUIRED_SCOPES,
  apiRequest,
  collectForbiddenIds,
  graphRequest,
  inspectProvider,
  operatorEnvironment,
  parseEnv,
  required,
  seal,
  serializeEnv,
  validateProviderSnapshot,
  provisionTenant,
  provisionProvider,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    const classified =
      error instanceof ProvisionError
        ? error
        : new ProvisionError(
            'canary_provision_failed',
            error instanceof Error ? error.message : String(error),
            'recoverable'
          );
    process.stderr.write(
      `${JSON.stringify(
        {
          verdict: 'FAIL',
          failureClass: classified.failureClass,
          code: classified.code,
          reason: classified.message,
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
  });
}
