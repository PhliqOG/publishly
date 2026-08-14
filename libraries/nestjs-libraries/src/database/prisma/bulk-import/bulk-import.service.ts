import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import crypto from 'crypto';
import { BulkImportRepository } from '@gitroom/nestjs-libraries/database/prisma/bulk-import/bulk-import.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { parseCsvWithHeader } from '@gitroom/helpers/utils/csv.parser';
import { TemporalService } from 'nestjs-temporal-core';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

export type BulkRowReport = {
  row: number;
  status: 'valid' | 'error' | 'created' | 'failed' | 'warning';
  errors: string[];
  warnings: string[];
  date?: string;
  integrations?: string[];
  media?: Array<{
    id: string;
    name: string;
    originalName: string | null;
    path: string;
    thumbnail: string | null;
    alt: string | null;
  }>;
};

// Async CSV bulk scheduling. Lifecycle:
//   create (parse+validate) -> status 'preview' with a per-row report
//   commit -> a durable Temporal workflow schedules rows in bounded batches,
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
    private _integrationManager: IntegrationManager,
    private _temporalService: TemporalService,
    private _mediaService: MediaService
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

      const mediaUrls = (record.mediaurls || '')
        .split(/[|;]/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (mediaUrls.length > 10) {
        errors.push('A row can import at most 10 media URLs');
      }
      for (const mediaUrl of mediaUrls) {
        try {
          if (new URL(mediaUrl).protocol !== 'https:') {
            errors.push(`Media URL must use HTTPS: "${mediaUrl}"`);
          }
        } catch {
          errors.push(`Invalid media URL: "${mediaUrl}"`);
        }
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

    const claimed = await this._bulkImportRepository.claim(organizationId, id);
    if (claimed.count !== 1) {
      throw new Error('Import is already processing');
    }

    try {
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start('bulkImportWorkflowV101', {
          workflowId: `bulk_import_${id}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
          args: [{ organizationId, importId: id }],
        });
    } catch (err) {
      // A rejected start is safe to retry from the UI. USE_EXISTING protects
      // the ambiguous case where Temporal accepted the workflow but the
      // response was lost.
      const current = await this._bulkImportRepository.getById(
        organizationId,
        id
      );
      if (current?.processedRows === 0) {
        await this._bulkImportRepository.update(organizationId, id, {
          status: 'preview',
        });
      }
      throw err;
    }

    return { started: true };
  }

  private deterministicPostId(
    importId: string,
    rowNumber: number,
    integrationId: string
  ) {
    return `bulk_${crypto
      .createHash('sha256')
      .update(`${importId}:${rowNumber}:${integrationId}`)
      .digest('hex')
      .slice(0, 32)}`;
  }

  /**
   * Runs one retry-safe batch. This method is called only by the Temporal
   * activity; keeping each activity bounded prevents a large CSV from holding
   * a worker slot or an activity heartbeat indefinitely.
   */
  async processNextBatch(
    organizationId: string,
    id: string,
    batchSize = 25
  ): Promise<{ done: boolean; processedRows: number }> {
    const row = await this._bulkImportRepository.getById(organizationId, id);
    if (!row) {
      throw new Error('Bulk import not found');
    }
    if (!['processing', 'preview'].includes(row.status)) {
      return { done: true, processedRows: row.processedRows };
    }

    const parsed = JSON.parse(row!.report || '{}');
    const rows: BulkRowReport[] = parsed.rows || [];
    const { records } = parseCsvWithHeader(parsed.csv || '');

    const integrations = await this._integrationService.getIntegrationsList(
      organizationId
    );
    const byId = new Map(integrations.map((i) => [i.id, i]));

    const pending = rows
      .filter((rowReport) => rowReport.status === 'valid')
      .slice(0, Math.max(1, Math.min(batchSize, 100)));

    for (const rowReport of pending) {
      const record = records[rowReport.row - 2];
      try {
        const mediaUrls = (record.mediaurls || '')
          .split(/[|;]/)
          .map((value) => value.trim())
          .filter(Boolean);
        rowReport.media ||= [];
        for (
          let mediaIndex = rowReport.media.length;
          mediaIndex < mediaUrls.length;
          mediaIndex++
        ) {
          rowReport.media.push(
            await this._mediaService.importFromUrl(
              organizationId,
              mediaUrls[mediaIndex]
            )
          );
          // Checkpoint each imported asset. An activity retry resumes at the
          // next URL instead of downloading already persisted media again.
          await this._bulkImportRepository.update(organizationId, id, {
            report: JSON.stringify({ rows, csv: parsed.csv }),
          });
        }

        const missingDestinations = [];
        for (const integrationId of rowReport.integrations || []) {
          const postId = this.deterministicPostId(
            id,
            rowReport.row,
            integrationId
          );
          const existing = await this._postsService.getPostById(
            postId,
            organizationId
          );
          if (!existing) {
            missingDestinations.push({ integrationId, postId });
          }
        }

        if (missingDestinations.length) {
          await this._postsService.createPost(
            organizationId,
            {
              type: 'schedule',
              shortLink: false,
              date: dayjs(record.date).toISOString(),
              tags: [],
              posts: missingDestinations.map(
                ({ integrationId, postId }) => ({
                  integration: { id: integrationId },
                  value: [
                    {
                      content: record.content,
                      id: postId,
                      image: rowReport.media,
                    },
                  ],
                  settings: {
                    __type: byId.get(integrationId)?.providerIdentifier,
                  },
                })
              ),
            } as any,
            'API'
          );
        }
        rowReport.status = 'created';
      } catch (err: any) {
        rowReport.status = 'failed';
        rowReport.errors.push(
          `Scheduling failed: ${
            err?.message ||
            'the publishing queue did not return a usable error detail'
          }`
        );
      }
      const processedRows = rows.filter((item) => item.status !== 'valid').length;
      // Persist after every row. If the activity dies after creating a post but
      // before this write, deterministic IDs make the retry harmless.
      await this._bulkImportRepository.update(organizationId, id, {
        processedRows,
        report: JSON.stringify({ rows, csv: parsed.csv }),
      });
    }

    const processedRows = rows.filter((item) => item.status !== 'valid').length;
    const done = !rows.some((item) => item.status === 'valid');
    const failed = rows.some((r) => r.status === 'failed');
    if (done) {
      await this._bulkImportRepository.update(organizationId, id, {
        status: failed ? 'completed_with_errors' : 'completed',
        processedRows,
        report: JSON.stringify({ rows, csv: parsed.csv }),
      });
    }

    return { done, processedRows };
  }
}
