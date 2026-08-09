import { Injectable, Logger } from '@nestjs/common';
import {
  AuditLogEntry,
  AuditLogRepository,
} from '@gitroom/nestjs-libraries/database/prisma/audit-logs/audit-log.repository';

// Org-scoped audit trail of security-relevant actions (who did what, when,
// from where). Writes are fire-and-forget: an audit failure must never break
// the action being audited, so log() swallows and reports its own errors.
@Injectable()
export class AuditLogService {
  constructor(private _auditLogRepository: AuditLogRepository) {}

  log(entry: AuditLogEntry) {
    this._auditLogRepository.create(entry).catch((err) => {
      Logger.warn(
        `Audit log write failed for action ${entry.action}: ${err?.message}`,
        'AuditLog'
      );
    });
  }

  list(organizationId: string, page = 1, action?: string, userId?: string) {
    return this._auditLogRepository.list(organizationId, page, action, userId);
  }
}
