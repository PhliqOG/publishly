import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

// Historical persistence for provider analytics. The Redis layer is a
// short-lived cache; these rows survive so the UI can show real history and
// trends beyond each platform's own lookback window. Data is stored exactly as
// the platform returned it - never interpolated or fabricated.
@Injectable()
export class AnalyticsSnapshotRepository {
  constructor(
    private _snapshot: PrismaRepository<'analyticsSnapshot'>
  ) {}

  async saveSeries(
    organizationId: string,
    integrationId: string,
    series: AnalyticsData[]
  ) {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    for (const entry of series) {
      await this._snapshot.model.analyticsSnapshot.upsert({
        where: {
          integrationId_day_label: {
            integrationId,
            day,
            label: entry.label,
          },
        },
        create: {
          organizationId,
          integrationId,
          day,
          label: entry.label,
          data: JSON.stringify(entry),
        },
        update: {
          data: JSON.stringify(entry),
        },
      });
    }
  }

  async history(
    organizationId: string,
    integrationId: string,
    label: string | undefined,
    days: number
  ) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const rows = await this._snapshot.model.analyticsSnapshot.findMany({
      where: {
        organizationId,
        integrationId,
        ...(label ? { label } : {}),
        day: { gte: since },
      },
      orderBy: { day: 'asc' },
    });
    return rows.map((r) => ({
      day: r.day,
      label: r.label,
      data: JSON.parse(r.data),
    }));
  }

  prune(organizationId: string, retentionDays: number) {
    const before = new Date();
    before.setUTCDate(before.getUTCDate() - Math.max(1, retentionDays));
    return this._snapshot.model.analyticsSnapshot.deleteMany({
      where: { organizationId, day: { lt: before } },
    });
  }
}
