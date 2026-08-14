import { cancelCalendarReservationsInTransaction } from './calendar-reservation.mutation';

function setup() {
  const tx: any = {
    calendarReservation: {
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    auditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return tx;
}

describe('calendar reservation cancellation primitive', () => {
  it('cancels only active unpinned rows inside the caller transaction', async () => {
    const tx = setup();
    const now = new Date('2026-08-13T01:00:00.000Z');
    await expect(
      cancelCalendarReservationsInTransaction(tx, {
        organizationId: 'org-1',
        integrationIds: ['connection-1', 'connection-1'],
        action: 'calendar.writer.connection_deleted',
        subject: 'connection-1',
        code: 'calendar_connection_deleted',
        reason: 'The connection was deleted.',
        actor: { actorType: 'user', userId: 'user-1' },
        now,
      })
    ).resolves.toEqual({ count: 3 });
    expect(tx.calendarReservation.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        state: { in: ['HELD', 'COMMITTED'] },
        pinned: false,
        integrationId: { in: ['connection-1'] },
      },
      data: {
        state: 'CANCELLED',
        leaseExpiresAt: null,
        cancelledAt: now,
        revision: { increment: 1 },
        outcomeClass: 'blocked',
        outcomeCode: 'calendar_connection_deleted',
        outcomeReason: 'The connection was deleted.',
      },
    });
    expect(tx.auditLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            organizationId: 'org-1',
            userId: 'user-1',
            actorType: 'user',
            action: 'calendar.writer.connection_deleted',
            targetId: 'connection-1',
          }),
        ],
      })
    );
  });

  it('does not broaden an explicitly empty post scope', async () => {
    const tx = setup();
    await expect(
      cancelCalendarReservationsInTransaction(tx, {
        organizationId: 'org-1',
        postIds: [],
        action: 'calendar.writer.group_cancelled',
        subject: 'group-1',
        code: 'calendar_reservation_cancelled',
        reason: 'No rows matched.',
        now: new Date(),
      })
    ).resolves.toEqual({ count: 0 });
    expect(tx.calendarReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it('rejects a cancellation without durable code and reason', async () => {
    const tx = setup();
    await expect(
      cancelCalendarReservationsInTransaction(tx, {
        organizationId: 'org-1',
        action: 'calendar.writer.invalid',
        subject: 'invalid',
        code: '',
        reason: '',
        now: new Date(),
      })
    ).rejects.toThrow('calendar_reservation_outcome_required');
    expect(tx.calendarReservation.updateMany).not.toHaveBeenCalled();
  });

  it('classifies a ledger outage and tells the caller the transaction rolled back', async () => {
    const tx = setup();
    tx.calendarReservation.updateMany.mockRejectedValue(
      new Error('postgres unavailable')
    );
    await expect(
      cancelCalendarReservationsInTransaction(tx, {
        organizationId: 'org-1',
        action: 'calendar.writer.workspace_erasure',
        subject: 'org-1',
        code: 'calendar_workspace_erasure_requested',
        reason: 'Cancel pending work.',
        now: new Date(),
      })
    ).rejects.toMatchObject({
      status: 503,
      response: {
        failureClass: 'recoverable',
        code: 'calendar_retirement_ledger_unavailable',
        reason: expect.stringMatching(/rolled back/i),
      },
    });
    expect(tx.auditLog.createMany).not.toHaveBeenCalled();
  });
});
