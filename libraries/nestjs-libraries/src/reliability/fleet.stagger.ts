export type FleetStaggerAllocation = {
  integrationId: string;
  scheduledAt: Date;
};

export type FleetStaggerResult =
  | { ok: true; allocations: FleetStaggerAllocation[] }
  | { ok: false; code: string; reason: string };

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function parseExplicitIsoDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 50 ||
    !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function nextAvailableTime(
  target: number,
  previous: number | null,
  existing: number[],
  spacingMs: number
) {
  let candidate =
    previous === null ? target : Math.max(target, previous + spacingMs);
  for (const occupied of existing) {
    if (Math.abs(candidate - occupied) < spacingMs) {
      candidate = occupied + spacingMs;
      if (previous !== null) {
        candidate = Math.max(candidate, previous + spacingMs);
      }
    }
  }
  return candidate;
}

export function allocateFleetStagger(input: {
  integrationIds: string[];
  windowStart: Date;
  windowEnd: Date;
  minimumSpacingSeconds: number;
  existingByIntegration?: Record<string, Date[]>;
}): FleetStaggerResult {
  const integrationIds = [...new Set(input.integrationIds)].sort((a, b) =>
    a.localeCompare(b, 'en-US')
  );
  if (!integrationIds.length || integrationIds.length > 500) {
    return {
      ok: false,
      code: 'invalid_stagger_fleet_size',
      reason: 'A staggered distribution requires between 1 and 500 accounts.',
    };
  }
  const start = input.windowStart.getTime();
  const end = input.windowEnd.getTime();
  const spacingSeconds = input.minimumSpacingSeconds;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 31 * 86_400_000
  ) {
    return {
      ok: false,
      code: 'invalid_stagger_window',
      reason:
        'The stagger window must end after it starts and cannot exceed 31 days.',
    };
  }
  if (
    !Number.isInteger(spacingSeconds) ||
    spacingSeconds < 1 ||
    spacingSeconds > 86_400
  ) {
    return {
      ok: false,
      code: 'invalid_stagger_spacing',
      reason: 'Minimum spacing must be an integer between 1 and 86400 seconds.',
    };
  }

  const spacingMs = spacingSeconds * 1_000;
  const windowMs = end - start;
  if ((integrationIds.length - 1) * spacingMs > windowMs) {
    return {
      ok: false,
      code: 'stagger_window_too_small',
      reason:
        'The requested window cannot fit every account at the minimum spacing.',
    };
  }

  // Use most of the requested window while retaining one nominal interval as
  // slack for existing per-account schedule collisions.
  const idealInterval =
    integrationIds.length === 1
      ? 0
      : Math.max(spacingMs, Math.floor(windowMs / integrationIds.length));
  const allocations: FleetStaggerAllocation[] = [];
  let previous: number | null = null;
  for (let index = 0; index < integrationIds.length; index += 1) {
    const integrationId = integrationIds[index];
    const existing = (input.existingByIntegration?.[integrationId] || [])
      .map((date) => date.getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const target = start + index * idealInterval;
    const scheduledAt = nextAvailableTime(
      target,
      previous,
      existing,
      spacingMs
    );
    if (scheduledAt > end) {
      return {
        ok: false,
        code: 'stagger_window_exhausted',
        reason:
          'Existing account schedules leave no collision-free slot inside the requested window.',
      };
    }
    allocations.push({ integrationId, scheduledAt: new Date(scheduledAt) });
    previous = scheduledAt;
  }
  return { ok: true, allocations };
}
