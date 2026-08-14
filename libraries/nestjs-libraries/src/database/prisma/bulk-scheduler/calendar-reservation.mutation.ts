import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

const logger = new Logger('CalendarReservationMutation');

type CalendarCancellationActor = {
  userId?: string;
  actorType?: 'user' | 'apikey' | 'system';
};

function stableAuditId(input: {
  organizationId: string;
  action: string;
  subject: string;
}) {
  return `cal_audit_${createHash('sha256')
    .update(`${input.organizationId}:${input.action}:${input.subject}`)
    .digest('hex')
    .slice(0, 40)}`;
}

/**
 * The one transaction-level primitive for calendar removals initiated by a
 * post, connection, privacy, or workspace lifecycle writer. Callers pass the
 * same Prisma transaction that changes the source row; queues are not state.
 */
export async function cancelCalendarReservationsInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    postIds?: string[];
    integrationIds?: string[];
    reservationIds?: string[];
    action: string;
    subject: string;
    code: string;
    reason: string;
    actor?: CalendarCancellationActor;
    now: Date;
  }
) {
  if (!input.code.trim() || !input.reason.trim()) {
    throw new Error('calendar_reservation_outcome_required');
  }
  const postIds = [...new Set(input.postIds || [])];
  const integrationIds = [...new Set(input.integrationIds || [])];
  const reservationIds = [...new Set(input.reservationIds || [])];
  if (input.postIds && postIds.length === 0) return { count: 0 };
  if (input.integrationIds && integrationIds.length === 0) return { count: 0 };
  if (input.reservationIds && reservationIds.length === 0) return { count: 0 };

  try {
    const changed = await tx.calendarReservation.updateMany({
      where: {
        organizationId: input.organizationId,
        state: { in: ['HELD', 'COMMITTED'] },
        pinned: false,
        ...(input.postIds ? { postId: { in: postIds } } : {}),
        ...(input.integrationIds
          ? { integrationId: { in: integrationIds } }
          : {}),
        ...(input.reservationIds ? { id: { in: reservationIds } } : {}),
      },
      data: {
        state: 'CANCELLED',
        leaseExpiresAt: null,
        cancelledAt: input.now,
        revision: { increment: 1 },
        outcomeClass: 'blocked',
        outcomeCode: input.code,
        outcomeReason: input.reason.slice(0, 1000),
      },
    });
    const auditId = stableAuditId(input);
    await tx.auditLog.createMany({
      data: [
        {
          id: auditId,
          organizationId: input.organizationId,
          userId: input.actor?.userId,
          actorType: input.actor?.actorType || 'system',
          action: input.action,
          targetType: 'CalendarReservation',
          targetId: input.subject,
          metadata: JSON.stringify({
            code: input.code,
            reason: input.reason,
            cancelledReservationCount: changed.count,
            postCount: postIds.length,
            integrationCount: integrationIds.length,
            reservationCount: reservationIds.length,
          }),
        },
      ],
      skipDuplicates: true,
    });
    return changed;
  } catch (error) {
    Sentry.metrics.count('calendar_retirement_ledger_failed', 1);
    logger.error({
      event: 'calendar_retirement_ledger_failed',
      organizationId: input.organizationId,
      action: input.action,
      subject: input.subject,
      failureClass: 'recoverable',
      code: 'calendar_retirement_ledger_unavailable',
      reason: error instanceof Error ? error.message : String(error),
    });
    throw new ServiceUnavailableException(
      {
        failureClass: 'recoverable',
        code: 'calendar_retirement_ledger_unavailable',
        reason:
          'Publishly could not atomically retire the calendar work. The source mutation was rolled back; retry is safe.',
      },
      { cause: error instanceof Error ? error : undefined }
    );
  }
}
