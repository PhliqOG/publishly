#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'deploy', 'canary', 'compose.yaml');
const RUNTIME_ROOT = path.join(REPO_ROOT, '.runtime', 'bulk-canary');
const ACTIVE_FILE = path.join(RUNTIME_ROOT, 'active.json');
const TUPLE_ID = 'instagram.professional.reel.video';
const ATTESTATION = 'publishly-owned-test-account-no-customer-data';
const TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi;
const MIN_HOST_FREE_BYTES = 12 * 1024 * 1024 * 1024;
const BUILD_TIMEOUT_MS = 25 * 60 * 1000;
const SERVICE_START_TIMEOUT_MS = 12 * 60 * 1000;
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000;
const BUILDKIT_HISTORY_LIST_TIMEOUT_MS = 90 * 1000;
const BUILDX_INSPECT_TIMEOUT_MS = 90 * 1000;
const BUILDX_INSPECT_ATTEMPTS = 3;
const BUILD_CONTEXT_TIMEOUT_MS = 2 * 60 * 1000;
const BUILD_CONTEXT_ARCHIVE_NAME = 'build-context.tar';
const BUILD_CONTEXT_FILE_LIST_NAME = 'build-context-files.txt';
const WORKSPACE_DIGEST_FILES = new Set([
  '.dockerignore',
  '.npmrc',
  'Dockerfile',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/backend/package.json',
  'apps/commands/package.json',
  'apps/extension/package.json',
  'apps/frontend/package.json',
  'apps/orchestrator/package.json',
  'apps/sdk/package.json',
  'scripts/build-server-runtime.cjs',
  'scripts/bulk-scheduler-canary-stack.cjs',
  'scripts/bulk-scheduler-canary.cjs',
  'scripts/provision-bulk-canary.cjs',
  'scripts/verify-bulk-canary-env.cjs',
]);
const WORKSPACE_DIGEST_PREFIXES = Object.freeze([
  'apps/backend/src/',
  'apps/frontend/scripts/',
  'apps/orchestrator/src/',
  'data/',
  'deploy/canary/',
  'deploy/server-runtime/',
  'libraries/helpers/src/',
  'libraries/nestjs-libraries/src/',
  'patches/',
]);

class StackError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'StackError';
    this.code = code;
    this.details = details || null;
  }
}

function safeSlug(input) {
  const normalized = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(normalized)) {
    throw new StackError(
      'canary_run_id_invalid',
      'The canary run ID must normalize to 8-64 lowercase letters, digits, or hyphens.'
    );
  }
  return normalized;
}

function generatedRunId(now = new Date()) {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z')
    .toLowerCase();
  return safeSlug(
    `stage8-${timestamp}-${crypto.randomBytes(4).toString('hex')}`
  );
}

function randomSecret(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function normalizePath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function composeProjectName(runId) {
  const slug = safeSlug(runId);
  const digest = crypto.createHash('sha256').update(slug).digest('hex');
  return `publishly-canary-${slug.slice(-24)}-${digest.slice(0, 12)}`;
}

function selectedBuildxBuilder(
  environment = process.env,
  platform = process.platform
) {
  const value = String(
    environment.PUBLISHLY_CANARY_BUILDER ||
      (platform === 'win32' ? 'desktop-linux' : 'default')
  ).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) {
    throw new StackError(
      'canary_buildx_builder_invalid',
      'PUBLISHLY_CANARY_BUILDER must be a valid Buildx builder name.'
    );
  }
  return value;
}

function selectedDockerContext(
  environment = process.env,
  platform = process.platform
) {
  const value = String(
    environment.PUBLISHLY_CANARY_DOCKER_CONTEXT ||
      (platform === 'win32' ? 'desktop-linux' : 'default')
  ).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) {
    throw new StackError(
      'canary_docker_context_invalid',
      'PUBLISHLY_CANARY_DOCKER_CONTEXT must be a valid Docker context name.'
    );
  }
  return value;
}

function dockerContextFor(manifest) {
  return manifest.dockerContext || selectedDockerContext();
}

function dockerInvocationArgs(manifest, args) {
  return ['--context', dockerContextFor(manifest), ...args];
}

function buildxBuilderFromInspection(output) {
  return (
    /^Name:\s+([^\r\n]+)\s*$/im.exec(String(output || ''))?.[1]?.trim() || null
  );
}

function buildxInspectionOutcome(record, expectedBuilder) {
  const observedBuilder = buildxBuilderFromInspection(record?.stdout);
  if (observedBuilder && observedBuilder !== expectedBuilder) {
    return { state: 'mismatch', observedBuilder };
  }
  if (
    record?.exitCode === 0 &&
    observedBuilder === expectedBuilder &&
    /^Status:\s+running\s*$/im.test(record.stdout)
  ) {
    return { state: 'ready', observedBuilder };
  }
  return { state: 'retry', observedBuilder };
}

function beginAttempt(manifest, startedAt = new Date().toISOString()) {
  const attemptHistory = Array.isArray(manifest.attemptHistory)
    ? [...manifest.attemptHistory]
    : [];
  if (manifest.failure) {
    attemptHistory.push({
      attemptNumber: manifest.attemptNumber || 1,
      startedAt: manifest.startedAt || null,
      failedAt: manifest.failedAt || null,
      failure: manifest.failure,
      failureCleanup: manifest.failureCleanup || null,
    });
  }
  const {
    failedAt: _failedAt,
    failure: _failure,
    failureCleanup: _failureCleanup,
    fixtureBytes: _fixtureBytes,
    fixtureFile: _fixtureFile,
    fixtureSha256: _fixtureSha256,
    mediaRuntime: _mediaRuntime,
    publicOrigin: _publicOrigin,
    readyAt: _readyAt,
    runtimeNode: _runtimeNode,
    stoppedAt: _stoppedAt,
    ...stable
  } = manifest;
  return {
    ...stable,
    state: 'starting',
    startedAt,
    attemptNumber: (manifest.attemptNumber || 0) + 1,
    attemptHistory,
    publicOrigin: null,
    providerCertified: false,
  };
}

function buildxHistoryRecordId(ref) {
  const value = String(ref || '').trim();
  const recordId = value.split('/').filter(Boolean).at(-1) || '';
  if (!/^[a-z0-9]{8,128}$/i.test(recordId)) return null;
  return recordId;
}

function requiredImageLabels(manifest) {
  return {
    'com.docker.compose.project':
      manifest.composeProject || composeProjectName(manifest.runId),
    'com.docker.compose.service': 'backend',
    'com.publishly.canary.run': manifest.runId,
    'org.opencontainers.image.revision': manifest.buildRevision,
  };
}

function directBuildArguments(manifest) {
  const labels = requiredImageLabels(manifest);
  return [
    'buildx',
    'build',
    '--builder',
    manifest.buildxBuilder,
    '--progress',
    'plain',
    '--target',
    'server-runtime',
    '--tag',
    `publishly-canary:${manifest.imageTag}`,
    ...Object.entries(labels).flatMap(([name, value]) => [
      '--label',
      `${name}=${value}`,
    ]),
    '--load',
    '--file',
    'Dockerfile',
    '-',
  ];
}

function classifiedFailureMarker(output) {
  const markers = [
    ...String(output || '').matchAll(
      /^#\d+\s+(?:\d+(?:\.\d+)?\s+)?class=(recoverable|user_action_needed|data_problem|final_failure) code=([a-z][a-z0-9_]{2,127}) reason=([^\r\n]{1,500})$/gm
    ),
  ];
  const marker = markers.at(-1);
  return marker
    ? {
        failureClass: marker[1],
        code: marker[2],
        reason: marker[3].trim(),
      }
    : null;
}

function classifyBuildError(error) {
  if (
    error instanceof StackError &&
    error.code === 'canary_command_failed'
  ) {
    const marker =
      error.details?.failureMarker ||
      classifiedFailureMarker(error.details?.stderr);
    if (marker) {
      return new StackError(marker.code, marker.reason, {
        ...error.details,
        failureClass: marker.failureClass,
        recoverable: marker.failureClass === 'recoverable',
      });
    }
  }
  if (
    error instanceof StackError &&
    error.code === 'canary_command_failed' &&
    /frontend grpc server closed unexpectedly/i.test(
      error.details?.stderr || ''
    )
  ) {
    return new StackError(
      'canary_buildkit_frontend_terminated',
      'The BuildKit Dockerfile frontend terminated unexpectedly before the image was created.',
      { ...error.details, recoverable: true }
    );
  }
  if (
    error instanceof StackError &&
    error.code === 'canary_command_failed' &&
    /\bcontext canceled\b/i.test(error.details?.stderr || '')
  ) {
    return new StackError(
      'canary_buildkit_context_canceled',
      'BuildKit canceled the build context before the image was created.',
      { ...error.details, recoverable: true }
    );
  }
  return error;
}

function hostFreeBytes() {
  try {
    const stats = fs.statfsSync(REPO_ROOT, { bigint: true });
    return Number(stats.bavail * stats.bsize);
  } catch (error) {
    throw new StackError(
      'canary_disk_preflight_unavailable',
      `Host free space could not be measured: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function assertHostCapacity(
  availableBytes = hostFreeBytes(),
  minimumBytes = MIN_HOST_FREE_BYTES
) {
  if (
    !Number.isSafeInteger(availableBytes) ||
    availableBytes < 0 ||
    !Number.isSafeInteger(minimumBytes) ||
    minimumBytes <= 0
  ) {
    throw new StackError(
      'canary_disk_preflight_invalid',
      'The host disk preflight returned an invalid byte count.'
    );
  }
  if (availableBytes < minimumBytes) {
    throw new StackError(
      'canary_disk_capacity_insufficient',
      `The canary requires at least ${(
        minimumBytes /
        1024 /
        1024 /
        1024
      ).toFixed(0)} GiB free on the repository volume; only ${(
        availableBytes /
        1024 /
        1024 /
        1024
      ).toFixed(2)} GiB is available.`
    );
  }
  return availableBytes;
}

function parseEnv(contents) {
  const values = {};
  for (const line of String(contents).split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

function serializeEnv(values) {
  return (
    Object.entries(values)
      .map(([key, raw]) => {
        const value = String(raw ?? '');
        if (/[\r\n]/.test(value)) {
          throw new StackError(
            'canary_env_value_invalid',
            `${key} contains a newline and cannot be written safely.`
          );
        }
        return `${key}=${value}`;
      })
      .join('\n') + '\n'
  );
}

function run(command, args, options = {}) {
  if (options.timeoutMs !== undefined) {
    throw new StackError(
      'canary_command_timeout_api_invalid',
      'Bounded commands must use runBounded so descendant processes are terminated.'
    );
  }
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  const record = {
    command: [command, ...args].join(' '),
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    signal: result.signal || null,
    timedOut: false,
    stdout: options.inherit ? '' : result.stdout || '',
    stderr: options.inherit ? '' : result.stderr || '',
  };
  if (options.evidenceFile) {
    fs.appendFileSync(options.evidenceFile, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
  if (result.error) {
    throw new StackError(
      'canary_command_unavailable',
      `${command} could not be started: ${result.error.message}`
    );
  }
  if (exitCode !== 0 && options.allowFailure !== true) {
    throw new StackError(
      'canary_command_failed',
      `${command} exited with code ${exitCode}.`,
      {
        command: record.command,
        stderr: record.stderr.slice(-4000),
        failureMarker: classifiedFailureMarker(record.stderr),
      }
    );
  }
  return record;
}

function terminateProcessTree(child) {
  if (!child?.pid) return { attempted: false, exitCode: null };
  if (process.platform === 'win32') {
    const result = spawnSync(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      }
    );
    return {
      attempted: true,
      method: 'taskkill-tree',
      exitCode: typeof result.status === 'number' ? result.status : 1,
      stderr: String(result.stderr || '').slice(-1000),
    };
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
    return { attempted: true, method: 'process-group-sigterm', exitCode: 0 };
  } catch (error) {
    return {
      attempted: true,
      method: 'process-group-sigterm',
      exitCode: 1,
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

function runBounded(command, args, options = {}) {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new StackError(
      'canary_command_timeout_invalid',
      'A bounded command requires a positive integer timeoutMs.'
    );
  }
  if (
    options.stdinFile &&
    (!options.stdinEvidence ||
      !/^sha256:[a-f0-9]{64}$/.test(options.stdinEvidence.sha256 || '') ||
      !Number.isSafeInteger(options.stdinEvidence.bytes) ||
      options.stdinEvidence.bytes <= 0)
  ) {
    throw new StackError(
      'canary_command_stdin_metadata_invalid',
      'A bounded stdin file requires a verified SHA-256 digest and positive byte count.'
    );
  }
  return new Promise((resolve, reject) => {
    const startedAt = new Date().toISOString();
    const maxBuffer = options.maxBuffer || 64 * 1024 * 1024;
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let timedOut = false;
    let overflow = false;
    let termination = null;
    let finished = false;
    let stdinDescriptor = null;
    let child;
    try {
      if (options.stdinFile) {
        stdinDescriptor = fs.openSync(options.stdinFile, 'r');
      }
      child = spawn(command, args, {
        cwd: options.cwd || REPO_ROOT,
        env: options.env || process.env,
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: [stdinDescriptor ?? 'ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (stdinDescriptor !== null) fs.closeSync(stdinDescriptor);
      reject(
        new StackError(
          'canary_command_unavailable',
          `${command} could not be started: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
      return;
    }
    const capture = (stream, chunk) => {
      const text = chunk.toString('utf8');
      if (options.inherit) stream.write(text);
      if (stream === process.stdout) stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > maxBuffer && !overflow) {
        overflow = true;
        termination = terminateProcessTree(child);
      }
    };
    child.stdout.on('data', (chunk) => capture(process.stdout, chunk));
    child.stderr.on('data', (chunk) => capture(process.stderr, chunk));
    child.once('error', (error) => {
      spawnError = error;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      termination = terminateProcessTree(child);
    }, options.timeoutMs);
    child.once('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (stdinDescriptor !== null) {
        fs.closeSync(stdinDescriptor);
        stdinDescriptor = null;
      }
      const exitCode = typeof code === 'number' ? code : 1;
      const record = {
        command: [command, ...args].join(' '),
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode,
        signal: signal || null,
        timedOut,
        outputOverflow: overflow,
        termination,
        stdin: options.stdinEvidence || null,
        stdout,
        stderr,
      };
      if (options.evidenceFile) {
        fs.appendFileSync(options.evidenceFile, `${JSON.stringify(record)}\n`, {
          encoding: 'utf8',
          mode: 0o600,
        });
      }
      if (timedOut) {
        reject(
          new StackError(
            'canary_command_timeout',
            `${command} exceeded its ${Math.ceil(
              options.timeoutMs / 60000
            )}-minute timeout.`,
            { command: record.command, timeoutMs: options.timeoutMs }
          )
        );
        return;
      }
      if (overflow) {
        reject(
          new StackError(
            'canary_command_output_overflow',
            `${command} exceeded its bounded output buffer.`,
            { command: record.command, maxBuffer }
          )
        );
        return;
      }
      if (spawnError) {
        reject(
          new StackError(
            'canary_command_unavailable',
            `${command} could not be started: ${spawnError.message}`
          )
        );
        return;
      }
      if (exitCode !== 0 && options.allowFailure !== true) {
        reject(
          new StackError(
            'canary_command_failed',
            `${command} exited with code ${exitCode}.`,
            {
              command: record.command,
              stderr: record.stderr.slice(-4000),
              failureMarker: classifiedFailureMarker(record.stderr),
            }
          )
        );
        return;
      }
      resolve(record);
    });
  });
}

function isWorkspaceDigestInput(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (
    /(^|\/)__tests__(\/|$)/.test(normalized) ||
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(normalized)
  ) {
    return false;
  }
  return (
    WORKSPACE_DIGEST_FILES.has(normalized) ||
    WORKSPACE_DIGEST_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

function workspaceDigestFiles(listing) {
  return [...new Set(listing)]
    .filter(Boolean)
    .map((relative) => relative.replace(/\\/g, '/'))
    .filter(isWorkspaceDigestInput)
    .sort((left, right) => left.localeCompare(right));
}

function workspaceInputFiles() {
  const listing = run('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]).stdout;
  const files = workspaceDigestFiles(listing.split('\0'));
  if (!files.length) {
    throw new StackError(
      'canary_workspace_empty',
      'No source files were found for the immutable workspace digest.'
    );
  }
  const unsafe = files.find((relative) => /[\r\n]/.test(relative));
  if (unsafe) {
    throw new StackError(
      'canary_build_context_path_invalid',
      'An effective build input contains a newline and cannot enter the archive safely.'
    );
  }
  return files;
}

function workspaceDigest(files = workspaceInputFiles()) {
  const digest = crypto.createHash('sha256');
  for (const relative of files) {
    const absolute = path.join(REPO_ROOT, relative);
    const details = fs.statSync(absolute);
    if (!details.isFile()) continue;
    digest.update(relative.replace(/\\/g, '/'));
    digest.update('\0');
    digest.update(fs.readFileSync(absolute));
    digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

function fileDigest(filePath) {
  const digest = crypto.createHash('sha256');
  digest.update(fs.readFileSync(filePath));
  return `sha256:${digest.digest('hex')}`;
}

function buildContextMetadata(filePath) {
  const details = fs.statSync(filePath);
  if (!details.isFile() || !Number.isSafeInteger(details.size) || details.size <= 0) {
    throw new StackError(
      'canary_build_context_archive_invalid',
      'The immutable build-context archive is missing or empty.'
    );
  }
  return {
    sha256: fileDigest(filePath),
    bytes: details.size,
  };
}

async function createBuildContextArchive(runDirectory, files, evidenceFile) {
  const archiveFile = path.join(runDirectory, BUILD_CONTEXT_ARCHIVE_NAME);
  const listFile = path.join(runDirectory, BUILD_CONTEXT_FILE_LIST_NAME);
  await writeRestricted(listFile, `${files.join('\n')}\n`);
  await runBounded(
    'tar',
    ['--create', '--file', archiveFile, '--files-from', listFile],
    {
      cwd: REPO_ROOT,
      timeoutMs: BUILD_CONTEXT_TIMEOUT_MS,
      evidenceFile,
    }
  );
  await fsp.chmod(archiveFile, 0o600).catch(() => undefined);
  return {
    archiveFile: normalizePath(archiveFile),
    fileList: normalizePath(listFile),
    fileCount: files.length,
    ...buildContextMetadata(archiveFile),
  };
}

function assertBuildContextArchive(manifest) {
  const expectedFile = path.resolve(
    manifest.runDirectory,
    BUILD_CONTEXT_ARCHIVE_NAME
  );
  const observedFile = path.resolve(manifest.buildContextArchive || '');
  if (observedFile !== expectedFile) {
    throw new StackError(
      'canary_build_context_path_mismatch',
      'The build-context archive is not the exact file owned by this canary run.'
    );
  }
  let observed;
  try {
    observed = buildContextMetadata(observedFile);
  } catch (error) {
    if (error instanceof StackError) throw error;
    throw new StackError(
      'canary_build_context_archive_missing',
      'The immutable build-context archive is unavailable.',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
  if (
    observed.sha256 !== manifest.buildContextSha256 ||
    observed.bytes !== manifest.buildContextBytes
  ) {
    throw new StackError(
      'canary_build_context_archive_changed',
      'The immutable build-context archive changed after the run was prepared.',
      {
        expectedSha256: manifest.buildContextSha256,
        observedSha256: observed.sha256,
        expectedBytes: manifest.buildContextBytes,
        observedBytes: observed.bytes,
      }
    );
  }
  return observed;
}

async function availablePort(preferred) {
  const start = Number(preferred) || 43180;
  for (let port = start; port < start + 50; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new StackError(
    'canary_gateway_port_unavailable',
    `No local gateway port was available from ${start} through ${start + 49}.`
  );
}

async function writeRestricted(filePath, contents) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, contents, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  await fsp.chmod(filePath, 0o600).catch(() => undefined);
}

async function writeJson(filePath, value, exclusive = false) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  if (exclusive) return writeRestricted(filePath, contents);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(temp, contents, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(temp, filePath);
  await fsp.chmod(filePath, 0o600).catch(() => undefined);
}

function initialEnvironment(input) {
  const origin = 'https://pending.invalid';
  const runSuffix = input.runId.slice(-40);
  const storageKey = `canary${crypto.randomBytes(8).toString('hex')}`;
  const storageSecret = randomSecret(36);
  return {
    NODE_ENV: 'production',
    PUBLISHLY_RUNTIME_PROFILE: 'provider_canary',
    PUBLISHLY_DOMAIN: 'pending.invalid',
    PUBLISHLY_IMAGE_TAG: `stage8-${input.buildRevision.slice(-16)}`,
    PUBLISHLY_BUILD_REVISION: input.buildRevision,
    NEXT_PUBLIC_BRAND_NAME: 'Publishly',
    DATABASE_PASSWORD: randomSecret(36),
    TEMPORAL_DATABASE_PASSWORD: randomSecret(36),
    DATABASE_URL: '',
    REDIS_URL: 'redis://redis:6379',
    TEMPORAL_ADDRESS: 'temporal:7233',
    TEMPORAL_NAMESPACE: `publishly-canary-${runSuffix}`,
    WORKER_DEFAULT_ACTIVITY_CONCURRENCY: '8',
    WORKER_DEFAULT_WORKFLOW_CONCURRENCY: '4',
    WORKER_ACTIVITY_POLLS: '2',
    WORKER_WORKFLOW_POLLS: '2',
    ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS: '180',
    MAIN_URL: origin,
    FRONTEND_URL: origin,
    NEXT_PUBLIC_BACKEND_URL: `${origin}/api`,
    BACKEND_INTERNAL_URL: 'http://backend:3000',
    MOBILE_APP_SCHEME: 'publishly-canary://auth/callback',
    JWT_SECRET: randomSecret(64),
    ENCRYPTION_SECRET: randomSecret(64),
    CONFIG_STRICT: 'true',
    IS_GENERAL: 'true',
    DISABLE_REGISTRATION: 'true',
    NOT_SECURED: '',
    ALLOW_LEGACY_API_KEYS: 'false',
    ENABLE_TEST_PROVIDER: '',
    STORAGE_PROVIDER: 's3',
    S3_ENDPOINT: 'http://minio:9000',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: storageKey,
    S3_SECRET_ACCESS_KEY: storageSecret,
    S3_BUCKET: `publishly-canary-public-${runSuffix}`,
    S3_PUBLIC_URL: `${origin}/canary-media`,
    S3_FORCE_PATH_STYLE: 'true',
    REMOTE_MEDIA_MAX_BYTES: '104857600',
    MEDIA_DELETE_RETENTION_DAYS: '1',
    PUBLISHLY_REQUIRED_PROVIDERS: '',
    META_GRAPH_VERSION: 'v25.0',
    EMAIL_PROVIDER: '',
    EMAIL_FROM_ADDRESS: '',
    EMAIL_FROM_NAME: '',
    STRIPE_PUBLISHABLE_KEY: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_SIGNING_KEY: '',
    BULK_SCHEDULER_KILL_ALL: 'false',
    BULK_SCHEDULER_CANARY_MODE: 'true',
    BULK_SCHEDULER_CANARY_TUPLES: TUPLE_ID,
    BULK_SCHEDULER_CANARY_INTEGRATIONS: input.integrationId,
    BULK_SCHEDULER_MATERIALIZER_ENABLED: 'true',
    BULK_SCHEDULER_MATERIALIZE_HORIZON_HOURS: '24',
    BULK_SCHEDULER_MATERIALIZE_BATCH: '25',
    BULK_SCHEDULER_MATERIALIZE_LEASE_SECONDS: '600',
    BULK_SCHEDULER_KILL_INSTAGRAM_PROFESSIONAL_REEL_VIDEO: 'false',
    PROVIDER_MEDIA_BASE_URL: `${origin}/api`,
    BULK_PRIVATE_INTERNAL_TOKEN: randomSecret(48),
    BULK_PRIVATE_STORAGE_PROVIDER: 's3',
    BULK_PRIVATE_S3_ENDPOINT: '',
    BULK_PRIVATE_S3_REGION: 'us-east-1',
    BULK_PRIVATE_S3_ACCESS_KEY_ID: storageKey,
    BULK_PRIVATE_S3_SECRET_ACCESS_KEY: storageSecret,
    BULK_PRIVATE_S3_BUCKET: `publishly-canary-private-${runSuffix}`,
    BULK_PRIVATE_S3_FORCE_PATH_STYLE: 'true',
    CALENDAR_RESERVATION_KILL_ALL: 'false',
    CALENDAR_RESERVATION_SHADOW_ENABLED: 'true',
    CALENDAR_RESERVATION_ENFORCEMENT: 'true',
    CALENDAR_RESERVATION_ENFORCED_TENANTS: input.organizationId,
    MINIO_ROOT_USER: storageKey,
    MINIO_ROOT_PASSWORD: storageSecret,
    BULK_CANARY_RUN_ID: input.runId,
    BULK_CANARY_ORGANIZATION_ID: input.organizationId,
    BULK_CANARY_USER_ID: input.userId,
    BULK_CANARY_INTEGRATION_ID: input.integrationId,
    BULK_CANARY_TUPLE_ID: TUPLE_ID,
    BULK_CANARY_ACCOUNT_ATTESTATION: ATTESTATION,
    BULK_CANARY_GATEWAY_PORT: String(input.gatewayPort),
    BULK_CANARY_RUN_DIRECTORY: normalizePath(input.runDirectory),
    BULK_CANARY_ENV_FILE: normalizePath(input.envFile),
    COMPOSE_PROJECT_NAME:
      input.composeProject || composeProjectName(input.runId),
  };
}

function finalizeOrigin(env, origin) {
  const parsed = new URL(origin);
  if (
    parsed.protocol !== 'https:' ||
    !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(parsed.hostname) ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new StackError(
      'canary_tunnel_origin_invalid',
      'Cloudflare did not return a clean HTTPS trycloudflare.com origin.'
    );
  }
  const clean = parsed.origin;
  return {
    ...env,
    PUBLISHLY_DOMAIN: parsed.hostname,
    MAIN_URL: clean,
    FRONTEND_URL: clean,
    NEXT_PUBLIC_BACKEND_URL: `${clean}/api`,
    PROVIDER_MEDIA_BASE_URL: `${clean}/api`,
    S3_PUBLIC_URL: `${clean}/canary-media`,
  };
}

async function prepare(options = {}) {
  await fsp.mkdir(RUNTIME_ROOT, { recursive: true });
  const hostFreeBytesAtPrepare = assertHostCapacity();
  if (fs.existsSync(ACTIVE_FILE) && !options.replace) {
    const active = JSON.parse(await fsp.readFile(ACTIVE_FILE, 'utf8'));
    if (active.state !== 'stopped') {
      throw new StackError(
        'canary_run_already_active',
        `Canary run ${active.runId} is already ${active.state}. Stop it before preparing another run.`
      );
    }
  }
  const runId = safeSlug(
    options.runId || process.env.BULK_CANARY_RUN_ID || generatedRunId()
  );
  const runDirectory = path.join(RUNTIME_ROOT, runId);
  if (fs.existsSync(runDirectory)) {
    throw new StackError(
      'canary_run_exists',
      `The canary run directory already exists: ${runDirectory}`
    );
  }
  const envFile = path.join(runDirectory, 'canary.env');
  const gatewayPort = await availablePort(
    options.gatewayPort || process.env.BULK_CANARY_GATEWAY_PORT
  );
  const workspaceFiles = workspaceInputFiles();
  const buildRevision = workspaceDigest(workspaceFiles);
  const organizationId = `canary_org_${crypto.randomBytes(12).toString('hex')}`;
  const userId = crypto.randomUUID();
  const integrationId = `canary_ig_${crypto.randomBytes(12).toString('hex')}`;
  const composeProject = composeProjectName(runId);
  const buildxBuilder = selectedBuildxBuilder(
    options.environment || process.env
  );
  const dockerContext = selectedDockerContext(
    options.environment || process.env
  );
  const env = initialEnvironment({
    runId,
    runDirectory,
    envFile,
    gatewayPort,
    buildRevision,
    organizationId,
    userId,
    integrationId,
    composeProject,
  });
  env.DATABASE_URL = `postgresql://publishly_canary:${encodeURIComponent(
    env.DATABASE_PASSWORD
  )}@postgres:5432/publishly_canary`;
  const commandEvidenceFile = path.join(runDirectory, 'commands.jsonl');
  await fsp.mkdir(runDirectory, { recursive: false });
  const buildContext = await createBuildContextArchive(
    runDirectory,
    workspaceFiles,
    commandEvidenceFile
  );
  const revisionAfterArchive = workspaceDigest();
  if (revisionAfterArchive !== buildRevision) {
    throw new StackError(
      'canary_workspace_changed_during_archive',
      'The effective workspace changed while its immutable build context was being archived.',
      { expectedRevision: buildRevision, observedRevision: revisionAfterArchive }
    );
  }
  await writeRestricted(envFile, serializeEnv(env));
  const manifest = {
    schemaVersion: 3,
    state: 'prepared',
    preparedAt: new Date().toISOString(),
    runId,
    runDirectory: normalizePath(runDirectory),
    envFile: normalizePath(envFile),
    commandEvidenceFile: normalizePath(commandEvidenceFile),
    buildRevision,
    buildContextArchive: buildContext.archiveFile,
    buildContextFileList: buildContext.fileList,
    buildContextFileCount: buildContext.fileCount,
    buildContextSha256: buildContext.sha256,
    buildContextBytes: buildContext.bytes,
    imageTag: env.PUBLISHLY_IMAGE_TAG,
    tupleId: TUPLE_ID,
    organizationId,
    userId,
    integrationId,
    composeProject,
    buildxBuilder,
    dockerContext,
    gatewayPort,
    minimumHostFreeBytes: MIN_HOST_FREE_BYTES,
    hostFreeBytesAtPrepare,
    publicOrigin: null,
    providerDestination: null,
    providerCertified: false,
    secretsPrinted: false,
    attemptNumber: 0,
    attemptHistory: [],
  };
  await writeJson(path.join(runDirectory, 'manifest.json'), manifest, true);
  await writeJson(ACTIVE_FILE, manifest);
  return manifest;
}

async function activeManifest() {
  if (!fs.existsSync(ACTIVE_FILE)) {
    throw new StackError(
      'canary_run_missing',
      'No prepared canary run exists. Run prepare first.'
    );
  }
  const active = JSON.parse(await fsp.readFile(ACTIVE_FILE, 'utf8'));
  const manifestFile = path.join(active.runDirectory, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    throw new StackError(
      'canary_manifest_missing',
      'The active canary manifest is missing.'
    );
  }
  return JSON.parse(await fsp.readFile(manifestFile, 'utf8'));
}

async function persistManifest(manifest) {
  await writeJson(path.join(manifest.runDirectory, 'manifest.json'), manifest);
  await writeJson(ACTIVE_FILE, manifest);
}

function compose(manifest, args, options = {}) {
  const projectName =
    manifest.composeProject || composeProjectName(manifest.runId);
  const env = {
    ...process.env,
    DOCKER_CONTEXT: dockerContextFor(manifest),
    BULK_CANARY_ENV_FILE: manifest.envFile,
    BULK_CANARY_RUN_DIRECTORY: manifest.runDirectory,
  };
  return run(
    'docker',
    dockerInvocationArgs(manifest, [
      'compose',
      '--project-name',
      projectName,
      '--env-file',
      manifest.envFile,
      '-f',
      COMPOSE_FILE,
      ...args,
    ]),
    {
      ...options,
      env,
      evidenceFile: manifest.commandEvidenceFile,
    }
  );
}

function composeBounded(manifest, args, options) {
  const projectName =
    manifest.composeProject || composeProjectName(manifest.runId);
  const env = {
    ...process.env,
    DOCKER_CONTEXT: dockerContextFor(manifest),
    BULK_CANARY_ENV_FILE: manifest.envFile,
    BULK_CANARY_RUN_DIRECTORY: manifest.runDirectory,
  };
  return runBounded(
    'docker',
    dockerInvocationArgs(manifest, [
      'compose',
      '--project-name',
      projectName,
      '--env-file',
      manifest.envFile,
      '-f',
      COMPOSE_FILE,
      ...args,
    ]),
    {
      ...options,
      env,
      evidenceFile: manifest.commandEvidenceFile,
    }
  );
}

function buildRecordMatchesProject(record, projectName) {
  if (
    !record ||
    record.Status !== 'running' ||
    record.Target !== 'server-runtime' ||
    record.Dockerfile !== 'Dockerfile'
  ) {
    return false;
  }
  return (record.Labels || []).some(
    (label) =>
      label?.Name === 'com.docker.compose.project' &&
      label?.Value === projectName
  );
}

async function dockerBounded(manifest, args, options = {}) {
  return runBounded('docker', dockerInvocationArgs(manifest, args), {
    timeoutMs: options.timeoutMs || 30_000,
    allowFailure: options.allowFailure,
    env: {
      ...process.env,
      DOCKER_CONTEXT: dockerContextFor(manifest),
      ...(options.env || {}),
    },
    evidenceFile: manifest.commandEvidenceFile,
    stdinFile: options.stdinFile,
    stdinEvidence: options.stdinEvidence,
  });
}

async function assertBuildxBuilder(manifest) {
  let lastOutcome = null;
  let lastError = null;
  for (let attempt = 1; attempt <= BUILDX_INSPECT_ATTEMPTS; attempt += 1) {
    try {
      const record = await dockerBounded(manifest, ['buildx', 'inspect'], {
        allowFailure: true,
        timeoutMs: BUILDX_INSPECT_TIMEOUT_MS,
      });
      lastOutcome = buildxInspectionOutcome(record, manifest.buildxBuilder);
      if (lastOutcome.state === 'ready') return record;
      if (lastOutcome.state === 'mismatch') {
        throw new StackError(
          'canary_buildx_builder_mismatch',
          `Docker context ${dockerContextFor(
            manifest
          )} selected Buildx builder ${
            lastOutcome.observedBuilder || 'unknown'
          }, not the recorded builder ${manifest.buildxBuilder}.`,
          {
            dockerContext: dockerContextFor(manifest),
            expectedBuilder: manifest.buildxBuilder,
            observedBuilder: lastOutcome.observedBuilder,
          }
        );
      }
    } catch (error) {
      if (
        error instanceof StackError &&
        error.code === 'canary_buildx_builder_mismatch'
      ) {
        throw error;
      }
      if (
        !(error instanceof StackError) ||
        error.code !== 'canary_command_timeout'
      ) {
        throw error;
      }
      lastError = error;
    }
    if (attempt < BUILDX_INSPECT_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new StackError(
    'canary_buildx_builder_unavailable',
    `Buildx builder ${manifest.buildxBuilder} did not prove a running node after ${BUILDX_INSPECT_ATTEMPTS} bounded inspections.`,
    {
      builder: manifest.buildxBuilder,
      attempts: BUILDX_INSPECT_ATTEMPTS,
      lastOutcome,
      lastErrorCode: lastError?.code || null,
    }
  );
}

async function cancelRunBuildkitSolves(manifest) {
  const projectName =
    manifest.composeProject || composeProjectName(manifest.runId);
  const history = await dockerBounded(
    manifest,
    [
      'buildx',
      'history',
      'ls',
      '--builder',
      manifest.buildxBuilder,
      '--local',
      '--filter',
      'status=running',
      '--format',
      '{{json .}}',
    ],
    {
      allowFailure: true,
      timeoutMs: BUILDKIT_HISTORY_LIST_TIMEOUT_MS,
    }
  );
  const rows = history.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    })
    .filter(
      (row) => String(row.status || row.Status).toLowerCase() === 'running'
    );
  const cancellations = [];
  for (const row of rows) {
    const qualifiedRef = String(row.ref || row.Ref || '').trim();
    const ref = buildxHistoryRecordId(qualifiedRef);
    if (!ref) continue;
    const inspected = await dockerBounded(
      manifest,
      [
        'buildx',
        'history',
        'inspect',
        ref,
        '--builder',
        manifest.buildxBuilder,
        '--format',
        'json',
      ],
      { allowFailure: true }
    );
    let record;
    try {
      record = JSON.parse(inspected.stdout);
    } catch {
      continue;
    }
    record.Status = String(record.Status || '').toLowerCase();
    if (!buildRecordMatchesProject(record, projectName)) continue;
    const removed = await dockerBounded(
      manifest,
      ['buildx', 'history', 'rm', ref, '--builder', manifest.buildxBuilder],
      { allowFailure: true }
    );
    const after = await dockerBounded(
      manifest,
      [
        'buildx',
        'history',
        'inspect',
        ref,
        '--builder',
        manifest.buildxBuilder,
        '--format',
        'json',
      ],
      { allowFailure: true }
    );
    let statusAfter = 'removed';
    try {
      statusAfter = String(
        JSON.parse(after.stdout).Status || 'unknown'
      ).toLowerCase();
    } catch {
      // A missing record is also a successful terminal cancellation outcome.
    }
    cancellations.push({
      ref,
      qualifiedRef,
      target: record.Target,
      projectName,
      removeExitCode: removed.exitCode,
      statusAfter,
    });
  }
  fs.appendFileSync(
    manifest.commandEvidenceFile,
    `${JSON.stringify({
      event: 'buildkit_daemon_cancellation',
      recordedAt: new Date().toISOString(),
      projectName,
      cancellations,
    })}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
  return cancellations;
}

async function waitForTunnel(manifest, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = compose(
      manifest,
      ['logs', '--no-color', '--tail', '200', 'tunnel'],
      {
        allowFailure: true,
      }
    );
    const matches = `${logs.stdout}\n${logs.stderr}`.match(TUNNEL_PATTERN);
    if (matches?.length) return matches[matches.length - 1];
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new StackError(
    'canary_tunnel_timeout',
    'The Cloudflare Quick Tunnel did not publish an HTTPS origin within three minutes.'
  );
}

async function waitForHttp(url, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'No response received.';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'error' });
      if (response.ok) return { status: response.status };
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new StackError(
    'canary_health_timeout',
    `${url} did not become healthy: ${last}`
  );
}

function createFixture(manifest) {
  const output = path.join(
    manifest.runDirectory,
    'publishly-stage8-canary.mp4'
  );
  if (fs.existsSync(output)) return output;
  const result = run(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x1268f3:s=1080x1920:r=30:d=4',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf',
      `drawtext=text='Publishly Stage 8 Canary':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-profile:v',
      'high',
      '-level',
      '4.1',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-t',
      '4',
      '-movflags',
      '+faststart',
      '-y',
      output,
    ],
    { evidenceFile: manifest.commandEvidenceFile }
  );
  if (result.exitCode !== 0 || !fs.existsSync(output)) {
    throw new StackError(
      'canary_fixture_failed',
      'ffmpeg did not create the controlled MP4 fixture.'
    );
  }
  return output;
}

async function start() {
  let manifest = await activeManifest();
  if (!['prepared', 'failed', 'stopped'].includes(manifest.state)) {
    throw new StackError(
      'canary_state_invalid',
      `Canary run ${manifest.runId} is ${manifest.state}; it cannot be started.`
    );
  }
  const observedRevision = workspaceDigest();
  if (observedRevision !== manifest.buildRevision) {
    throw new StackError(
      'canary_workspace_revision_changed',
      'The workspace changed after this canary run was prepared; prepare a new immutable run.',
      {
        expectedRevision: manifest.buildRevision,
        observedRevision,
      }
    );
  }
  const buildContext = assertBuildContextArchive(manifest);
  manifest = beginAttempt(manifest);
  await persistManifest(manifest);
  try {
    const hostFreeBytesAtStart = assertHostCapacity();
    manifest = { ...manifest, hostFreeBytesAtStart };
    await persistManifest(manifest);
    const daemon = run(
      'docker',
      dockerInvocationArgs(manifest, [
        'version',
        '--format',
        '{{.Server.Version}}',
      ]),
      {
        allowFailure: true,
        env: {
          ...process.env,
          DOCKER_CONTEXT: dockerContextFor(manifest),
        },
        evidenceFile: manifest.commandEvidenceFile,
      }
    );
    if (daemon.exitCode !== 0) {
      throw new StackError(
        'canary_docker_context_unavailable',
        `Docker context ${dockerContextFor(manifest)} is unavailable.`,
        { dockerContext: dockerContextFor(manifest) }
      );
    }
    await assertBuildxBuilder(manifest);
    compose(manifest, ['config', '--quiet']);
    // All application services deliberately reference one immutable image.
    // Buildx creates it exactly once. Compose owns runtime topology only; its
    // nested Bake wrapper is deliberately excluded from the image path.
    try {
      await dockerBounded(manifest, directBuildArguments(manifest), {
        timeoutMs: BUILD_TIMEOUT_MS,
        stdinFile: manifest.buildContextArchive,
        stdinEvidence: buildContext,
      });
    } catch (error) {
      if (
        error instanceof StackError &&
        error.code === 'canary_command_timeout'
      ) {
        try {
          const cancellations = await cancelRunBuildkitSolves(manifest);
          error.details = {
            ...error.details,
            buildkitCancellations: cancellations,
          };
        } catch (cancellationError) {
          const failure = {
            code:
              cancellationError instanceof StackError
                ? cancellationError.code
                : 'canary_buildkit_cancellation_failed',
            reason:
              cancellationError instanceof Error
                ? cancellationError.message
                : String(cancellationError),
          };
          fs.appendFileSync(
            manifest.commandEvidenceFile,
            `${JSON.stringify({
              event: 'buildkit_daemon_cancellation_failed',
              recordedAt: new Date().toISOString(),
              ...failure,
            })}\n`,
            { encoding: 'utf8', mode: 0o600 }
          );
          error.details = {
            ...error.details,
            buildkitCancellationFailure: failure,
          };
        }
      }
      throw classifyBuildError(error);
    }
    const imageReference = `publishly-canary:${manifest.imageTag}`;
    const imageIdentity = await dockerBounded(
      manifest,
      [
        'image',
        'inspect',
        imageReference,
        '--format',
        '{{json .Config.Labels}}',
      ],
      { allowFailure: true }
    );
    let actualLabels = null;
    try {
      actualLabels = JSON.parse(imageIdentity.stdout.trim());
    } catch {
      // The classified identity failure below covers missing and malformed output.
    }
    const expectedLabels = requiredImageLabels(manifest);
    const mismatchedLabels = Object.entries(expectedLabels).filter(
      ([name, value]) => actualLabels?.[name] !== value
    );
    if (imageIdentity.exitCode !== 0 || mismatchedLabels.length > 0) {
      throw new StackError(
        'canary_image_identity_mismatch',
        'The loaded canary image does not match the immutable run identity.',
        {
          imageReference,
          mismatchedLabels: mismatchedLabels.map(([name]) => name),
        }
      );
    }
    await composeBounded(
      manifest,
      [
        'up',
        '-d',
        '--no-build',
        '--wait',
        'backend',
        'orchestrator',
        'gateway',
        'tunnel',
      ],
      {
        inherit: true,
        timeoutMs: SERVICE_START_TIMEOUT_MS,
      }
    );
    const origin = await waitForTunnel(manifest);
    const env = parseEnv(await fsp.readFile(manifest.envFile, 'utf8'));
    const finalized = finalizeOrigin(env, origin);
    await fsp.writeFile(manifest.envFile, serializeEnv(finalized), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fsp.chmod(manifest.envFile, 0o600).catch(() => undefined);
    await composeBounded(
      manifest,
      [
        'up',
        '-d',
        '--no-build',
        '--force-recreate',
        '--wait',
        'backend',
        'orchestrator',
      ],
      {
        inherit: true,
        timeoutMs: SERVICE_START_TIMEOUT_MS,
      }
    );
    run('node', ['scripts/verify-bulk-canary-env.cjs', manifest.envFile], {
      evidenceFile: manifest.commandEvidenceFile,
    });
    const runtimeVersion = compose(manifest, [
      'exec',
      '-T',
      'backend',
      'node',
      '--version',
    ]).stdout.trim();
    if (runtimeVersion !== 'v22.12.0') {
      throw new StackError(
        'canary_node_version_mismatch',
        `The canary image reports ${
          runtimeVersion || 'no Node version'
        }; v22.12.0 is required.`
      );
    }
    const mediaRuntimeRaw = compose(manifest, [
      'exec',
      '-T',
      'backend',
      'node',
      '-e',
      [
        "const { spawnSync } = require('node:child_process');",
        'const result = {};',
        "for (const key of ['FFMPEG_PATH', 'FFPROBE_PATH']) {",
        '  const binary = process.env[key];',
        "  const check = spawnSync(binary, ['-version'], { encoding: 'utf8' });",
        '  if (!binary || check.status !== 0) process.exit(1);',
        "  result[key] = String(check.stdout || '').split(/\\r?\\n/, 1)[0];",
        '}',
        'process.stdout.write(JSON.stringify(result));',
      ].join(' '),
    ]).stdout.trim();
    let mediaRuntime;
    try {
      mediaRuntime = JSON.parse(mediaRuntimeRaw);
    } catch {
      throw new StackError(
        'canary_media_runtime_invalid',
        'The canary image did not return valid ffmpeg/ffprobe version evidence.'
      );
    }
    if (
      !/^ffmpeg version /i.test(mediaRuntime.FFMPEG_PATH || '') ||
      !/^ffprobe version /i.test(mediaRuntime.FFPROBE_PATH || '')
    ) {
      throw new StackError(
        'canary_media_runtime_invalid',
        'The canary image is missing an executable ffmpeg or ffprobe runtime.'
      );
    }
    await waitForHttp(`http://127.0.0.1:${manifest.gatewayPort}/api/health`);
    await waitForHttp(`${origin}/api/health`);
    const fixtureFile = createFixture(manifest);
    const fixture = fs.readFileSync(fixtureFile);
    manifest = {
      ...manifest,
      state: 'ready_for_provider_provisioning',
      readyAt: new Date().toISOString(),
      publicOrigin: origin,
      fixtureFile: normalizePath(fixtureFile),
      fixtureSha256: crypto.createHash('sha256').update(fixture).digest('hex'),
      fixtureBytes: fixture.length,
      runtimeNode: runtimeVersion,
      mediaRuntime,
      providerCertified: false,
    };
    await persistManifest(manifest);
    return manifest;
  } catch (error) {
    let failureCleanup = null;
    try {
      const cleanup = await composeBounded(
        manifest,
        ['down', '--remove-orphans'],
        {
          allowFailure: true,
          timeoutMs: CLEANUP_TIMEOUT_MS,
        }
      );
      failureCleanup = {
        attempted: true,
        exitCode: cleanup.exitCode,
        volumesRetained: true,
      };
    } catch (cleanupError) {
      failureCleanup = {
        attempted: true,
        exitCode: null,
        volumesRetained: true,
        reason:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      };
    }
    manifest = {
      ...manifest,
      state: 'failed',
      failedAt: new Date().toISOString(),
      failure: {
        code: error instanceof StackError ? error.code : 'canary_stack_failed',
        reason: error instanceof Error ? error.message : String(error),
      },
      failureCleanup,
    };
    await persistManifest(manifest);
    throw error;
  }
}

async function status() {
  const manifest = await activeManifest();
  const services = compose(manifest, ['ps', '--format', 'json'], {
    allowFailure: true,
  });
  let publicHealth = null;
  if (manifest.publicOrigin) {
    try {
      const response = await fetch(`${manifest.publicOrigin}/api/health`, {
        redirect: 'error',
      });
      publicHealth = { ok: response.ok, status: response.status };
    } catch (error) {
      publicHealth = {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    ...manifest,
    services: services.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          const item = JSON.parse(line);
          return {
            service: item.Service,
            state: item.State,
            health: item.Health || null,
          };
        } catch {
          return {
            service: 'unknown',
            state: line.slice(0, 200),
            health: null,
          };
        }
      }),
    publicHealth,
  };
}

async function stop() {
  let manifest = await activeManifest();
  await composeBounded(manifest, ['down', '--remove-orphans'], {
    inherit: true,
    allowFailure: true,
    timeoutMs: CLEANUP_TIMEOUT_MS,
  });
  manifest = {
    ...manifest,
    state: 'stopped',
    stoppedAt: new Date().toISOString(),
    publicOrigin: null,
  };
  await persistManifest(manifest);
  return manifest;
}

function publicSummary(value) {
  const keys = [
    'state',
    'runId',
    'buildRevision',
    'buildContextSha256',
    'buildContextBytes',
    'buildContextFileCount',
    'imageTag',
    'tupleId',
    'organizationId',
    'integrationId',
    'composeProject',
    'buildxBuilder',
    'dockerContext',
    'gatewayPort',
    'publicOrigin',
    'fixtureFile',
    'fixtureSha256',
    'fixtureBytes',
    'runtimeNode',
    'mediaRuntime',
    'minimumHostFreeBytes',
    'hostFreeBytesAtPrepare',
    'hostFreeBytesAtStart',
    'providerDestination',
    'providerCertified',
    'attemptNumber',
    'attemptHistory',
    'publicHealth',
    'services',
    'failure',
    'failureCleanup',
  ];
  return Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]])
  );
}

function usage() {
  return [
    'Usage:',
    '  pnpm canary:bulk-scheduler:stack -- prepare',
    '  pnpm canary:bulk-scheduler:stack -- start',
    '  pnpm canary:bulk-scheduler:stack -- status',
    '  pnpm canary:bulk-scheduler:stack -- stop',
    '',
    'prepare writes secrets only under .runtime/bulk-canary (gitignored).',
    'stop removes containers and the network but retains named evidence/data volumes.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  if (
    argv.length !== 1 ||
    !['prepare', 'start', 'status', 'stop'].includes(argv[0])
  ) {
    throw new StackError('canary_stack_usage', usage());
  }
  const result =
    argv[0] === 'prepare'
      ? await prepare()
      : argv[0] === 'start'
      ? await start()
      : argv[0] === 'status'
      ? await status()
      : await stop();
  process.stdout.write(`${JSON.stringify(publicSummary(result), null, 2)}\n`);
}

module.exports = {
  ACTIVE_FILE,
  ATTESTATION,
  BUILD_CONTEXT_ARCHIVE_NAME,
  BUILD_CONTEXT_FILE_LIST_NAME,
  BUILD_CONTEXT_TIMEOUT_MS,
  BUILD_TIMEOUT_MS,
  BUILDKIT_HISTORY_LIST_TIMEOUT_MS,
  BUILDX_INSPECT_TIMEOUT_MS,
  BUILDX_INSPECT_ATTEMPTS,
  CLEANUP_TIMEOUT_MS,
  COMPOSE_FILE,
  MIN_HOST_FREE_BYTES,
  RUNTIME_ROOT,
  StackError,
  SERVICE_START_TIMEOUT_MS,
  TUPLE_ID,
  WORKSPACE_DIGEST_FILES,
  WORKSPACE_DIGEST_PREFIXES,
  assertHostCapacity,
  assertBuildxBuilder,
  assertBuildContextArchive,
  beginAttempt,
  buildxBuilderFromInspection,
  buildxInspectionOutcome,
  buildxHistoryRecordId,
  buildRecordMatchesProject,
  buildContextMetadata,
  cancelRunBuildkitSolves,
  classifyBuildError,
  composeProjectName,
  directBuildArguments,
  fileDigest,
  finalizeOrigin,
  generatedRunId,
  initialEnvironment,
  isWorkspaceDigestInput,
  parseEnv,
  publicSummary,
  requiredImageLabels,
  safeSlug,
  selectedBuildxBuilder,
  selectedDockerContext,
  dockerInvocationArgs,
  serializeEnv,
  runBounded,
  workspaceDigest,
  workspaceDigestFiles,
  workspaceInputFiles,
  createBuildContextArchive,
  prepare,
  start,
  status,
  stop,
  main,
};

if (require.main === module) {
  main().catch((error) => {
    const failure =
      error instanceof StackError
        ? error
        : new StackError(
            'canary_stack_failed',
            error instanceof Error ? error.message : String(error)
          );
    process.stderr.write(
      `${JSON.stringify(
        { verdict: 'FAIL', code: failure.code, reason: failure.message },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
  });
}
