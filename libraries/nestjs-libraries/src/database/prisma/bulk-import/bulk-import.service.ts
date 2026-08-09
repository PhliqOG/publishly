import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import { BulkImportRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { parseCsvWithHeader } from '@gitroom/helpers/utils/csv.parser';

export type BulkRowReport = {
  row: number;
  status: 'valid' | 'error' | 'created' | 'failed' | 'warning';
  errors: string[];
  warnings: string[];
  date?: string;
  integrations?: string[];
};

// Async CSV bulk scheduling. Lifecycle:
//   create (parse+validate) -> status 'preview' with a per-row report
//   commit -> status 'processing', rows scheduled in the background,
//             progress in processedRows -> status 'completed' /
//             'completed_with_errors' with a final per-row report.
// Validation is two-stage by design: structural checks at preview; full
// provider-settings validation happens at commit through the exact same
// createPost path the composer uses, and its failures land in the report
// instead of being silently dropped.
@Injectable()
export class BulkImportService {
  constructor(
    private _bulkImportRepository: BulkImportRepository,
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _integrationManager: IntegrationManager
  ) {}

  private parseDate(raw: string): dayjs.Dayjs | null {
    const iso = dayjs(raw);
    if (raw && iso.isValid()) {
      return iso;
    }
    return null;
  }

  async createImport(organizationId: string, name: string, csv: string) {
    const { header, records } = parseCsvWithHeader(csv);

    const required = ['date', 'content', 'integrations'];
    const missing = required.filter((c) => !header.includes(c));
    if (missing.length) {
      throw new Error(
        `CSV header is missing required column(s): ${missing.join(', ')}. ` +
          `Expected: date,content,integrations[,title][,mediaurls]`
      );
    }
    if (!records.length) {
      throw new Error('CSV contains a header but no data rows');
    }
    if (records.length > 5000) {
      throw new Error('CSV imports are limited to 5000 rows per file');
    }

    const integrations = await this._integrationService.getIntegrationsList(
      organizationId
    );
    const byId = new Map(integrations.map((i) => [i.id, i]));

    const report: BulkRowReport[] = records.map((record, idx) => {
      const rowNumber = idx + 2; // header is row 1
      const errors: string[] = [];
      const warnings: string[] = [];

      const date = this.parseDate(record.date);
      if (!date) {
        errors.push(`Unparseable date "${record.date}" (use ISO 8601)`);
      } else if (date.isBefore(dayjs())) {
        errors.push(`Date ${record.date} is in the past`);
      }

      if (!record.content) {
        errors.push('Empty content');
      }

      const ids = (record.integrations || '')
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!ids.length) {
        errors.push('No integrations listed');
      }
      for (const id of ids) {
        const integration = byId.get(id);
        if (!integration) {
          errors.push(`Integration "${id}" not found in this workspace`);
          continue;
        }
        if (integration.disabled) {
          errors.push(`Integration "${id}" is disabled`);
        }
        const provider = this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );
        try {
          const max = provider?.maxLength();
          if (max && record.content && record.content.length > max) {
            errors.push(
              `Content is ${record.content.length} chars; ${integration.providerIdentifier} allows ${max}`
            );
          }
        } catch {
          // maxLength needing settings context - checked fully at commit
        }
      }

      if (record.mediaurls) {
        warnings.push(
          'mediaurls is not imported in this version - upload media in the composer'
        );
      }

      return {
        row: rowNumber,
        status: errors.length ? 'error' : ('valid' as const),
        errors,
        warnings,
        date: record.date,
        integrations: ids,
      };
    });

    const validRows = report.filter((r) => r.status === 'valid').length;
    const created = await this._bulkImportRepository.create(
      organizationId,
      name,
      records.length
    );
    await this._bulkImportRepository.update(organizationId, created.id, {
      status: 'preview',
      validRows,
      report: JSON.stringify(report),
    });

    // The raw records are re-derived at commit from the stored report + a
    // re-upload is not needed: keep the csv alongside the report.
    await this._bulkImportRepository.update(organizationId, created.id, {
      report: JSON.stringify({ rows: report, csv }),
    });

    return {
      id: created.id,
      totalRows: records.length,
      validRows,
      rows: report,
    };
  }

  async getImport(organizationId: string, id: string) {
    const row = await this._bulkImportRepository.getById(organizationId, id);
    if (!row) {
      return null;
    }
    const parsed = JSON.parse(row.report || '{}');
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      validRows: row.validRows,
      createdAt: row.createdAt,
      rows: parsed.rows || [],
    };
  }

  list(organizationId: string) {
    return this._bulkImportRepository.list(organizationId);
  }

  async commit(organizationId: string, id: string) {
    const row = await this._bulkImportRepository.getById(organizationId, id);
    if (!row || row.status !== 'preview') {
      throw new Error('Import not found or not in preview state');
    }

    await this._bulkImportRepository.update(organizationId, id, {
      status: 'processing',
    });

    // Deliberately fire-and-forget: the request returns immediately and the
    // client polls getImport for progress.
    this.processImport(organizationId, id).catch((err) => {
      Logger.error(`Bulk import ${id} crashed: ${err?.message}`, 'BulkImport');
      this._bulkImportRepository
        .update(organizationId, id, { status: 'failed' })
        .catch(() => {});
    });

    return { started: true };
  }

  private async processImport(organizationId: string, id: string) {
    const row = await this._bulkImportRepository.getById(organizationId, id);
    const parsed = JSON.parse(row!.report || '{}');
    const rows: BulkRowReport[] = parsed.rows || [];
    const { records } = parseCsvWithHeader(parsed.csv || '');

    const integrations = await this._integrationService.getIntegrationsList(
      organizationId
    );
    const byId = new Map(integrations.map((i) => [i.id, i]));

    let processed = 0;
    for (const rowReport of rows) {
      if (rowReport.status !== 'valid') {
        processed++;
        continue;
      }
      const record = records[rowReport.row - 2];
      try {
        await this._postsService.createPost(
          organizationId,
          {
            type: 'schedule',
            shortLink: false,
            date: dayjs(record.date).toISOString(),
            tags: [],
            posts: (rowReport.integrations || []).map((integrationId) => ({
              integration: { id: integrationId },
              value: [
                {
                  content: record.content,
                  id: '',
                  image: [],
                },
              ],
              settings: {
                __type: byId.get(integrationId)?.providerIdentifier,
              },
            })),
          } as any,
          'API'
        );
        rowReport.status = 'created';
      } catch (err: any) {
        rowReport.status = 'failed';
        rowReport.errors.push(
          `Scheduling failed: ${err?.message || 'unknown error'}`
        );
      }
      processed++;
      if (processed % 10 === 0) {
        await this._bulkImportRepository.update(organizationId, id, {
          processedRows: processed,
          report: JSON.stringify({ rows, csv: parsed.csv }),
        });
      }
    }

    const failed = rows.some((r) => r.status === 'failed');
    await this._bulkImportRepository.update(organizationId, id, {
      status: failed ? 'completed_with_errors' : 'completed',
      processedRows: processed,
      report: JSON.stringify({ rows, csv: parsed.csv }),
    });
  }
}
