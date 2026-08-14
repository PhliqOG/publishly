import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  BUILD_TIMEOUT_MS,
  BUILD_CONTEXT_ARCHIVE_NAME,
  BUILD_CONTEXT_TIMEOUT_MS,
  BUILDKIT_HISTORY_LIST_TIMEOUT_MS,
  BUILDX_INSPECT_TIMEOUT_MS,
  BUILDX_INSPECT_ATTEMPTS,
  CLEANUP_TIMEOUT_MS,
  MIN_HOST_FREE_BYTES,
  SERVICE_START_TIMEOUT_MS,
  StackError,
  assertHostCapacity,
  assertBuildContextArchive,
  beginAttempt,
  buildRecordMatchesProject,
  buildxBuilderFromInspection,
  buildxInspectionOutcome,
  buildxHistoryRecordId,
  classifyBuildError,
  composeProjectName,
  directBuildArguments,
  createBuildContextArchive,
  dockerInvocationArgs,
  finalizeOrigin,
  initialEnvironment,
  isWorkspaceDigestInput,
  parseEnv,
  runBounded,
  safeSlug,
  selectedBuildxBuilder,
  selectedDockerContext,
  serializeEnv,
  requiredImageLabels,
  workspaceDigestFiles,
} = require('../../../../scripts/bulk-scheduler-canary-stack.cjs');
const {
  validateBulkCanaryEnv,
} = require('../../../../scripts/verify-bulk-canary-env.cjs');

const repoRoot = path.resolve(__dirname, '../../../..');

function validEnvironment() {
  const runId = 'stage8-20260813t190000z-a1b2c3d4';
  const runDirectory = path.join(repoRoot, '.runtime', 'bulk-canary', runId);
  const envFile = path.join(runDirectory, 'canary.env');
  const env = initialEnvironment({
    runId,
    runDirectory,
    envFile,
    gatewayPort: 43180,
    buildRevision: `sha256:${'a'.repeat(64)}`,
    organizationId: 'canary_org_1234567890abcdef',
    userId: '11111111-1111-4111-8111-111111111111',
    integrationId: 'canary_ig_1234567890abcdef',
  });
  env.DATABASE_URL = `postgresql://publishly_canary:${encodeURIComponent(
    env.DATABASE_PASSWORD
  )}@postgres:5432/publishly_canary`;
  return finalizeOrigin(env, 'https://publishly-stage8.trycloudflare.com');
}

describe('Bulk Scheduler isolated canary stack', () => {
  it('creates a production-safe run-scoped environment accepted by the canary preflight', () => {
    const env = validEnvironment();

    expect(validateBulkCanaryEnv(env)).toEqual([]);
    expect(env.S3_BUCKET).not.toBe(env.BULK_PRIVATE_S3_BUCKET);
    expect(env.BULK_SCHEDULER_CANARY_TUPLES).toBe(
      'instagram.professional.reel.video'
    );
    expect(env.CALENDAR_RESERVATION_ENFORCED_TENANTS).toBe(
      env.BULK_CANARY_ORGANIZATION_ID
    );
  });

  it('fails closed on pending ingress, insecure auth, shared buckets, or expanded scope', () => {
    const env = validEnvironment();
    Object.assign(env, {
      MAIN_URL: 'https://pending.invalid',
      FRONTEND_URL: 'https://pending.invalid',
      NEXT_PUBLIC_BACKEND_URL: 'https://pending.invalid/api',
      PROVIDER_MEDIA_BASE_URL: 'https://pending.invalid/api',
      NOT_SECURED: 'true',
      BULK_SCHEDULER_CANARY_TUPLES:
        'instagram.professional.reel.video,facebook.page.feed.video',
      BULK_PRIVATE_S3_BUCKET: env.S3_BUCKET,
    });

    const codes = validateBulkCanaryEnv(env).map((issue: any) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'canary_public_https_required',
        'canary_insecure_mode',
        'canary_scope_invalid',
        'canary_private_bucket_reused',
      ])
    );
  });

  it('selects only the exact run-labelled BuildKit solve for timeout cancellation', () => {
    const project = 'publishly-canary-stage8-exact-project';
    const record = {
      Status: 'running',
      Target: 'server-runtime',
      Dockerfile: 'Dockerfile',
      Labels: [
        { Name: 'com.docker.compose.project', Value: project },
        { Name: 'com.docker.compose.service', Value: 'backend' },
      ],
    };

    expect(buildRecordMatchesProject(record, project)).toBe(true);
    expect(
      buildRecordMatchesProject(record, 'publishly-canary-different-project')
    ).toBe(false);
    expect(
      buildRecordMatchesProject({ ...record, Status: 'completed' }, project)
    ).toBe(false);
    expect(
      buildRecordMatchesProject({ ...record, Target: 'runtime' }, project)
    ).toBe(false);
  });

  it('rejects a reused Compose project or an integration outside the run identity', () => {
    const env = validEnvironment();
    env.COMPOSE_PROJECT_NAME = 'publishly-bulk-canary';
    env.BULK_SCHEDULER_CANARY_INTEGRATIONS = 'canary_ig_different1234567890';

    const codes = validateBulkCanaryEnv(env).map((issue: any) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'canary_compose_project_invalid',
        'canary_scope_invalid',
      ])
    );
  });

  it('accepts only a clean HTTPS Quick Tunnel origin', () => {
    const env = validEnvironment();
    expect(
      finalizeOrigin(env, 'https://fresh-canary.trycloudflare.com')
        .PROVIDER_MEDIA_BASE_URL
    ).toBe('https://fresh-canary.trycloudflare.com/api');
    expect(() =>
      finalizeOrigin(env, 'https://fresh-canary.trycloudflare.com.evil.test')
    ).toThrow(
      expect.objectContaining<Partial<typeof StackError>>({
        code: 'canary_tunnel_origin_invalid',
      })
    );
    expect(() =>
      finalizeOrigin(env, 'https://fresh-canary.trycloudflare.com/path')
    ).toThrow(
      expect.objectContaining({ code: 'canary_tunnel_origin_invalid' })
    );
  });

  it('round-trips generated env values without logging or quoting secrets', () => {
    const env = validEnvironment();
    const serialized = serializeEnv(env);

    expect(parseEnv(serialized)).toEqual(env);
    expect(serialized).not.toContain('export ');
    expect(() => serializeEnv({ BAD: 'line\nbreak' })).toThrow(
      expect.objectContaining({ code: 'canary_env_value_invalid' })
    );
  });

  it('normalizes bounded run IDs and rejects path-shaped IDs', () => {
    expect(safeSlug('Stage8 2026-08-13 Canary')).toBe(
      'stage8-2026-08-13-canary'
    );
    expect(() => safeSlug('../../escape')).toThrow(
      expect.objectContaining({ code: 'canary_run_id_invalid' })
    );
  });

  it('derives a unique bounded Compose project for every immutable run', () => {
    const first = composeProjectName('stage8-20260813t190000z-a1b2c3d4');
    const second = composeProjectName('stage8-20260813t190000z-a1b2c3d5');

    expect(first).toMatch(/^publishly-canary-[a-z0-9-]+-[a-f0-9]{12}$/);
    expect(first.length).toBeLessThanOrEqual(63);
    expect(second).not.toBe(first);
  });

  it('hashes every effective server/canary input but ignores unrelated surfaces', () => {
    expect(isWorkspaceDigestInput('Dockerfile')).toBe(true);
    expect(isWorkspaceDigestInput('apps/backend/src/main.ts')).toBe(true);
    expect(
      isWorkspaceDigestInput('apps/backend/src/publish.service.spec.ts')
    ).toBe(false);
    expect(
      isWorkspaceDigestInput(
        'libraries/helpers/src/configuration/live.launch.audit.spec.ts'
      )
    ).toBe(false);
    expect(
      isWorkspaceDigestInput(
        'libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts'
      )
    ).toBe(true);
    expect(isWorkspaceDigestInput('deploy/canary/compose.yaml')).toBe(true);
    expect(
      isWorkspaceDigestInput('data/bulk-scheduler-capabilities.json')
    ).toBe(true);
    expect(isWorkspaceDigestInput('scripts/deploy-vps.ps1')).toBe(false);
    expect(isWorkspaceDigestInput('docs/VPS_DEPLOYMENT.md')).toBe(false);
    expect(isWorkspaceDigestInput('apps/frontend/src/app/page.tsx')).toBe(
      false
    );
    expect(isWorkspaceDigestInput('.runtime/bulk-canary/active.json')).toBe(
      false
    );
    expect(
      workspaceDigestFiles([
        'docs/VPS_DEPLOYMENT.md',
        'Dockerfile',
        'apps/backend/src/main.ts',
        'Dockerfile',
      ])
    ).toEqual(['apps/backend/src/main.ts', 'Dockerfile']);
  });

  it('pins a validated Buildx builder instead of inheriting global selection', () => {
    expect(
      selectedBuildxBuilder(
        { PUBLISHLY_CANARY_BUILDER: 'release_builder-01' },
        'linux'
      )
    ).toBe('release_builder-01');
    expect(selectedBuildxBuilder({}, 'win32')).toBe('desktop-linux');
    expect(selectedBuildxBuilder({}, 'linux')).toBe('default');
    expect(() =>
      selectedBuildxBuilder({ PUBLISHLY_CANARY_BUILDER: '../wrong' }, 'linux')
    ).toThrow(
      expect.objectContaining({ code: 'canary_buildx_builder_invalid' })
    );
  });

  it('pins and validates the Docker context used by every canary command', () => {
    expect(
      selectedDockerContext(
        { PUBLISHLY_CANARY_DOCKER_CONTEXT: 'release_context-01' },
        'linux'
      )
    ).toBe('release_context-01');
    expect(selectedDockerContext({}, 'win32')).toBe('desktop-linux');
    expect(selectedDockerContext({}, 'linux')).toBe('default');
    expect(() =>
      selectedDockerContext(
        { PUBLISHLY_CANARY_DOCKER_CONTEXT: '../wrong' },
        'linux'
      )
    ).toThrow(
      expect.objectContaining({ code: 'canary_docker_context_invalid' })
    );
    expect(
      dockerInvocationArgs({ dockerContext: 'canary-context' }, [
        'compose',
        'config',
      ])
    ).toEqual(['--context', 'canary-context', 'compose', 'config']);
    expect(
      buildxBuilderFromInspection(
        'Name:          canary-context\nDriver:        docker\nStatus:        running\n'
      )
    ).toBe('canary-context');
    expect(buildxBuilderFromInspection('Status: running')).toBeNull();
    expect(
      buildxInspectionOutcome(
        {
          exitCode: 0,
          stdout: 'Name: canary-context\nStatus: running\n',
        },
        'canary-context'
      )
    ).toEqual({ state: 'ready', observedBuilder: 'canary-context' });
    expect(
      buildxInspectionOutcome(
        {
          exitCode: 0,
          stdout: 'Name: wrong-context\nStatus: running\n',
        },
        'canary-context'
      )
    ).toEqual({ state: 'mismatch', observedBuilder: 'wrong-context' });
    expect(
      buildxInspectionOutcome(
        {
          exitCode: 0,
          stdout: 'Name: canary-context\nError: DeadlineExceeded\n',
        },
        'canary-context'
      )
    ).toEqual({ state: 'retry', observedBuilder: 'canary-context' });
  });

  it('archives a failed start before clearing attempt-local outcome fields', () => {
    const next = beginAttempt(
      {
        runId: 'stage8-20260814t120000z-a1b2c3d4',
        state: 'failed',
        attemptNumber: 1,
        startedAt: '2026-08-14T12:00:00.000Z',
        failedAt: '2026-08-14T12:25:00.000Z',
        failure: { code: 'canary_command_timeout', reason: 'bounded' },
        failureCleanup: { attempted: true, exitCode: 0 },
        publicOrigin: 'https://stale.trycloudflare.com',
        readyAt: '2026-08-14T12:10:00.000Z',
      },
      '2026-08-14T12:30:00.000Z'
    );

    expect(next).toMatchObject({
      state: 'starting',
      attemptNumber: 2,
      startedAt: '2026-08-14T12:30:00.000Z',
      publicOrigin: null,
      providerCertified: false,
    });
    expect(next).not.toHaveProperty('failure');
    expect(next).not.toHaveProperty('failureCleanup');
    expect(next).not.toHaveProperty('readyAt');
    expect(next.attemptHistory).toEqual([
      expect.objectContaining({
        attemptNumber: 1,
        failure: { code: 'canary_command_timeout', reason: 'bounded' },
      }),
    ]);
  });

  it('builds one identity-labelled server image and normalizes Buildx history refs', () => {
    const manifest = {
      runId: 'stage8-20260814t120000z-a1b2c3d4',
      imageTag: 'stage8-0123456789abcdef',
      buildRevision: `sha256:${'a'.repeat(64)}`,
      buildxBuilder: 'desktop-linux',
      composeProject: 'publishly-canary-stage8-test-a1b2c3d4',
    };
    const labels = requiredImageLabels(manifest);
    const args = directBuildArguments(manifest);

    expect(args.slice(0, 4)).toEqual([
      'buildx',
      'build',
      '--builder',
      'desktop-linux',
    ]);
    expect(args).toEqual(
      expect.arrayContaining([
        '--target',
        'server-runtime',
        '--tag',
        'publishly-canary:stage8-0123456789abcdef',
        '--load',
        '--file',
        'Dockerfile',
      ])
    );
    for (const [name, value] of Object.entries(labels)) {
      expect(args).toContain(`${name}=${value}`);
    }
    expect(args).not.toContain('--build-arg');
    expect(args.at(-1)).toBe('-');
    expect(args).not.toContain('.');
    expect(
      buildxHistoryRecordId(
        'desktop-linux/desktop-linux/v2r8xh989mbw7itp5w2hxbep4'
      )
    ).toBe('v2r8xh989mbw7itp5w2hxbep4');
    expect(buildxHistoryRecordId('../../wrong')).toBeNull();
  });

  it('promotes a terminated Dockerfile frontend to a stable failure code', () => {
    const classifiedStep = classifyBuildError(
      new StackError('canary_command_failed', 'docker exited with code 1', {
        command: 'docker buildx build',
        stderr:
          '#32 566.6 class=recoverable code=server_dependency_install_timeout reason=The pinned server dependency install exceeded eight minutes.',
      })
    );
    expect(classifiedStep).toMatchObject({
      code: 'server_dependency_install_timeout',
      message: 'The pinned server dependency install exceeded eight minutes.',
      details: expect.objectContaining({
        failureClass: 'recoverable',
        recoverable: true,
      }),
    });

    const error = new StackError('canary_command_failed', 'docker exited', {
      command: 'docker buildx build',
      stderr:
        'failed to run Build function: frontend grpc server closed unexpectedly',
    });
    const classified = classifyBuildError(error);

    expect(classified).toMatchObject({
      code: 'canary_buildkit_frontend_terminated',
      details: expect.objectContaining({ recoverable: true }),
    });
    const unrelated = new Error('different');
    expect(classifyBuildError(unrelated)).toBe(unrelated);

    const canceled = classifyBuildError(
      new StackError('canary_command_failed', 'docker exited with 130', {
        command: 'docker buildx build',
        stderr: 'failed to solve: Canceled: context canceled',
      })
    );
    expect(canceled).toMatchObject({
      code: 'canary_buildkit_context_canceled',
      details: expect.objectContaining({ recoverable: true }),
    });
  });

  it('promotes a classified build marker even when later output exceeds the retained tail', async () => {
    const marker =
      '#32 543.8 class=recoverable code=server_dependency_install_timeout reason=The frozen server dependency install exceeded twenty minutes.';
    let classified: any;
    try {
      await runBounded(
        process.execPath,
        [
          '-e',
          `process.stderr.write(${JSON.stringify(
            `${marker}\n`
          )} + 'x'.repeat(6000) + '\\n'); process.exit(64);`,
        ],
        { timeoutMs: 5_000 }
      );
    } catch (error) {
      classified = classifyBuildError(error);
    }

    expect(classified).toMatchObject({
      code: 'server_dependency_install_timeout',
      message: 'The frozen server dependency install exceeded twenty minutes.',
      details: expect.objectContaining({
        failureClass: 'recoverable',
        recoverable: true,
      }),
    });
    expect(classified.details.stderr).not.toContain(marker);
  });

  it('fails closed before a build can exhaust the repository volume', () => {
    expect(assertHostCapacity(MIN_HOST_FREE_BYTES)).toBe(MIN_HOST_FREE_BYTES);
    expect(() => assertHostCapacity(MIN_HOST_FREE_BYTES - 1)).toThrow(
      expect.objectContaining({ code: 'canary_disk_capacity_insufficient' })
    );
    expect(BUILD_TIMEOUT_MS).toBe(25 * 60 * 1000);
    expect(BUILD_CONTEXT_TIMEOUT_MS).toBe(2 * 60 * 1000);
    expect(BUILDKIT_HISTORY_LIST_TIMEOUT_MS).toBe(90 * 1000);
    expect(BUILDX_INSPECT_TIMEOUT_MS).toBe(90 * 1000);
    expect(BUILDX_INSPECT_ATTEMPTS).toBe(3);
    expect(SERVICE_START_TIMEOUT_MS).toBe(12 * 60 * 1000);
    expect(CLEANUP_TIMEOUT_MS).toBe(5 * 60 * 1000);
  });

  it('archives only the declared inputs and rejects a changed context before Buildx', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'publishly-canary-context-')
    );
    const evidenceFile = path.join(directory, 'commands.jsonl');

    try {
      const created = await createBuildContextArchive(
        directory,
        ['.dockerignore', 'Dockerfile'],
        evidenceFile
      );
      const manifest = {
        runDirectory: directory,
        buildContextArchive: created.archiveFile,
        buildContextSha256: created.sha256,
        buildContextBytes: created.bytes,
      };

      expect(path.basename(created.archiveFile)).toBe(
        BUILD_CONTEXT_ARCHIVE_NAME
      );
      expect(created.fileCount).toBe(2);
      expect(assertBuildContextArchive(manifest)).toEqual({
        sha256: created.sha256,
        bytes: created.bytes,
      });

      fs.appendFileSync(created.archiveFile, 'tampered');
      expect(() => assertBuildContextArchive(manifest)).toThrow(
        expect.objectContaining({ code: 'canary_build_context_archive_changed' })
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('streams verified command stdin from a file descriptor and records no bytes', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'publishly-canary-stdin-')
    );
    const inputFile = path.join(directory, 'input.bin');
    const evidenceFile = path.join(directory, 'commands.jsonl');
    const contents = Buffer.from('immutable-context');
    fs.writeFileSync(inputFile, contents);
    const sha256 = `sha256:${require('node:crypto')
      .createHash('sha256')
      .update(contents)
      .digest('hex')}`;

    try {
      const result = await runBounded(
        process.execPath,
        [
          '-e',
          "let n=0;process.stdin.on('data',c=>n+=c.length);process.stdin.on('end',()=>process.stdout.write(String(n)))",
        ],
        {
          timeoutMs: 5_000,
          stdinFile: inputFile,
          stdinEvidence: { sha256, bytes: contents.length },
          evidenceFile,
        }
      );

      expect(result.stdout).toBe(String(contents.length));
      const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
      expect(evidence.stdin).toEqual({ sha256, bytes: contents.length });
      expect(JSON.stringify(evidence)).not.toContain(contents.toString());
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('terminates the full descendant tree when a bounded command times out', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'publishly-canary-tree-')
    );
    const pidFile = path.join(directory, 'grandchild.pid');
    const evidenceFile = path.join(directory, 'commands.jsonl');
    const childProgram = [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      `const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });`,
      `fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      'setInterval(() => {}, 1000);',
    ].join(' ');

    try {
      await expect(
        runBounded(process.execPath, ['-e', childProgram], {
          timeoutMs: 5_000,
          evidenceFile,
        })
      ).rejects.toMatchObject({ code: 'canary_command_timeout' });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const grandchildPid = Number(fs.readFileSync(pidFile, 'utf8'));
      expect(Number.isSafeInteger(grandchildPid)).toBe(true);
      expect(() => process.kill(grandchildPid, 0)).toThrow();
      const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
      expect(evidence).toMatchObject({
        timedOut: true,
        termination: { attempted: true, exitCode: 0 },
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('keeps data services unbound and pins the gate runtime to Node 22.12', () => {
    const compose = fs.readFileSync(
      path.join(repoRoot, 'deploy', 'canary', 'compose.yaml'),
      'utf8'
    );
    const dockerfile = fs.readFileSync(
      path.join(repoRoot, 'Dockerfile'),
      'utf8'
    );
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    );
    const serverRuntimePackageJson = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'deploy', 'server-runtime', 'package.json'),
        'utf8'
      )
    );
    const dockerignore = fs.readFileSync(
      path.join(repoRoot, '.dockerignore'),
      'utf8'
    );

    for (const service of [
      'postgres:',
      'temporal-postgres:',
      'temporal:',
      'redis:',
      'minio:',
    ]) {
      const start = compose.indexOf(`  ${service}`);
      const next = compose.indexOf('\n  ', start + 3);
      const block = compose.slice(start, next < 0 ? undefined : next);
      expect(block).not.toMatch(/\n\s+ports:/);
    }
    expect(compose).toContain('127.0.0.1:${BULK_CANARY_GATEWAY_PORT');
    expect(dockerfile.match(/node:22\.12\.0-bookworm-slim/g)).toHaveLength(3);
    expect(dockerfile.match(/corepack@0\.31\.0/g)).toHaveLength(2);
    expect(dockerfile).not.toContain('COREPACK_INTEGRITY_KEYS=0');
    expect(dockerfile).toContain('ARG PUBLISHLY_BUILD_SCOPE=all');
    expect(compose).not.toContain('PUBLISHLY_BUILD_SCOPE: server');
    expect(compose).toContain('target: server-runtime');
    expect(compose).toContain('temporal:7233');
    expect(compose).toContain('- operator');
    expect(compose).toContain('- cluster');
    expect(compose).toContain('- health');
    expect(compose).not.toContain("'localhost:7233'");
    expect(dockerfile).toContain('node scripts/build-server-runtime.cjs');
    expect(dockerfile).toContain('FROM pnpm-base AS server-deps-install');
    expect(dockerfile).toContain(
      'FROM server-deps-install AS prisma-engine-deps'
    );
    expect(dockerfile).toContain('FROM prisma-engine-deps AS server-deps');
    expect(dockerfile).toContain('FROM server-deps AS server-build');
    expect(dockerfile).toContain('COPY apps/backend/src ./apps/backend/src');
    expect(dockerfile).toContain(
      'COPY apps/orchestrator/src ./apps/orchestrator/src'
    );
    expect(dockerfile).toContain(
      'COPY scripts/build-server-runtime.cjs ./scripts/build-server-runtime.cjs'
    );
    expect(dockerfile).toContain(
      'COPY --link --from=server-build /app/.server-runtime/build-manifest.json ./server-runtime-build-manifest.json'
    );
    expect(dockerfile).toContain(
      'pnpm --dir deploy/server-runtime install --prod --frozen-lockfile --ignore-workspace --ignore-scripts --prefer-offline'
    );
    expect(dockerfile).toContain(
      'pnpm --dir deploy/server-runtime install --frozen-lockfile --ignore-workspace --ignore-scripts --prefer-offline'
    );
    expect(dockerfile.match(/--ignore-scripts/g)).toHaveLength(2);
    expect(dockerfile).toContain(
      'code=server_dependency_install_timeout'
    );
    expect(dockerfile).toContain('code=prisma_engine_provision_timeout');
    expect(dockerfile).not.toContain('bcrypt_native_');
    expect(dockerfile).toContain('code=prisma_client_generate_timeout');
    expect(dockerfile).toContain(
      'timeout --signal=TERM --kill-after=30s 5m'
    );
    expect(dockerfile).toContain(
      'pnpm --dir deploy/server-runtime rebuild @prisma/engines'
    );
    expect(dockerfile).not.toContain(
      'pnpm --dir deploy/server-runtime rebuild bcrypt'
    );
    expect(dockerfile).toContain(
      'node deploy/server-runtime/node_modules/prisma/build/index.js generate --schema'
    );
    expect(dockerfile).not.toContain('pnpm prune --prod');
    expect(dockerfile).toContain(
      'FROM node:22.12.0-bookworm-slim AS server-runtime'
    );
    expect(dockerfile).not.toMatch(/^# syntax=/);
    expect(dockerfile).toContain('ENV FFMPEG_PATH=/usr/local/bin/ffmpeg');
    expect(dockerfile).toContain('ENV FFPROBE_PATH=/usr/local/bin/ffprobe');
    expect(dockerfile).toContain(
      'mwader/static-ffmpeg:8.1.1@sha256:735f84b905e00d5c618b667f0b053f83b1096f5fc404c607e6134bf2275a0e0a'
    );
    expect(dockerfile).toContain(
      'node:22.12.0-bookworm@sha256:0e910f435308c36ea60b4cfd7b80208044d77a074d16b768a81901ce938a62dc'
    );
    expect(dockerfile).toContain(
      'COPY --link --from=media-tools /ffmpeg /ffprobe /usr/local/bin/'
    );
    expect(packageJson.dependencies.prisma).toBe('6.5.0');
    expect(packageJson.devDependencies.prisma).toBeUndefined();
    expect(packageJson.dependencies['ffmpeg-static']).toBeUndefined();
    expect(
      packageJson.dependencies['@derhuerst/ffprobe-static']
    ).toBeUndefined();
    expect(compose).toContain('node_modules/prisma/build/index.js');
    expect(compose).not.toContain("command: ['pnpm'");
    expect(dockerfile).toContain(
      '--mount=type=cache,id=publishly-pnpm-server-runtime,target=/pnpm/store,sharing=locked'
    );
    expect(dockerfile.match(/id=publishly-pnpm-server-runtime/g)).toHaveLength(
      3
    );
    expect(
      dockerfile.match(/id=publishly-server-runtime-modules-v1/g)
    ).toHaveLength(5);
    expect(dockerfile).not.toContain('publishly-server-runtime-modules-v2');
    expect(dockerfile).not.toContain('--store-dir /pnpm-cache');
    expect(dockerfile).not.toContain('--package-import-method hardlink');
    expect(serverRuntimePackageJson.pnpm.onlyBuiltDependencies).toEqual([]);
    expect(packageJson.dependencies.bcryptjs).toBe('3.0.3');
    expect(packageJson.dependencies.bcrypt).toBeUndefined();
    expect(packageJson.dependencies['@types/bcrypt']).toBeUndefined();
    expect(dockerfile).toContain('-cf /tmp/server-runtime-node-modules.tar .');
    expect(dockerfile).toContain(
      'COPY --link --from=server-deps /tmp/server-runtime-node-modules.tar /tmp/server-runtime-node-modules.tar'
    );
    expect(dockerfile).toContain(
      'tar -xf /tmp/server-runtime-node-modules.tar -C ./node_modules'
    );
    expect(dockerfile).not.toContain(
      'COPY --link --from=server-deps /app/deploy/server-runtime/node_modules ./node_modules'
    );
    expect(dockerfile).toContain('npm_config_network_concurrency=8');
    expect(dockerfile).toContain('npm_config_fetch_retries=5');
    expect(dockerfile).toContain('npm_config_fetch_retry_mintimeout=1000');
    expect(dockerfile).toContain('npm_config_fetch_retry_maxtimeout=10000');
    expect(dockerfile).toContain('npm_config_fetch_timeout=120000');
    expect(dockerfile.match(/--prefer-offline/g)).toHaveLength(2);
    expect(dockerfile).toContain('FROM server-deps AS server-build');
    expect(dockerfile).toContain(
      'NODE_PATH=/app/deploy/server-runtime/node_modules node scripts/build-server-runtime.cjs'
    );
    expect(dockerfile.indexOf('COPY package.json pnpm-lock.yaml')).toBeLessThan(
      dockerfile.indexOf('pnpm install --frozen-lockfile')
    );
    expect(dockerfile).toContain('COPY patches ./patches');
    expect(dockerfile).toContain(
      'COPY apps/frontend/scripts ./apps/frontend/scripts'
    );
    expect(
      dockerfile.indexOf('COPY apps/frontend/scripts ./apps/frontend/scripts')
    ).toBeLessThan(dockerfile.indexOf('pnpm install --frozen-lockfile'));
    expect(dockerfile).toContain(
      'COPY libraries/nestjs-libraries/src/database/prisma/schema.prisma'
    );
    expect(dockerfile.indexOf('pnpm install --frozen-lockfile')).toBeLessThan(
      dockerfile.indexOf('COPY . .')
    );
    expect(dockerignore).toMatch(/^\.runtime$/m);
    expect(dockerignore).toMatch(/^\.server-runtime$/m);
    expect(dockerignore).toMatch(/^\*\*\/\*\.tsbuildinfo$/m);
    expect(dockerignore).toMatch(/^\/apps\/orchestrator\/dist$/m);
    expect(compose).toContain('apps/backend/src/main.js');
    expect(compose).toContain('apps/orchestrator/src/main.js');
    expect(compose).not.toContain('/dist/apps/');

    const stackScript = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'bulk-scheduler-canary-stack.cjs'),
      'utf8'
    );
    expect(
      stackScript.match(/composeBounded\(manifest, \['build', 'backend'\]/g)
    ).toBeNull();
    expect(stackScript).toContain('directBuildArguments(manifest)');
    expect(stackScript).toContain('stdinFile: manifest.buildContextArchive');
    expect(stackScript).toContain("BUILD_CONTEXT_ARCHIVE_NAME = 'build-context.tar'");
    expect(compose).not.toContain('name: publishly-bulk-canary');
    expect(stackScript).toContain("'--project-name'");
    expect(stackScript).toContain('timeoutMs: BUILD_TIMEOUT_MS');
    expect(
      stackScript.match(/timeoutMs: SERVICE_START_TIMEOUT_MS/g)
    ).toHaveLength(2);
    expect(stackScript.match(/timeoutMs: CLEANUP_TIMEOUT_MS/g)).toHaveLength(2);
    expect(stackScript).toContain("'taskkill.exe'");
    expect(stackScript).toContain("['/PID', String(child.pid), '/T', '/F']");
    expect(stackScript).toContain("['down', '--remove-orphans']");
    expect(stackScript.match(/'--no-build'/g)).toHaveLength(2);
    expect(stackScript).toContain(
      "['buildx', 'history', 'rm', ref, '--builder', manifest.buildxBuilder]"
    );
    expect(stackScript).toContain("'--local'");
    expect(stackScript).toContain("'status=running'");
    expect(stackScript).not.toContain('BUILDX_BUILDER: manifest.buildxBuilder');
    expect(stackScript).toContain('DOCKER_CONTEXT: dockerContextFor(manifest)');
    expect(stackScript).toContain(
      "return ['--context', dockerContextFor(manifest), ...args]"
    );
    expect(stackScript).toContain(
      "dockerBounded(manifest, ['buildx', 'inspect']"
    );
    expect(stackScript).toContain("'--builder'");
    expect(stackScript).toContain(
      "label?.Name === 'com.docker.compose.project'"
    );
    expect(stackScript).toContain("record.Target !== 'server-runtime'");
    expect(stackScript).toContain('volumesRetained: true');
    expect(stackScript).toContain('canary_workspace_revision_changed');
    expect(stackScript).not.toContain(
      "['build', 'migrate', 'backend', 'orchestrator', 'provision']"
    );
  });
});
