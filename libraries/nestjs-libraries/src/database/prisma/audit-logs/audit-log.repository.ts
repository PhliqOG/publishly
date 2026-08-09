import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type AuditLogEntry = {
  organizationId: string;
  userId?: string;
  actorType?: 'user' | 'apikey' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuditLogRepository {
  constructor(private _auditLog: PrismaRepository<'auditLog'>) {}

  create(entry: AuditLogEntry) {
    return this._auditLog.model.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        userId: entry.userId,
        actorType: entry.actorType || 'user',
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: JSON.stringify(entry.metadata || {}),
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  }

  async list(
    organizationId: string,
    page: number,
    action?: string,
    userId?: string
  ) {
    const where = {
      organizationId,
      ...(action ? { action: { startsWith: action } } : {}),
      ...(userId ? { userId } : {}),
    };
    const take = 50;
    const [logs, total] = await Promise.all([
      this._auditLog.model.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: Math.max(0, page - 1) * take,
        take,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this._auditLog.model.auditLog.count({ where }),
    ]);
    return { logs, total, page, pageSize: take };
  }
}
