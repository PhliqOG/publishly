# Interim Windows uptime

Until Publishly is moved to its VPS, the public domain depends on this Windows
computer, native PostgreSQL and Temporal services, the three application
processes, the exact `publishly-valkey.service` in Ubuntu WSL, and the named
Cloudflare Tunnel connector. The interim runtime has no Docker dependency, so
application and queue/database I/O do not contend with Docker Desktop or share
the canary builder's failure domain.

Frontend releases are built beside the live tree by setting
`PUBLISHLY_NEXT_DIST_DIR=.next-candidate`. Validate the candidate on port 4201,
then run `scripts/promote-frontend-release.ps1`. The promotion disables the
uptime watchdog for the short swap, retains the old build as a timestamped
`.next-previous-*` directory, starts the candidate on port 4200, performs a
health check, and restores the prior build automatically if startup fails.

The single-host bridge uses an authenticated `REDIS_URL` on port 6380 at
Ubuntu WSL's private IPv4 address, explicitly sets `REDIS_DISABLED=false`, and
sets `PUBLISHLY_HOST_MODE=true`. Backend and worker processes therefore share
durable queue, retry, and idempotency state. The watchdog resolves the current
private address on every pass and atomically refreshes the restricted host
environment before launching either process. This avoids relying on Windows
localhost forwarding, which can change when another Docker/WSL workload starts.
The watchdog starts only the exact systemd Valkey unit; it never silently falls
back to an in-memory adapter or logs the password. The VPS Compose topology
supplies its own isolated Redis service.

Install or repair the idempotent interim service with:

```powershell
.\scripts\install-interim-valkey.ps1
```

The installer uses Ubuntu's signed Valkey package, preserves an existing
high-entropy password and append-only data, hardens/enables the dedicated unit,
updates the restricted host environment, and proves authenticated PING from
Windows over the private WSL endpoint.

Because WSL may suspend a distro even while a Linux systemd unit remains
configured, registration also creates `Publishly Interim Valkey Keepalive`.
Its hidden `sleep infinity` client owns no data or credentials; it only keeps
the distro transport resident and is restarted by Task Scheduler.

The bridge also applies a low-concurrency Temporal worker profile. Every
provider queue remains enabled, but pollers and executions are capped so the
API and worker health sockets remain responsive on a 16 GB desktop shared with
other workloads. The launchers also reserve a modest 256 MB minimum working set
for the API and worker and explicitly restore normal Windows memory priority;
Task Scheduler otherwise gives its background child low memory priority and can
page out the event loop while the port remains open. The VPS environment
template uses a higher four-vCPU profile.

`scripts/interim-windows-watchdog.ps1` performs an idempotent recovery pass. It
starts the localhost-only PostgreSQL 18 cluster, starts the persistent Temporal
CLI development server, verifies/starts durable WSL Valkey, launches missing
frontend/backend/orchestrator processes from existing production builds, starts
the named tunnel, and probes the public API. TCP listeners are only launch
signals: readiness requires backend database/Redis JSON health, orchestrator
Temporal/durable-heartbeat JSON health, and a frontend HTTP 200. Two failed
semantic probes cause an exact-entry-point process recovery; unresolved health
exits nonzero with a durable class/code/reason. The long-running orchestrator
worker is owned by a dedicated scheduled task. Recovery waits for that exact
owner to settle before requesting its replacement, then all concurrently
launched processes share one six-minute semantic-readiness deadline. A named
mutex prevents overlapping watchdog passes.

Register the five-minute scheduled task and current-user logon launcher:

```powershell
.\scripts\register-interim-watchdog.ps1
```

Logs are written to:

```text
%LOCALAPPDATA%\Publishly\interim-watchdog.log
%LOCALAPPDATA%\Publishly\backend.stdout.log
%LOCALAPPDATA%\Publishly\backend.stderr.log
%LOCALAPPDATA%\Publishly\orchestrator.stdout.log
%LOCALAPPDATA%\Publishly\orchestrator.stderr.log
%LOCALAPPDATA%\Publishly\valkey-keepalive.stdout.log
%LOCALAPPDATA%\Publishly\valkey-keepalive.stderr.log
```

The application logs are stable files and are replaced on the next process
start. A child process that exits before binding its health port therefore
still leaves its complete startup reason for the next watchdog/operator pass.
The disposable Node compile cache is kept under the same local state directory.

After the VPS and Cloudflare DNS cutover are verified, remove both launchers:

```powershell
.\scripts\register-interim-watchdog.ps1 -Remove
```

The watchdog is a temporary availability bridge. It is not a substitute for a
VPS because Windows sleep, power loss, ISP failure, low disk space, and host
updates can still interrupt service.
