import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertReservationLocalIntent,
  boundedReservationLimit,
  calendarReservationRequestHash,
  canTransitionReservation,
  decodeReservationCursor,
  deterministicReservationId,
  encodeReservationCursor,
  reservationAdvisoryLockKeys,
  utcBackfillLocalIntent,
} from './calendar-reservation.contract';

describe('calendar reservation contract', () => {
  it('produces deterministic IDs, hashes, and slot lock keys', () => {
    const scheduledAt = new Date('2026-11-01T05:30:00.000Z');
    expect(deterministicReservationId('org-1', 'key-1')).toBe(
      deterministicReservationId('org-1', 'key-1')
    );
    expect(calendarReservationRequestHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      calendarReservationRequestHash({ a: { c: 3, d: 4 }, b: 2 })
    );
    expect(
      reservationAdvisoryLockKeys({
        organizationId: 'org-1',
        integrationId: 'integration-1',
        scheduledAt,
      })
    ).toEqual(
      reservationAdvisoryLockKeys({
        organizationId: 'org-1',
        integrationId: 'integration-1',
        scheduledAt,
      })
    );
  });

  it('preserves UTC plus explicit DST local intent', () => {
    expect(
      assertReservationLocalIntent({
        scheduledAt: new Date('2026-11-01T06:30:00.000Z'),
        localScheduledAt: '2026-11-01T01:30:00',
        timezone: 'America/New_York',
        utcOffsetMinutes: -300,
        dstFold: 1,
      })
    ).toEqual(expect.objectContaining({ dstFold: 1 }));
    expect(
      utcBackfillLocalIntent(new Date('2026-08-13T12:00:00.000Z'))
    ).toEqual({
      localScheduledAt: '2026-08-13T12:00:00',
      timezone: 'UTC',
      utcOffsetMinutes: 0,
      dstFold: null,
    });
  });

  it.each([
    [{ timezone: 'Mars/Olympus' }, 'calendar_timezone_invalid'],
    [{ localScheduledAt: 'tomorrow' }, 'calendar_local_intent_invalid'],
    [{ utcOffsetMinutes: 900 }, 'calendar_utc_offset_invalid'],
    [{ dstFold: 2 }, 'calendar_dst_fold_invalid'],
  ])('rejects invalid local intent %#', (override, code) => {
    expect(() =>
      assertReservationLocalIntent({
        scheduledAt: new Date('2026-11-01T06:30:00.000Z'),
        localScheduledAt: '2026-11-01T01:30:00',
        timezone: 'America/New_York',
        utcOffsetMinutes: -300,
        dstFold: 1,
        ...override,
      })
    ).toThrow(code);
  });

  it('permits only forward lifecycle transitions', () => {
    expect(canTransitionReservation('HELD', 'COMMITTED')).toBe(true);
    expect(canTransitionReservation('COMMITTED', 'CANCELLED')).toBe(true);
    expect(canTransitionReservation('COMMITTED', 'HELD')).toBe(false);
    expect(canTransitionReservation('CANCELLED', 'COMMITTED')).toBe(false);
  });

  it('round trips bounded cursors and rejects malformed input', () => {
    const cursor = {
      scheduledAt: new Date('2026-08-13T12:00:00.000Z'),
      id: 'reservation-1',
    };
    expect(decodeReservationCursor(encodeReservationCursor(cursor))).toEqual(
      cursor
    );
    expect(() => decodeReservationCursor('not-a-cursor')).toThrow(
      'calendar_reservation_cursor_invalid'
    );
    expect(boundedReservationLimit('200')).toBe(200);
    expect(() => boundedReservationLimit('201')).toThrow(
      'calendar_reservation_limit_invalid'
    );
  });
});

describe('calendar reservation migration contract', () => {
  const migration = readFileSync(
    path.join(
      process.cwd(),
      'libraries/nestjs-libraries/src/database/prisma/migrations/20260813003000_calendar_reservation_ledger/migration.sql'
    ),
    'utf8'
  );

  it('uses tenant-composite foreign keys and an authoritative partial slot index', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("integrationId", "organizationId") REFERENCES "Integration"("id", "organizationId")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("postId", "organizationId") REFERENCES "Post"("id", "organizationId")'
    );
    expect(migration).toContain(
      'FOREIGN KEY ("campaignId", "organizationId") REFERENCES "BulkCampaign"("id", "organizationId")'
    );
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "CalendarReservation_authoritative_active_slot_key"[\s\S]+WHERE "mode" = 'AUTHORITATIVE' AND "state" IN \('HELD', 'COMMITTED'\)/
    );
  });

  it('keeps shadow duplicates deployable and constrains reasons, states, local intent, and checkpoints', () => {
    expect(migration).toContain('"CalendarReservation_shadow_not_held"');
    expect(migration).toContain('"CalendarReservation_state_timestamps"');
    expect(migration).toContain('"CalendarReservation_local_intent_valid"');
    expect(migration).toContain('"CalendarReservation_outcome_nonempty"');
    expect(migration).toContain('"CalendarReservationBackfill_counts_valid"');
    expect(migration).toContain('"CalendarReservationBackfill_watermark_pair"');
  });
});
