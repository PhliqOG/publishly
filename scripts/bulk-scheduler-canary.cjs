#!/usr/bin/env node
'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */

const { createHash, randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');
const {
  mkdir,
  open,
  stat,
  writeFile,
} = require('node:fs/promises');
const path = require('node:path');

const EXECUTION_ATTESTATION =
  'publishly-owned-test-account-no-customer-data';
const TERMINAL_UPLOAD_STATES = new Set([
  'QUARANTINED',
  'FAILED',
  'FINAL_FAILURE',
  'ABORTED',
  'EXPIRED',
]);
const TERMINAL_JOB_STATES = new Set([
  'NEEDS_REVIEW',
  'FINAL_FAILURE',
  'BLOCKED',
  'CONFLICTED',
  'QUARANTINED',
  'OVERFLOW',
  'CANCELLED',
]);
const SENSITIVE_KEY =
  /(?:auth(?:entication|orization)?|cookie|secret|token|capability|privateMediaUrl|private_media_url|presigned|storageKey|objectKey)/i;

class CanaryError extends Error {
  constructor(code, reason, details = undefined) {
    super(reason);
    this.name = 'CanaryError';
    this.code = code;
    this.details = details;
  }
}

function required(environment, name) {
  const value = String(environment[name] || '').trim();
  if (!value) {
    throw new CanaryError(
      'canary_input_missing',
      `${name} is required for this canary mode.`,
      { input: name }
    );
  }
  if (/\r|\n/.test(value)) {
    throw new CanaryError(
      'canary_input_invalid',
      `${name} cannot contain line breaks.`,
      { input: name }
    );
  }
  return value;
}

function positiveInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CanaryError(
      'canary_input_invalid',
      `${name} must be an integer from ${minimum} through ${maximum}.`,
      { input: name }
    );
  }
  return parsed;
}

function parseConfiguration(environment, mode) {
  if (!['preflight', 'execute'].includes(mode)) {
    throw new CanaryError(
      'canary_mode_invalid',
      'Choose exactly one canary mode: preflight or execute.'
    );
  }
  const rawBaseUrl = required(environment, 'BULK_CANARY_API_BASE_URL');
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(rawBaseUrl);
  } catch {
    throw new CanaryError(
      'canary_api_url_invalid',
      'BULK_CANARY_API_BASE_URL must be an absolute URL.'
    );
  }
  if (
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash
  ) {
    throw new CanaryError(
      'canary_api_url_invalid',
      'The canary API URL cannot contain credentials, query, or fragment.'
    );
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(
    parsedBaseUrl.hostname
  );
  if (mode === 'execute' && parsedBaseUrl.protocol !== 'https:') {
    throw new CanaryError(
      'canary_https_required',
      'Real canary execution requires an HTTPS API endpoint.'
    );
  }
  if (!['https:', 'http:'].includes(parsedBaseUrl.protocol) || (!local && parsedBaseUrl.protocol !== 'https:')) {
    throw new CanaryError(
      'canary_api_url_invalid',
      'The canary API URL must use HTTPS outside local read-only preflight.'
    );
  }
  const config = {
    mode,
    apiBaseUrl: parsedBaseUrl.toString().replace(/\/$/, ''),
    authToken: required(environment, 'BULK_CANARY_AUTH_TOKEN'),
    organizationId: required(environment, 'BULK_CANARY_ORGANIZATION_ID'),
    tupleId: required(environment, 'BULK_CANARY_TUPLE_ID'),
    integrationId: required(environment, 'BULK_CANARY_INTEGRATION_ID'),
    expectedDestinationLabel: required(
      environment,
      'BULK_CANARY_EXPECTED_DESTINATION_LABEL'
    ),
    expectedBuildRevision: required(
      environment,
      'BULK_CANARY_EXPECTED_BUILD_REVISION'
    ),
    pollIntervalMs: positiveInteger(
      environment.BULK_CANARY_POLL_INTERVAL_MS,
      5_000,
      100,
      60_000,
      'BULK_CANARY_POLL_INTERVAL_MS'
    ),
    timeoutMs: positiveInteger(
      environment.BULK_CANARY_TIMEOUT_MS,
      45 * 60_000,
      60_000,
      2 * 60 * 60_000,
      'BULK_CANARY_TIMEOUT_MS'
    ),
  };
  if (mode === 'execute') {
    config.mediaFile = path.resolve(
      required(environment, 'BULK_CANARY_MEDIA_FILE')
    );
    config.evidenceFile = path.resolve(
      required(environment, 'BULK_CANARY_EVIDENCE_FILE')
    );
    config.confirmation = required(environment, 'BULK_CANARY_CONFIRM');
    config.accountAttestation = required(
      environment,
      'BULK_CANARY_ACCOUNT_ATTESTATION'
    );
    const expectedConfirmation = `publishly-real-canary:${config.tupleId}:${config.integrationId}`;
    if (config.confirmation !== expectedConfirmation) {
      throw new CanaryError(
        'canary_confirmation_mismatch',
        `BULK_CANARY_CONFIRM must exactly equal ${expectedConfirmation}.`
      );
    }
    if (config.accountAttestation !== EXECUTION_ATTESTATION) {
      throw new CanaryError(
        'canary_account_attestation_missing',
        `BULK_CANARY_ACCOUNT_ATTESTATION must exactly equal ${EXECUTION_ATTESTATION}.`
      );
    }
  }
  return config;
}

function classified(value) {
  return (
    value &&
    typeof value === 'object' &&
    ['recoverable', 'user_action_needed', 'data_problem'].includes(
      value.failureClass
    ) &&
    typeof value.code === 'string' &&
    value.code.trim().length > 0 &&
    typeof value.reason === 'string' &&
    value.reason.trim().length > 0
  );
}

function assertDurableOutcome(value, fallbackCode) {
  const candidate = {
    failureClass: value?.failureClass,
    code: value?.failureCode || value?.outcomeCode || value?.code,
    reason: value?.failureReason || value?.outcomeReason || value?.reason,
  };
  if (!classified(candidate)) {
    throw new CanaryError(
      'canary_unclassified_terminal_outcome',
      `A terminal ${fallbackCode} outcome had no durable class, code, and reason.`,
      { state: value?.state || null }
    );
  }
  return candidate;
}

function redactEvidence(value, secrets = [], depth = 0, key = '') {
  if (depth > 30) return '[redacted:depth-limit]';
  if (SENSITIVE_KEY.test(key)) return '[redacted]';
  if (typeof value === 'string') {
    let redacted = value;
    for (const secret of secrets) {
      if (secret) redacted = redacted.split(secret).join('[redacted]');
    }
    return redacted
      .replace(
        /publishly-private:\/\/[A-Za-z0-9_-]{20,4096}\/video\.mp4/gi,
        'publishly-private://[redacted]/video.mp4'
      )
      .replace(
        /(\/provider-media\/)(?:pmg_[a-f0-9]{32}\.[A-Za-z0-9_-]{1,100})(?:\/video\.mp4)?/gi,
        '$1[redacted]/video.mp4'
      )
      .replace(/([?&](?:X-Amz-[^=]+|sig|signature|token)=)[^&\s]+/gi, '$1[redacted]')
      .replace(
        /((?:access[_-]?token|refresh[_-]?token|authorization|api[_-]?key|client[_-]?secret)\s*[:=]\s*)(?:Bearer\s+)?[^&\s,"'}]+/gi,
        '$1[redacted]'
      );
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactEvidence(item, secrets, depth + 1, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        redactEvidence(child, secrets, depth + 1, childKey),
      ])
    );
  }
  return value;
}

function assertEvidenceSafe(value, secrets = []) {
  const serialized = JSON.stringify(value);
  if (
    /pmg_[a-f0-9]{32}\.[A-Za-z0-9_-]{20,}/i.test(serialized) ||
    /publishly-private:\/\/(?!\[redacted\])/i.test(serialized) ||
    /\/provider-media\/(?!\[redacted\])/i.test(serialized) ||
    /X-Amz-Signature=[^&"\s]+/i.test(serialized) ||
    secrets.some((secret) => secret && serialized.includes(secret))
  ) {
    throw new CanaryError(
      'canary_evidence_redaction_failed',
      'The evidence artifact still contained a private transport capability or credential.'
    );
  }
  return value;
}

async function defaultWriteEvidence(filePath, artifact) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

async function defaultInspectMedia(filePath) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size < 12 || details.size > 1024 ** 3) {
    throw new CanaryError(
      'canary_media_invalid',
      'The canary media must be one regular MP4 file from 12 bytes through 1 GiB.'
    );
  }
  if (path.extname(filePath).toLowerCase() !== '.mp4') {
    throw new CanaryError(
      'canary_media_invalid',
      'The controlled canary fixture must have an .mp4 filename.'
    );
  }
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(Math.min(4096, details.size));
    await handle.read(header, 0, header.length, 0);
    if (header.indexOf(Buffer.from('ftyp')) < 0) {
      throw new CanaryError(
        'canary_media_invalid',
        'The controlled canary fixture has no MP4 ftyp signature.'
      );
    }
  } finally {
    await handle.close();
  }
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return {
    byteLength: details.size,
    sha256: digest.digest('hex'),
    originalName: path.basename(filePath),
  };
}

function createApi(config, fetchImpl) {
  const calls = [];
  const request = async (relativePath, options = {}) => {
    const method = options.method || 'GET';
    calls.push({ method, path: relativePath.split('?')[0] });
    const headers = {
      auth: config.authToken,
      showorg: config.organizationId,
      ...(options.headers || {}),
    };
    let body = options.body;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    }
    const response = await fetchImpl(`${config.apiBaseUrl}${relativePath}`, {
      method,
      headers,
      body,
      redirect: 'error',
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { reason: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const message = payload?.message;
      const detail =
        message && typeof message === 'object' ? message : payload || {};
      throw new CanaryError(
        detail.code || 'canary_api_request_failed',
        detail.reason ||
          (typeof message === 'string' ? message : null) ||
          `${method} ${relativePath.split('?')[0]} returned HTTP ${response.status}.`,
        {
          status: response.status,
          failureClass: detail.failureClass || null,
          code: detail.code || null,
        }
      );
    }
    return payload;
  };
  return { request, calls };
}

function exactIntegrationDecision(snapshot, tupleId, integrationId) {
  const tuple = snapshot?.tuples?.find((item) => item.id === tupleId);
  const decision = tuple?.integrationDecisions?.find(
    (item) => item.integrationId === integrationId
  );
  return { tuple, decision };
}

async function runPreflight(config, api) {
  const query = new URLSearchParams({
    tupleId: config.tupleId,
    integrationId: config.integrationId,
  });
  const [self, integrationsResponse, capabilities, server] = await Promise.all([
    api.request('/users/self'),
    api.request('/integrations/list'),
    api.request('/bulk/scheduler/capabilities'),
    api.request(`/bulk/scheduler/canary/preflight?${query.toString()}`),
  ]);
  if (self?.orgId !== config.organizationId || server?.organizationId !== config.organizationId) {
    throw new CanaryError(
      'canary_tenant_mismatch',
      'Authenticated and server-selected workspaces do not match the designated canary tenant.'
    );
  }
  const integrations = integrationsResponse?.integrations;
  const integration = Array.isArray(integrations)
    ? integrations.find((item) => item.id === config.integrationId)
    : null;
  if (!integration || server?.integration?.id !== config.integrationId) {
    throw new CanaryError(
      'canary_integration_not_found',
      'The exact designated canary connection was not returned for this tenant.'
    );
  }
  if (
    integration.name !== config.expectedDestinationLabel ||
    server.integration.name !== config.expectedDestinationLabel
  ) {
    throw new CanaryError(
      'canary_destination_label_mismatch',
      'The provider destination label does not exactly match the operator-approved test account.'
    );
  }
  if (
    integration.identifier !== server.tuple?.provider ||
    server.integration.providerIdentifier !== server.tuple?.provider
  ) {
    throw new CanaryError(
      'canary_provider_mismatch',
      'The selected connection provider does not match the exact matrix tuple.'
    );
  }
  if (
    integration.disabled ||
    server.integration.disabled ||
    server.integration.refreshNeeded ||
    server.integration.inBetweenSteps
  ) {
    throw new CanaryError(
      'canary_connection_not_healthy',
      'The designated provider test connection is disabled, reconnecting, or needs refresh.'
    );
  }
  const { tuple, decision } = exactIntegrationDecision(
    capabilities,
    config.tupleId,
    config.integrationId
  );
  if (!tuple || server.tuple?.id !== config.tupleId) {
    throw new CanaryError(
      'canary_tuple_mismatch',
      'The exact requested tuple is absent from one of the server matrix views.'
    );
  }
  if (!decision?.eligible || !server.decision?.eligible) {
    throw new CanaryError(
      server.decision?.code || decision?.code || 'canary_tuple_disabled',
      server.decision?.reason || decision?.reason || 'The exact tuple is disabled.'
    );
  }
  if (
    !server.canaryMode ||
    !server.materializerEnabled ||
    server.calendarWriterMode !== 'AUTHORITATIVE'
  ) {
    throw new CanaryError(
      'canary_runtime_not_ready',
      'Canary mode, the short-horizon materializer, and authoritative reservations must all be active.'
    );
  }
  if (
    server.tuple.defaultEligible !== false ||
    !server.tuple.privateTransportReady ||
    !server.tuple.confirmationImplemented ||
    !server.tuple.ambiguityRecoveryImplemented ||
    (server.tuple.transportMode === 'provider_pull' &&
      (!server.tuple.providerFetchPolicy ||
        !Number.isInteger(server.tuple.providerFetchPolicy.ttlSeconds)))
  ) {
    throw new CanaryError(
      'canary_tuple_proof_incomplete',
      'The tuple is customer-enabled too early or lacks an internal proof prerequisite.'
    );
  }
  if (
    !/^[a-f0-9]{64}$/.test(String(server.matrixHash || '')) ||
    !server.buildRevision ||
    server.buildRevision !== config.expectedBuildRevision
  ) {
    throw new CanaryError(
      'canary_build_revision_mismatch',
      'The server build revision or capability-matrix hash is missing or differs from the approved revision.'
    );
  }
  return {
    organizationId: server.organizationId,
    buildRevision: server.buildRevision,
    matrixHash: server.matrixHash,
    serverTime: server.serverTime,
    calendarWriterMode: server.calendarWriterMode,
    tuple: server.tuple,
    integration: server.integration,
    decision: server.decision,
  };
}

function targetSchedule(now) {
  let target = new Date(now.getTime() + 10 * 60_000);
  target.setUTCSeconds(0, 0);
  if (target.getUTCHours() === 23 && target.getUTCMinutes() > 56) {
    target = new Date(target.getTime() + 10 * 60_000);
    target.setUTCSeconds(0, 0);
  }
  const end = new Date(target.getTime() + 2 * 60_000);
  const hhmm = (value) =>
    `${String(value.getUTCHours()).padStart(2, '0')}:${String(
      value.getUTCMinutes()
    ).padStart(2, '0')}`;
  return {
    target,
    startDate: target.toISOString().slice(0, 10),
    weekday: target.getUTCDay(),
    windowStart: hhmm(target),
    windowEnd: hhmm(end),
  };
}

function buildIntent(config, runMarker, now) {
  const schedule = targetSchedule(now);
  return {
    intent: {
      schemaVersion: 1,
      selection: {
        destinations: [
          {
            integrationId: config.integrationId,
            capabilityTupleId: config.tupleId,
          },
        ],
      },
      distribution: { mode: 'cross_post' },
      cadence: { scope: 'per_account', postsPerDay: 1 },
      schedule: {
        startDate: schedule.startDate,
        endDate: schedule.startDate,
        weekdays: [schedule.weekday],
        timezone: 'UTC',
        windowStart: schedule.windowStart,
        windowEnd: schedule.windowEnd,
        spacingMinutes: 1,
        slotStrategy: 'fixed',
        conflictBehavior: 'next_available',
      },
      ordering: { mode: 'upload' },
      publication: {
        caption: `${runMarker} — controlled Publishly provider canary; safe to delete.`,
        settingsByTuple: {
          [config.tupleId]: { post_type: 'post', is_trial_reel: false },
        },
      },
    },
    scheduledAt: schedule.target.toISOString(),
  };
}

async function defaultUploadParts({ api, filePath, session }) {
  const handle = await open(filePath, 'r');
  try {
    for (let partNumber = 0; partNumber < session.totalParts; partNumber += 1) {
      const offset = partNumber * session.chunkSize;
      const byteLength = Math.min(
        session.chunkSize,
        session.expectedByteLength - offset
      );
      const buffer = Buffer.allocUnsafe(byteLength);
      const result = await handle.read(buffer, 0, byteLength, offset);
      if (result.bytesRead !== byteLength) {
        throw new CanaryError(
          'canary_media_changed_during_upload',
          'The local MP4 changed or ended while the canary was uploading it.'
        );
      }
      const form = new FormData();
      form.append(
        'chunk',
        new Blob([buffer], { type: 'application/octet-stream' }),
        `part-${partNumber}.bin`
      );
      await api.request(
        `/bulk/scheduler/campaigns/${encodeURIComponent(
          session.campaignId
        )}/uploads/${encodeURIComponent(session.id)}/parts/${partNumber}`,
        { method: 'PUT', body: form }
      );
    }
  } finally {
    await handle.close();
  }
}

async function pollBounded({ description, config, read, accept, sleep }) {
  const attempts = Math.ceil(config.timeoutMs / config.pollIntervalMs);
  let latest;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    latest = await read();
    const result = await accept(latest);
    if (result?.done) return result.value;
    if (attempt < attempts) await sleep(config.pollIntervalMs);
  }
  throw new CanaryError(
    'canary_poll_timeout',
    `${description} did not reach its required verified state within the bounded timeout.`,
    { latestState: latest?.state || latest?.deliveryStage || null }
  );
}

function assertCertification(job, publishingJob, receipts, tuple) {
  if (job.state !== 'PUBLISHED') {
    throw new CanaryError(
      'canary_campaign_not_published',
      'The campaign item was not durably marked PUBLISHED.'
    );
  }
  const confirmed = receipts?.receipts?.find(
    (receipt) => receipt.stage === 'confirmed_live'
  );
  if (
    publishingJob?.state !== 'PUBLISHED' ||
    publishingJob?.deliveryStage !== 'confirmed_live' ||
    !publishingJob.providerPostId ||
    !publishingJob.providerUrl ||
    !confirmed ||
    !confirmed.providerPostId ||
    !confirmed.providerUrl ||
    confirmed.confirmationMethod !== tuple.confirmationMethod
  ) {
    throw new CanaryError(
      'canary_not_confirmed_live',
      'Provider acceptance or sent state is insufficient; confirmed-live readback with provider identifiers is required.'
    );
  }
  const attempts = publishingJob.publishingAttempts;
  if (!Array.isArray(attempts) || attempts.length < 1) {
    throw new CanaryError(
      'canary_attempt_ledger_missing',
      'The V109 durable publishing-attempt ledger is missing.'
    );
  }
  if (
    !publishingJob._count ||
    publishingJob._count.publishingAttempts !== attempts.length ||
    publishingJob._count.bulkAssets !== (publishingJob.bulkAssets || []).length
  ) {
    throw new CanaryError(
      'canary_evidence_page_truncated',
      'The canary attempt or private-asset evidence exceeded its bounded API page.'
    );
  }
  const reconciliationFor = (attempt, states) =>
    attempts.some(
      (candidate) =>
        candidate.phase === 'RECONCILIATION' &&
        candidate.attemptNumber === attempt.attemptNumber &&
        states.includes(candidate.state)
    );
  const unresolved = attempts.find(
    (attempt) =>
      attempt.state === 'STARTED' ||
      attempt.state === 'NEEDS_REVIEW' ||
      (attempt.state === 'AMBIGUOUS' &&
        !reconciliationFor(attempt, ['CONFIRMED', 'ABSENT']))
  );
  if (unresolved) {
    throw new CanaryError(
      'canary_attempt_unresolved',
      'A durable publishing attempt is still started, ambiguous, or awaiting review.',
      { attemptId: unresolved.id, state: unresolved.state }
    );
  }
  if (
    !attempts.some(
      (attempt) =>
        attempt.phase === 'MUTATION' &&
        (attempt.state === 'ACCEPTED' ||
          (attempt.state === 'AMBIGUOUS' &&
            reconciliationFor(attempt, ['CONFIRMED'])))
    )
  ) {
    throw new CanaryError(
      'canary_mutation_attempt_missing',
      'No accepted V109 mutation attempt supports this confirmed-live result.'
    );
  }
  if (tuple.transportMode === 'provider_pull') {
    const grants = (publishingJob.bulkAssets || []).flatMap(
      (asset) => asset.providerGrants || []
    );
    const matching = grants.filter(
      (grant) => grant.capabilityTupleId === tuple.id
    );
    const truncated = (publishingJob.bulkAssets || []).some(
      (asset) =>
        !asset._count ||
        asset._count.providerGrants !== (asset.providerGrants || []).length ||
        (asset.providerGrants || []).some(
          (grant) =>
            !grant._count ||
            grant._count.fetchEvents !== (grant.fetchEvents || []).length
        )
    );
    const events = matching.flatMap((grant) => grant.fetchEvents || []);
    const servedGet = events.find(
      (event) =>
        event.method === 'GET' &&
        event.state === 'SERVED' &&
        Number(event.bytesServed) > 0 &&
        typeof event.code === 'string' &&
        event.code.length > 0 &&
        typeof event.reason === 'string' &&
        event.reason.length > 0
    );
    const unsafeFetch = events.find((event) =>
      ['FAILED', 'REJECTED', 'AUTHORIZED'].includes(event.state)
    );
    if (
      matching.length < 1 ||
      truncated ||
      !matching.some((grant) => Number(grant.fetchCount) > 0) ||
      !servedGet ||
      unsafeFetch
    ) {
      throw new CanaryError(
        'canary_private_transport_unproved',
        'Confirmed-live provider-pull certification also requires one classified served GET and no unresolved or rejected private-media fetch.',
        { grantCount: matching.length, fetchEventCount: events.length }
      );
    }
  }
  return confirmed;
}

async function executeCanary(config, preflight, api, dependencies) {
  const runId = dependencies.randomId();
  const runMarker = `PUBLISHLY-CANARY-${runId}`;
  const startedAt = dependencies.now().toISOString();
  const media = await dependencies.inspectMedia(config.mediaFile);
  const built = buildIntent(config, runMarker, dependencies.now());
  const campaign = await api.request('/bulk/scheduler/campaigns', {
    method: 'POST',
    headers: { 'idempotency-key': `canary-campaign-${runId}` },
    json: { name: runMarker, intent: built.intent },
  });
  if (!campaign?.id) {
    throw new CanaryError(
      'canary_campaign_missing',
      'Campaign creation returned no durable campaign ID.'
    );
  }
  const clientUploadId = `canary_asset_${runId.replace(/-/g, '')}`;
  const initiated = await api.request(
    `/bulk/scheduler/campaigns/${encodeURIComponent(campaign.id)}/uploads`,
    {
      method: 'POST',
      headers: { 'idempotency-key': `canary-upload-${runId}` },
      json: {
        files: [
          {
            clientUploadId,
            originalName: media.originalName,
            relativePath: `canary/${runId}.mp4`,
            byteLength: media.byteLength,
            mimeType: 'video/mp4',
          },
        ],
      },
    }
  );
  if (!Array.isArray(initiated?.sessions) || initiated.sessions.length !== 1) {
    throw new CanaryError(
      'canary_upload_expansion_mismatch',
      'The native upload initiation did not return exactly one session.'
    );
  }
  const session = initiated.sessions[0];
  await dependencies.uploadParts({
    api,
    filePath: config.mediaFile,
    session: { ...session, campaignId: campaign.id },
  });
  await api.request(
    `/bulk/scheduler/campaigns/${encodeURIComponent(
      campaign.id
    )}/uploads/${encodeURIComponent(session.id)}/complete`,
    { method: 'POST' }
  );
  const readyUpload = await pollBounded({
    description: 'Native upload validation/normalization',
    config,
    sleep: dependencies.sleep,
    read: () =>
      api.request(
        `/bulk/scheduler/campaigns/${encodeURIComponent(
          campaign.id
        )}/uploads/${encodeURIComponent(session.id)}`
      ),
    accept: async (upload) => {
      if (upload?.state === 'READY') return { done: true, value: upload };
      if (TERMINAL_UPLOAD_STATES.has(upload?.state)) {
        const outcome = assertDurableOutcome(upload, 'upload');
        throw new CanaryError(outcome.code, outcome.reason, {
          state: upload.state,
          failureClass: outcome.failureClass,
        });
      }
      return { done: false };
    },
  });
  const plan = await api.request(
    `/bulk/scheduler/campaigns/${encodeURIComponent(campaign.id)}/plan`,
    { method: 'POST' }
  );
  if (
    plan?.expansion?.assetCount !== 1 ||
    plan?.expansion?.destinationCount !== 1 ||
    plan?.expansion?.expandedJobCount !== 1 ||
    plan?.overflowCount !== 0
  ) {
    throw new CanaryError(
      'canary_expansion_mismatch',
      'The provider canary must prove exactly 1 asset × 1 destination = 1 job with zero overflow.',
      { expansion: plan?.expansion || null, overflowCount: plan?.overflowCount }
    );
  }
  const firstPage = await api.request(
    `/bulk/scheduler/campaigns/${encodeURIComponent(campaign.id)}/jobs?limit=2`
  );
  if (
    !Array.isArray(firstPage?.items) ||
    firstPage.items.length !== 1 ||
    firstPage.nextCursor ||
    !firstPage.items[0].reservationId
  ) {
    throw new CanaryError(
      'canary_reservation_mismatch',
      'The canary needs exactly one authoritative reserved campaign item.'
    );
  }
  let latestPublishingJob = null;
  let latestReceipts = null;
  const publishedJob = await pollBounded({
    description: 'V109 provider confirmation',
    config,
    sleep: dependencies.sleep,
    read: async () => {
      const page = await api.request(
        `/bulk/scheduler/campaigns/${encodeURIComponent(campaign.id)}/jobs?limit=2`
      );
      if (!Array.isArray(page?.items) || page.items.length !== 1) {
        throw new CanaryError(
          'canary_job_count_changed',
          'The canary campaign no longer contains exactly one job.'
        );
      }
      return page.items[0];
    },
    accept: async (job) => {
      if (TERMINAL_JOB_STATES.has(job?.state)) {
        const issuePage = await api.request(
          `/bulk/scheduler/campaigns/${encodeURIComponent(
            campaign.id
          )}/issues?limit=100`
        );
        const issue = (issuePage?.items || []).find(
          (item) => item.subjectId === job.id && item.code === job.outcomeCode
        );
        const outcome = assertDurableOutcome(issue, 'campaign job');
        throw new CanaryError(outcome.code, outcome.reason, {
          state: job.state,
          failureClass: outcome.failureClass,
        });
      }
      if (!job?.postId) return { done: false };
      [latestPublishingJob, latestReceipts] = await Promise.all([
        api.request(`/posts/${encodeURIComponent(job.postId)}/publishing-job`),
        api.request(`/posts/${encodeURIComponent(job.postId)}/receipts`),
      ]);
      if (latestPublishingJob?.state === 'FAILED') {
        const outcome = assertDurableOutcome(latestPublishingJob, 'publishing job');
        throw new CanaryError(outcome.code, outcome.reason, {
          state: latestPublishingJob.state,
          failureClass: outcome.failureClass,
        });
      }
      if (
        job.state === 'PUBLISHED' ||
        latestPublishingJob?.deliveryStage === 'confirmed_live'
      ) {
        assertCertification(
          job,
          latestPublishingJob,
          latestReceipts,
          preflight.tuple
        );
        return { done: true, value: job };
      }
      return { done: false };
    },
  });
  const confirmedReceipt = assertCertification(
    publishedJob,
    latestPublishingJob,
    latestReceipts,
    preflight.tuple
  );
  const issues = await api.request(
    `/bulk/scheduler/campaigns/${encodeURIComponent(campaign.id)}/issues?limit=100`
  );
  const unresolvedIssues = (issues?.items || []).filter(
    (issue) => issue.state !== 'resolved'
  );
  if (unresolvedIssues.length) {
    unresolvedIssues.forEach((issue) => assertDurableOutcome(issue, 'campaign issue'));
    throw new CanaryError(
      'canary_unresolved_campaign_issues',
      'The confirmed campaign still has unresolved durable issues.',
      { issueCount: unresolvedIssues.length }
    );
  }
  return {
    runId,
    runMarker,
    startedAt,
    completedAt: dependencies.now().toISOString(),
    scheduledIntentAt: built.scheduledAt,
    media,
    campaign: { id: campaign.id, revision: campaign.currentRevision },
    upload: {
      id: readyUpload.id,
      assetId: readyUpload.assetId,
      state: readyUpload.state,
      normalizationApplied: readyUpload.normalizationApplied,
      metadata: readyUpload.metadata,
    },
    plan,
    campaignJob: publishedJob,
    publishingJob: latestPublishingJob,
    receipts: latestReceipts,
    confirmedReceipt,
    issues: issues?.items || [],
  };
}

async function runCanary(options = {}) {
  const environment = options.environment || process.env;
  const mode = options.mode || 'preflight';
  const config = parseConfiguration(environment, mode);
  const dependencies = {
    fetch: options.fetchImpl || global.fetch,
    inspectMedia: options.inspectMedia || defaultInspectMedia,
    uploadParts: options.uploadParts || defaultUploadParts,
    writeEvidence: options.writeEvidence || defaultWriteEvidence,
    randomId: options.randomId || randomUUID,
    now: options.now || (() => new Date()),
    sleep:
      options.sleep ||
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
  if (typeof dependencies.fetch !== 'function') {
    throw new CanaryError(
      'canary_fetch_unavailable',
      'This command requires Node.js 22 with global fetch support.'
    );
  }
  const api = createApi(config, dependencies.fetch);
  const preflight = await runPreflight(config, api);
  if (mode === 'preflight') {
    return {
      verdict: 'READY_FOR_EXPLICIT_EXECUTION',
      mode,
      preflight,
      requestSummary: api.calls,
    };
  }
  const artifactBase = {
    schemaVersion: 1,
    kind: 'publishly_bulk_scheduler_real_provider_canary',
    mode,
    tupleId: config.tupleId,
    integrationId: config.integrationId,
    destinationLabel: config.expectedDestinationLabel,
    buildRevision: preflight.buildRevision,
    matrixHash: preflight.matrixHash,
    preflight,
  };
  try {
    const execution = await executeCanary(config, preflight, api, dependencies);
    const artifact = assertEvidenceSafe(
      redactEvidence(
        {
          ...artifactBase,
          verdict: 'PASS',
          executed: true,
          execution,
          requestSummary: api.calls,
        },
        [config.authToken, config.confirmation]
      ),
      [config.authToken, config.confirmation]
    );
    await dependencies.writeEvidence(config.evidenceFile, artifact);
    return { ...artifact, evidenceFile: config.evidenceFile };
  } catch (error) {
    const canaryError =
      error instanceof CanaryError
        ? error
        : new CanaryError(
            'canary_unexpected_failure',
            error instanceof Error ? error.message : 'Unexpected canary failure.'
          );
    const artifact = assertEvidenceSafe(
      redactEvidence(
        {
          ...artifactBase,
          verdict: 'FAIL',
          executed: true,
          completedAt: dependencies.now().toISOString(),
          failure: {
            code: canaryError.code,
            reason: canaryError.message,
            details: canaryError.details || null,
          },
          requestSummary: api.calls,
        },
        [config.authToken, config.confirmation]
      ),
      [config.authToken, config.confirmation]
    );
    await dependencies.writeEvidence(config.evidenceFile, artifact);
    canaryError.evidenceFile = config.evidenceFile;
    throw canaryError;
  }
}

function usage() {
  return [
    'Usage:',
    '  pnpm canary:bulk-scheduler -- --preflight',
    '  pnpm canary:bulk-scheduler -- --execute',
    '',
    'Preflight is read-only. --execute additionally requires the exact',
    'confirmation phrase, test-account attestation, local MP4, and evidence path.',
  ].join('\n');
}

async function main(argv) {
  const selected = argv.filter((arg) =>
    ['--preflight', '--execute'].includes(arg)
  );
  if (selected.length !== 1 || argv.some((arg) => !selected.includes(arg))) {
    throw new CanaryError('canary_cli_usage', usage());
  }
  const mode = selected[0] === '--execute' ? 'execute' : 'preflight';
  const result = await runCanary({ mode });
  process.stdout.write(
    `${JSON.stringify(
      {
        verdict: result.verdict,
        mode,
        tupleId: result.tupleId || result.preflight?.tuple?.id,
        buildRevision: result.buildRevision || result.preflight?.buildRevision,
        matrixHash: result.matrixHash || result.preflight?.matrixHash,
        evidenceFile: result.evidenceFile || null,
      },
      null,
      2
    )}\n`
  );
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    const failure =
      error instanceof CanaryError
        ? error
        : new CanaryError(
            'canary_unexpected_failure',
            error instanceof Error ? error.message : 'Unexpected canary failure.'
          );
    process.stderr.write(
      `${JSON.stringify(
        {
          verdict: 'FAIL',
          code: failure.code,
          reason: failure.message,
          evidenceFile: failure.evidenceFile || null,
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  CanaryError,
  EXECUTION_ATTESTATION,
  assertCertification,
  assertDurableOutcome,
  assertEvidenceSafe,
  buildIntent,
  parseConfiguration,
  redactEvidence,
  runCanary,
  targetSchedule,
};
