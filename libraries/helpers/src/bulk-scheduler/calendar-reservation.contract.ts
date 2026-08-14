import { createHash } from 'node:crypto';

export const CALENDAR_RESERVATION_CODES = Object.freeze({
  HELD: 'calendar_reservation_held',
  COMMITTED: 'calendar_reservation_committed',
  RELEASED: 'calendar_reservation_released',
  CANCELLED: 'calendar_reservation_cancelled',
  CONFLICTED: 'calendar_slot_conflict',
  IDEMPOTENCY_REUSED: 'calendar_idempotency_key_reused',
  REVISION_CONFLICT: 'calendar_reservation_revision_conflict',
  LEGACY_SHADOWED: 'legacy_post_shadowed',
  LEGACY_CONFLICT: 'legacy_slot_conflict',
  BACKFILL_RUNNING: 'calendar_backfill_running',
  BACKFILL_VERIFYING: 'calendar_backfill_verifying',
  BACKFILL_VERIFIED: 'calendar_backfill_verified',
  BACKFILL_MISMATCH: 'calendar_backfill_mismatch',
  WRITER_SHADOWED: 'calendar_writer_shadowed',
  WRITER_ABORTED: 'calendar_writer_aborted',
  WRITER_NOT_VERIFIED: 'calendar_writer_not_verified',
  AUTHORITY_PROMOTED: 'calendar_authority_promoted',
  AUTHORITY_ACTIVE: 'calendar_authority_active',
  AUTHORITY_NOT_READY: 'calendar_authority_not_ready',
  SHADOW_MISSING: 'calendar_writer_shadow_missing',
} as const);

export type CalendarReservationCursor = {
  scheduledAt: Date;
  id: string;
} | null;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, entry]) => [key, stable(entry)])
    );
  }
  return value;
}

export function calendarReservationRequestHash(value: unknown) {
  return sha256(JSON.stringify(stable(value)));
}

export function deterministicReservationId(
  organizationId: string,
  idempotencyKey: string
) {
  return `cal_res_${sha256(`${organizationId}:${idempotencyKey}`).slice(
    0,
    40
  )}`;
}

export function deterministicBackfillId(
  organizationId: string,
  source: string
) {
  return `cal_backfill_${sha256(`${organizationId}:${source}`).slice(0, 36)}`;
}

export function reservationAdvisoryLockKeys(input: {
  organizationId: string;
  integrationId: string;
  scheduledAt: Date;
}) {
  const digest = createHash('sha256')
    .update(
      `${input.organizationId}:${
        input.integrationId
      }:${input.scheduledAt.toISOString()}`
    )
    .digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const;
}

function advisoryPair(value: string) {
  const digest = createHash('sha256').update(value).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)] as const;
}

export function reservationOwnerLockKeys(input: {
  organizationId: string;
  ownerType: string;
  ownerId: string;
}) {
  return advisoryPair(
    `calendar-owner:${input.organizationId}:${input.ownerType}:${input.ownerId}`
  );
}

export function reservationTenantCutoverLockKeys(organizationId: string) {
  return advisoryPair(`calendar-cutover:${organizationId}`);
}

const validatedTimezones = new Set<string>();

export function assertReservationLocalIntent(input: {
  scheduledAt: Date;
  localScheduledAt: string;
  timezone: string;
  utcOffsetMinutes: number;
  dstFold?: number | null;
}) {
  if (
    !(input.scheduledAt instanceof Date) ||
    Number.isNaN(input.scheduledAt.getTime())
  ) {
    throw new Error('calendar_scheduled_at_invalid');
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(
      input.localScheduledAt
    )
  ) {
    throw new Error('calendar_local_intent_invalid');
  }
  if (!validatedTimezones.has(input.timezone)) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }).format(
        input.scheduledAt
      );
      validatedTimezones.add(input.timezone);
    } catch {
      throw new Error('calendar_timezone_invalid');
    }
  }
  if (
    !Number.isInteger(input.utcOffsetMinutes) ||
    input.utcOffsetMinutes < -840 ||
    input.utcOffsetMinutes > 840
  ) {
    throw new Error('calendar_utc_offset_invalid');
  }
  if (input.dstFold != null && input.dstFold !== 0 && input.dstFold !== 1) {
    throw new Error('calendar_dst_fold_invalid');
  }
  return input;
}

export function utcBackfillLocalIntent(scheduledAt: Date) {
  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
    throw new Error('calendar_scheduled_at_invalid');
  }
  return {
    localScheduledAt: scheduledAt.toISOString().slice(0, 19),
    timezone: 'UTC',
    utcOffsetMinutes: 0,
    dstFold: null as number | null,
  };
}

const transitions: Record<string, ReadonlySet<string>> = {
  HELD: new Set(['COMMITTED', 'RELEASED', 'CANCELLED', 'CONFLICTED']),
  COMMITTED: new Set(['RELEASED', 'CANCELLED']),
  RELEASED: new Set(),
  CANCELLED: new Set(),
  CONFLICTED: new Set(),
};

export function canTransitionReservation(from: string, to: string) {
  return transitions[from]?.has(to) || false;
}

export function encodeReservationCursor(input: {
  scheduledAt: Date;
  id: string;
}) {
  return Buffer.from(
    JSON.stringify({
      scheduledAt: input.scheduledAt.toISOString(),
      id: input.id,
    })
  ).toString('base64url');
}

export function decodeReservationCursor(
  value: string | null | undefined
): CalendarReservationCursor {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const scheduledAt = new Date(parsed.scheduledAt);
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      Number.isNaN(scheduledAt.getTime())
    ) {
      throw new Error('invalid');
    }
    return { scheduledAt, id: parsed.id };
  } catch {
    throw new Error('calendar_reservation_cursor_invalid');
  }
}

export function boundedReservationLimit(value: unknown, maximum = 200) {
  const parsed = Number(value ?? 50);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error('calendar_reservation_limit_invalid');
  }
  return parsed;
}
