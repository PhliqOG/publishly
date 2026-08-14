import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ServiceHealthState } from '@prisma/client';
import { PublicStatusRepository } from './public-status.repository';
import {
  buildComponentUptime,
  buildPlatformSuccessMetrics,
  overallServiceState,
  STATUS_COMPONENTS,
  STATUS_RETENTION_DAYS,
  STATUS_UPTIME_WINDOW_DAYS,
  StatusComponent,
  statusMinuteBucket,
} from '@gitroom/nestjs-libraries/reliability/public.status';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

@Injectable()
export class PublicStatusService {
  private readonly logger = new Logger(PublicStatusService.name);

  constructor(private _repository: PublicStatusRepository) {}

  private safeText(value: unknown, fallback: string, max = 2_000) {
    return typeof value === 'string' && value.trim()
      ? value.replace(/\s+/g, ' ').trim().slice(0, max)
      : fallback;
  }

  recordSamples(
    samples: Array<{
      component: StatusComponent;
      status: ServiceHealthState;
      latencyMs?: number | null;
      code: string;
      reason: string;
    }>,
    observedAt = new Date()
  ) {
    const bucket = statusMinuteBucket(observedAt);
    return this._repository.recordSamples(
      samples.map((sample) => ({
        component: sample.component,
        bucket,
        status: sample.status,
        latencyMs:
          typeof sample.latencyMs === 'number' && sample.latencyMs >= 0
            ? Math.round(sample.latencyMs)
            : null,
        code: this.safeText(sample.code, 'status_probe_failed', 120),
        reason: this.safeText(
          sample.reason,
          'Publishly recorded a status probe without a usable reason.'
        ),
        observedAt,
      }))
    );
  }

  recordPublishingEngineHeartbeat(observedAt = new Date()) {
    return this.recordSamples(
      [
        {
          component: 'publishing_engine',
          status: 'OPERATIONAL',
          code: 'publishing_engine_heartbeat',
          reason:
            'The publishing engine completed its scheduled durable heartbeat.',
        },
      ],
      observedAt
    );
  }

  cleanup(now = new Date()) {
    return this._repository.deleteSamplesBefore(
      new Date(now.getTime() - STATUS_RETENTION_DAYS * 86_400_000)
    );
  }

  async getPublicStatus(now = new Date()) {
    const uptimeSince = new Date(
      now.getTime() - STATUS_UPTIME_WINDOW_DAYS * 86_400_000
    );
    try {
      const [uptime, last24Hours, last7Days, last30Days] = await Promise.all([
        this._repository.uptimeAggregates(uptimeSince),
        this._repository.platformOutcomeAggregates(
          new Date(now.getTime() - 86_400_000)
        ),
        this._repository.platformOutcomeAggregates(
          new Date(now.getTime() - 7 * 86_400_000)
        ),
        this._repository.platformOutcomeAggregates(uptimeSince),
      ]);
      const components = STATUS_COMPONENTS.map((component) =>
        buildComponentUptime({
          component,
          counts: uptime.counts,
          bound: uptime.bounds.find((entry) => entry.component === component),
          latest: uptime.latest.find(
            (entry) => entry?.component === component
          ) as any,
          windowStartedAt: uptimeSince,
          now,
        })
      );
      const state = overallServiceState(components);
      const latestObservedAt = components.reduce<Date | null>(
        (latest, component) =>
          component.checkedAt &&
          (!latest || component.checkedAt.getTime() > latest.getTime())
            ? component.checkedAt
            : latest,
        null
      );
      return {
        generatedAt: now,
        latestObservedAt,
        overall: {
          state,
          code:
            state === 'OPERATIONAL'
              ? 'all_systems_operational'
              : state === 'DEGRADED'
              ? 'service_degraded'
              : 'service_outage',
          reason:
            state === 'OPERATIONAL'
              ? 'All monitored Publishly service components are operational.'
              : state === 'DEGRADED'
              ? 'One or more Publishly service components are degraded.'
              : 'One or more Publishly service components are unavailable or missing current evidence.',
        },
        uptime: {
          windowDays: STATUS_UPTIME_WINDOW_DAYS,
          components,
        },
        posting: {
          methodology:
            'confirmed_live / (confirmed_live + final_failed); nonterminal outcomes are excluded',
          windows: { last24Hours: 1, last7Days: 7, last30Days: 30 },
          platforms: buildPlatformSuccessMetrics({
            last24Hours,
            last7Days,
            last30Days,
          }),
        },
      };
    } catch (error) {
      const reason = normalizePostFailure({ error }).reason;
      this.logger.error({
        event: 'public_status_query_failed',
        code: 'status_data_unavailable',
        reason,
      });
      throw new ServiceUnavailableException({
        code: 'status_data_unavailable',
        reason:
          'Publishly could not read the status evidence ledger. Treat current status as unavailable.',
      });
    }
  }
}
