import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../../');

describe('interim Windows uptime bridge', () => {
  it('requires durable Redis and preserves child startup evidence', () => {
    const watchdog = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'interim-windows-watchdog.ps1'),
      'utf8'
    );

    expect(watchdog).toContain('function Ensure-LocalRedis');
    expect(watchdog).toMatch(
      /'systemctl', 'is-active', 'publishly-valkey\.service'/
    );
    expect(watchdog).toMatch(
      /'systemctl', 'start', 'publishly-valkey\.service'/
    );
    expect(watchdog).not.toContain("'publishly-redis'");
    expect(watchdog).not.toContain("'docker.exe'");
    expect(watchdog).toContain(
      'Test-LocalPort -TargetAddress $script:valkeyAddress -Port 6380'
    );
    expect(watchdog).toContain("'-d', 'Ubuntu', '--', 'hostname', '-I'");
    expect(watchdog).toContain('$env:REDIS_URL = $redisUrl');
    expect(watchdog).toContain('valkey_address_refreshed');
    expect(watchdog).toContain('valkey_authenticated_url_missing');
    expect(watchdog).toContain('valkey_keepalive_task_missing');
    expect(watchdog).toContain('valkey_keepalive_running');
    expect(watchdog).toContain("$env:REDIS_DISABLED = 'false'");
    expect(watchdog).not.toContain("$env:REDIS_DISABLED = 'true'");
    expect(watchdog).toContain('RedirectStandardOutput');
    expect(watchdog).toContain('RedirectStandardError');
    expect(watchdog).toContain(
      "$nodeCompileCache = Join-Path $stateDirectory 'NodeCompileCache'"
    );
    expect(watchdog).not.toContain(
      "$env:NODE_COMPILE_CACHE = 'D:\\PublishlyRuntime"
    );
    expect(watchdog).toMatch(
      /\(Test-LocalPort -Port 7233\) -and\s+\$redisReady/
    );
    expect(watchdog).toContain('function Test-BackendHealth');
    expect(watchdog).toContain('function Test-OrchestratorHealth');
    expect(watchdog).toContain('function Stop-UnhealthyPublishlyProcess');
    expect(watchdog).toContain(
      "Stop-ScheduledTask -TaskName $orchestratorTaskName"
    );
    expect(watchdog).toContain('orchestrator_owner_settled');
    expect(watchdog).toContain(
      '$applicationHealthDeadline = [DateTimeOffset]::Now.AddMinutes(6)'
    );
    expect(watchdog).toContain(
      "Wait-ServiceHealth -Name 'Backend' -Deadline $applicationHealthDeadline"
    );
    expect(watchdog).toContain('backend_semantic_health_failed');
    expect(watchdog).toContain('orchestrator_semantic_health_failed');

    const orchestratorLauncher = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'run-interim-orchestrator.ps1'),
      'utf8'
    );
    expect(orchestratorLauncher).toContain('$env:REDIS_URL = $redisUrl.AbsoluteUri');
    expect(orchestratorLauncher).toContain("$env:REDIS_DISABLED = 'false'");
    expect(orchestratorLauncher).not.toContain(
      "$env:REDIS_DISABLED = 'true'"
    );

    const installer = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'install-interim-valkey.ps1'),
      'utf8'
    );
    expect(installer).toContain("$unitName = 'publishly-valkey.service'");
    expect(installer).toContain("'apt-get', 'install', '-y', 'valkey-server'");
    expect(installer).toContain('--requirepass ${PUBLISHLY_VALKEY_PASSWORD}');
    expect(installer).toContain('--appendonly yes');
    expect(installer).toContain('Test-AuthenticatedValkey');
    expect(installer).toContain("Invoke-Wsl -ArgumentList @('hostname', '-I')");
    expect(installer).toContain('@$wslAddress`:6380');
    expect(installer).toContain('Valkey accepted an unauthenticated PING');
    expect(installer).toContain('[switch]$RotateSecret');
    expect(installer).not.toContain('Write-Output $secret');

    const backendLauncher = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'start-interim-backend.ps1'),
      'utf8'
    );
    expect(backendLauncher).toContain('$env:REDIS_URL = $redisUrl.AbsoluteUri');
    expect(backendLauncher).toContain("$redisUrl.Host, $redisUrl.Port");

    const keepalive = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'run-interim-valkey-keepalive.ps1'),
      'utf8'
    );
    expect(keepalive).toContain("'/usr/bin/sleep', 'infinity'");
    expect(keepalive).toContain("'publishly-valkey.service'");
    expect(keepalive).not.toContain('REDIS_URL');

    const registration = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'register-interim-watchdog.ps1'),
      'utf8'
    );
    expect(registration).toContain(
      "$valkeyTask = 'Publishly Interim Valkey Keepalive'"
    );
    expect(registration).toContain('$valkeyLauncher');
  });

  it('documents every stable watchdog and application log', () => {
    const runbook = fs.readFileSync(
      path.join(repoRoot, 'docs', 'INTERIM_UPTIME.md'),
      'utf8'
    );

    expect(runbook).toContain('interim-watchdog.log');
    expect(runbook).toContain('backend.stdout.log');
    expect(runbook).toContain('backend.stderr.log');
    expect(runbook).toContain('orchestrator.stdout.log');
    expect(runbook).toContain('orchestrator.stderr.log');
    expect(runbook).toMatch(/do not contend with Docker Desktop/);
    expect(runbook).toContain('publishly-valkey.service');
    expect(runbook).toContain('install-interim-valkey.ps1');
    expect(runbook).toContain('Publishly Interim Valkey Keepalive');
    expect(runbook).toContain('valkey-keepalive.stdout.log');
    expect(runbook).not.toContain('Docker Desktop is not required');
    expect(runbook).toMatch(/never\s+silently falls\s+back/);
    expect(runbook).toContain('class/code/reason');
  });
});
