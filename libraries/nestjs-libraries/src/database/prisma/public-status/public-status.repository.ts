import { Injectable } from '@nestjs/common';
import { ServiceHealthState } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import {
  STATUS_COMPONENTS,
  StatusComponent,
} from '@gitroom/nestjs-libraries/reliability/public.status';

@Injectable()
export class PublicStatusRepository {
  constructor(
    private _db: PrismaRepository<'serviceHealthSample' | 'publishingJob'>,
    private _transaction: PrismaTransaction
  ) {}

  recordSamples(
    samples: Array<{
      component: StatusComponent;
      bucket: Date;
      status: ServiceHealthState;
      latencyMs?: number | null;
      code: string;
      reason: string;
      observedAt: Date;
    }>
  ) {
    return this._transaction.model.$transaction(
      samples.map((sample) =>
        this._db.model.serviceHealthSample.upsert({
          where: {
            component_bucket: {
              component: sample.component,
              bucket: sample.bucket,
            },
          },
          create: sample,
          update: {
            status: sample.status,
            latencyMs: sample.latencyMs,
            code: sample.code,
            reason: sample.reason,
            observedAt: sample.observedAt,
          },
        })
      )
    );
  }

  async uptimeAggregates(since: Date) {
    const [counts, bounds, latest] = await Promise.all([
      this._db.model.serviceHealthSample.groupBy({
        by: ['component', 'status'],
        where: {
          component: { in: [...STATUS_COMPONENTS] },
          bucket: { gte: since },
        },
        _count: { _all: true },
      }),
      this._db.model.serviceHealthSample.groupBy({
        by: ['component'],
        where: {
          component: { in: [...STATUS_COMPONENTS] },
          bucket: { gte: since },
        },
        _min: { bucket: true },
        _max: { bucket: true },
      }),
      Promise.all(
        STATUS_COMPONENTS.map((component) =>
          this._db.model.serviceHealthSample.findFirst({
            where: { component },
            orderBy: { bucket: 'desc' },
            select: {
              component: true,
              bucket: true,
              status: true,
              latencyMs: true,
              code: true,
              reason: true,
              observedAt: true,
            },
          })
        )
      ),
    ]);
    return { counts, bounds, latest: latest.filter(Boolean) };
  }

  platformOutcomeAggregates(since: Date) {
    return this._db.model.publishingJob.groupBy({
      by: ['provider', 'state', 'deliveryStage'],
      where: {
        completedAt: { gte: since },
        OR: [
          { state: 'PUBLISHED', deliveryStage: 'confirmed_live' },
          { state: 'FAILED', deliveryStage: 'failed' },
        ],
      },
      _count: { _all: true },
      _max: { completedAt: true },
      orderBy: [{ provider: 'asc' }, { state: 'asc' }],
    });
  }

  deleteSamplesBefore(before: Date) {
    return this._db.model.serviceHealthSample.deleteMany({
      where: { bucket: { lt: before } },
    });
  }
}
