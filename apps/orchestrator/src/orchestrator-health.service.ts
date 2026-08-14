import { Injectable } from '@nestjs/common';
import { Connection } from '@temporalio/client';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

const heartbeatMaxAgeMs = (env: NodeJS.ProcessEnv = process.env) => {
  const raw = env.ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS;
  if (!raw || !/^\d+$/.test(raw.trim())) {
    return 180_000;
  }
  const seconds = Number(raw);
  return Number.isSafeInteger(seconds) && seconds >= 30 && seconds <= 900
    ? seconds * 1_000
    : 180_000;
};

@Injectable()
export class OrchestratorHealthService {
  constructor(private readonly _prisma: PrismaService) {}

  async check(now = new Date()) {
    let connection: Connection | undefined;
    try {
      const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
      connection = await Connection.connect({
        address,
        ...(process.env.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
        ...(process.env.TEMPORAL_API_KEY
          ? { apiKey: process.env.TEMPORAL_API_KEY }
          : {}),
      });
      const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          connection.workflowService.describeNamespace({ namespace }),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Temporal namespace probe timed out')),
              10_000
            );
          }),
        ]);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
      }
    } catch {
      return {
        healthy: false,
        status: 'error' as const,
        code: 'temporal_unavailable',
        reason:
          'The orchestrator could not reach its configured Temporal namespace.',
        checks: { temporal: false, publishingEngine: false },
      };
    } finally {
      await connection?.close().catch(() => undefined);
    }

    let heartbeat:
      | {
          status: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
          code: string;
          reason: string;
          observedAt: Date;
        }
      | null;
    try {
      heartbeat = await this._prisma.serviceHealthSample.findFirst({
        where: { component: 'publishing_engine' },
        orderBy: { observedAt: 'desc' },
        select: {
          status: true,
          code: true,
          reason: true,
          observedAt: true,
        },
      });
    } catch {
      return {
        healthy: false,
        status: 'error' as const,
        code: 'publishing_engine_evidence_unavailable',
        reason:
          'The orchestrator could not read durable publishing-engine health evidence.',
        checks: { temporal: true, publishingEngine: false },
      };
    }

    if (!heartbeat) {
      return {
        healthy: false,
        status: 'error' as const,
        code: 'publishing_engine_heartbeat_missing',
        reason:
          'No durable publishing-engine heartbeat has completed on this deployment.',
        checks: { temporal: true, publishingEngine: false },
      };
    }

    const ageMs = Math.max(0, now.getTime() - heartbeat.observedAt.getTime());
    if (ageMs > heartbeatMaxAgeMs()) {
      return {
        healthy: false,
        status: 'error' as const,
        code: 'publishing_engine_heartbeat_stale',
        reason: `The last durable publishing-engine heartbeat is ${Math.floor(
          ageMs / 1_000
        )} seconds old.`,
        observedAt: heartbeat.observedAt,
        checks: { temporal: true, publishingEngine: false },
      };
    }

    if (heartbeat.status === 'OUTAGE') {
      return {
        healthy: false,
        status: 'error' as const,
        code: heartbeat.code?.trim() || 'publishing_engine_outage',
        reason:
          heartbeat.reason?.trim() ||
          'The publishing engine reported an outage without usable detail.',
        observedAt: heartbeat.observedAt,
        checks: { temporal: true, publishingEngine: false },
      };
    }

    return {
      healthy: true,
      status: heartbeat.status === 'DEGRADED' ? ('degraded' as const) : ('ok' as const),
      code:
        heartbeat.code?.trim() ||
        (heartbeat.status === 'DEGRADED'
          ? 'publishing_engine_degraded'
          : 'publishing_engine_healthy'),
      reason:
        heartbeat.reason?.trim() ||
        'The publishing engine completed its durable heartbeat.',
      observedAt: heartbeat.observedAt,
      checks: { temporal: true, publishingEngine: true },
    };
  }
}
