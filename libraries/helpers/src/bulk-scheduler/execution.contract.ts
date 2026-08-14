import { createHash } from 'node:crypto';
import { BulkCampaignIntentV1 } from './campaign.contract';
import {
  bulkCampaignExpandedJobCount,
  MAX_BULK_CAMPAIGN_JOBS,
} from './limits.contract';

export { MAX_BULK_CAMPAIGN_JOBS } from './limits.contract';

export const BULK_CAMPAIGN_JOB_STATES = [
  'PLANNED',
  'RESERVING',
  'RESERVED',
  'CLAIMED',
  'MATERIALIZING',
  'SCHEDULED',
  'DISPATCHING',
  'PUBLISHED',
  'PAUSED',
  'CANCELLING',
  'CANCELLED',
  'RETRYABLE_FAILURE',
  'FINAL_FAILURE',
  'NEEDS_REVIEW',
  'CONFLICTED',
  'OVERFLOW',
  'QUARANTINED',
  'BLOCKED',
] as const;

export type BulkCampaignJobState = (typeof BULK_CAMPAIGN_JOB_STATES)[number];

const JOB_TRANSITIONS: Readonly<
  Record<BulkCampaignJobState, readonly BulkCampaignJobState[]>
> = {
  PLANNED: ['RESERVING', 'PAUSED', 'CANCELLING', 'OVERFLOW', 'QUARANTINED', 'BLOCKED'],
  RESERVING: ['RESERVED', 'CONFLICTED', 'RETRYABLE_FAILURE', 'PAUSED', 'CANCELLING'],
  RESERVED: ['CLAIMED', 'PAUSED', 'CANCELLING', 'BLOCKED'],
  CLAIMED: ['MATERIALIZING', 'RESERVED', 'PAUSED', 'CANCELLING', 'RETRYABLE_FAILURE', 'BLOCKED'],
  MATERIALIZING: ['SCHEDULED', 'RESERVED', 'RETRYABLE_FAILURE', 'FINAL_FAILURE', 'NEEDS_REVIEW', 'BLOCKED'],
  SCHEDULED: ['DISPATCHING', 'PAUSED', 'CANCELLING', 'BLOCKED'],
  DISPATCHING: ['PUBLISHED', 'RETRYABLE_FAILURE', 'FINAL_FAILURE', 'NEEDS_REVIEW', 'CANCELLING'],
  PUBLISHED: [],
  PAUSED: ['PLANNED', 'RESERVED', 'SCHEDULED', 'CANCELLING'],
  CANCELLING: ['CANCELLED', 'FINAL_FAILURE', 'NEEDS_REVIEW'],
  CANCELLED: [],
  RETRYABLE_FAILURE: ['RESERVING', 'RESERVED', 'CLAIMED', 'DISPATCHING', 'CANCELLING', 'FINAL_FAILURE'],
  FINAL_FAILURE: [],
  NEEDS_REVIEW: ['DISPATCHING', 'CANCELLING', 'CANCELLED', 'PUBLISHED'],
  CONFLICTED: ['RESERVING', 'PAUSED', 'CANCELLING'],
  OVERFLOW: ['PLANNED', 'PAUSED', 'CANCELLING'],
  QUARANTINED: ['PLANNED', 'CANCELLING'],
  BLOCKED: ['PLANNED', 'RESERVED', 'CANCELLING', 'FINAL_FAILURE'],
};

export function canTransitionBulkCampaignJob(
  from: BulkCampaignJobState,
  to: BulkCampaignJobState
) {
  return JOB_TRANSITIONS[from].includes(to);
}

export type BulkPlanningAsset = {
  id: string;
  originalName: string;
  position: number;
  pinned?: boolean;
};

export type BulkPlanningSlot = {
  scheduledAt: Date;
  localScheduledAt: string;
  timezone: string;
  utcOffsetMinutes: number;
  dstFold: 0 | 1 | null;
};

export type BulkExpandedJob = {
  ordinal: number;
  destinationOrdinal: number;
  assetId: string;
  integrationId: string;
  capabilityTupleId: string;
  pinned: boolean;
  slot: BulkPlanningSlot;
};

export type BulkOverflowJob = {
  ordinal: number;
  destinationOrdinal: number;
  assetId: string;
  integrationId: string;
  capabilityTupleId: string;
  code: 'capacity_shortage';
  reason: string;
};

export type BulkPlanResult = {
  expansion: {
    assetCount: number;
    destinationCount: number;
    expandedJobCount: number;
    formula: string;
  };
  jobs: BulkExpandedJob[];
  overflow: BulkOverflowJob[];
  firstScheduledAt: Date | null;
  lastScheduledAt: Date | null;
  dstGapCount: number;
};

type ExpandedWithoutSlot = Omit<BulkExpandedJob, 'slot'>;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function localParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
  return parts;
}

function offsetAt(instantMs: number, timeZone: string) {
  const parts = localParts(new Date(instantMs), timeZone);
  const represented = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((represented - instantMs) / 60_000);
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function resolveLocalWallClock(input: {
  date: string;
  minutes: number;
  timezone: string;
}): BulkPlanningSlot[] {
  const [year, month, day] = input.date.split('-').map(Number);
  const dayOffset = Math.floor(input.minutes / 1440);
  const minuteOfDay = ((input.minutes % 1440) + 1440) % 1440;
  const localPseudo = Date.UTC(
    year,
    month - 1,
    day + dayOffset,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
    0
  );
  const localDate = new Date(localPseudo);
  const expected = {
    year: localDate.getUTCFullYear(),
    month: localDate.getUTCMonth() + 1,
    day: localDate.getUTCDate(),
    hour: localDate.getUTCHours(),
    minute: localDate.getUTCMinutes(),
    second: 0,
  };
  const localScheduledAt = `${expected.year}-${pad(expected.month)}-${pad(
    expected.day
  )}T${pad(expected.hour)}:${pad(expected.minute)}:00`;
  // UTC is the common high-volume campaign case. It has no gaps or folds, so
  // avoid seven Intl round-trips per slot while preserving the exact same
  // persisted local-intent fields as the generic IANA-zone path.
  if (input.timezone === 'UTC' || input.timezone === 'Etc/UTC') {
    return [
      {
        scheduledAt: new Date(localPseudo),
        localScheduledAt,
        timezone: input.timezone,
        utcOffsetMinutes: 0,
        dstFold: null,
      },
    ];
  }
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(offsetAt(localPseudo + hours * 3_600_000, input.timezone));
  }
  const matches = [...offsets]
    .map((offset) => ({ offset, instant: localPseudo - offset * 60_000 }))
    .filter(({ instant }) => {
      const actual = localParts(new Date(instant), input.timezone);
      return (
        actual.year === expected.year &&
        actual.month === expected.month &&
        actual.day === expected.day &&
        actual.hour === expected.hour &&
        actual.minute === expected.minute &&
        actual.second === expected.second
      );
    })
    .sort((a, b) => a.instant - b.instant);

  return matches.map((match, index) => ({
    scheduledAt: new Date(match.instant),
    localScheduledAt,
    timezone: input.timezone,
    utcOffsetMinutes: match.offset,
    dstFold: matches.length > 1 ? (index as 0 | 1) : null,
  }));
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function orderBulkAssets(
  assets: readonly BulkPlanningAsset[],
  ordering: BulkCampaignIntentV1['ordering']
) {
  const ordered = [...assets].sort(
    (a, b) => a.position - b.position || compareText(a.id, b.id)
  );
  if (ordering.mode === 'filename') {
    ordered.sort(
      (a, b) =>
        compareText(a.originalName.toLowerCase(), b.originalName.toLowerCase()) ||
        a.position - b.position ||
        compareText(a.id, b.id)
    );
  }
  if (ordering.mode === 'deterministic_shuffle') {
    const seed = ordering.seed || '';
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const sample = Number.parseInt(hash(`${seed}:${index}`).slice(0, 12), 16);
      const swap = sample % (index + 1);
      [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
    }
  }
  return ordered;
}

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function dailyMinuteOffsets(intent: BulkCampaignIntentV1) {
  const start = minutes(intent.schedule.windowStart);
  let end = minutes(intent.schedule.windowEnd);
  if (end < start) end += 1440;
  const duration = end - start;
  const count = Math.min(
    intent.cadence.postsPerDay,
    Math.floor(duration / intent.schedule.spacingMinutes) + 1
  );
  if (count <= 0) return [];
  if (intent.schedule.slotStrategy === 'best_time') {
    throw new Error('best_time_not_available');
  }
  if (intent.schedule.slotStrategy === 'fixed' || count === 1) {
    return Array.from(
      { length: count },
      (_, index) => start + index * intent.schedule.spacingMinutes
    );
  }
  const interval = Math.floor(duration / (count - 1));
  return Array.from({ length: count }, (_, index) => start + index * interval);
}

export function* iterateBulkScheduleSlots(
  intent: BulkCampaignIntentV1
): Generator<BulkPlanningSlot, void, void> {
  const offsets = dailyMinuteOffsets(intent);
  let date = intent.schedule.startDate;
  while (!intent.schedule.endDate || date <= intent.schedule.endDate) {
    if (intent.schedule.weekdays.includes(weekday(date))) {
      for (const minuteOffset of offsets) {
        const candidates = resolveLocalWallClock({
          date,
          minutes: minuteOffset,
          timezone: intent.schedule.timezone,
        });
        if (candidates.length) yield candidates[0];
      }
    }
    date = nextDate(date);
  }
}

function expand(
  assets: readonly BulkPlanningAsset[],
  intent: BulkCampaignIntentV1
): ExpandedWithoutSlot[] {
  const destinations = intent.selection.destinations;
  const rows: ExpandedWithoutSlot[] = [];
  if (intent.distribution.mode === 'cross_post') {
    for (const asset of assets) {
      destinations.forEach((destination, destinationOrdinal) => {
        rows.push({
          ordinal: rows.length,
          destinationOrdinal,
          assetId: asset.id,
          integrationId: destination.integrationId,
          capabilityTupleId: destination.capabilityTupleId,
          pinned: asset.pinned === true,
        });
      });
    }
  } else {
    assets.forEach((asset, ordinal) => {
      const destinationOrdinal = ordinal % destinations.length;
      const destination = destinations[destinationOrdinal];
      rows.push({
        ordinal,
        destinationOrdinal,
        assetId: asset.id,
        integrationId: destination.integrationId,
        capabilityTupleId: destination.capabilityTupleId,
        pinned: asset.pinned === true,
      });
    });
  }
  return rows;
}

function slotsForCount(input: {
  count: number;
  intent: BulkCampaignIntentV1;
}) {
  const values: BulkPlanningSlot[] = [];
  let dstGapCount = 0;
  let date = input.intent.schedule.startDate;
  const offsets = dailyMinuteOffsets(input.intent);
  let daysVisited = 0;
  const maximumDays = Math.max(366, input.count * 8 + 366);
  while (values.length < input.count && daysVisited < maximumDays) {
    if (
      input.intent.schedule.endDate &&
      date > input.intent.schedule.endDate
    ) {
      break;
    }
    if (input.intent.schedule.weekdays.includes(weekday(date))) {
      for (const minuteOffset of offsets) {
        const candidates = resolveLocalWallClock({
          date,
          minutes: minuteOffset,
          timezone: input.intent.schedule.timezone,
        });
        if (!candidates.length) {
          dstGapCount += 1;
          continue;
        }
        values.push(candidates[0]);
        if (values.length >= input.count) break;
      }
    }
    date = nextDate(date);
    daysVisited += 1;
  }
  return { slots: values, dstGapCount };
}

export function planBulkCampaign(input: {
  assets: readonly BulkPlanningAsset[];
  intent: BulkCampaignIntentV1;
}): BulkPlanResult {
  const destinationCount = input.intent.selection.destinations.length;
  const multiplier =
    input.intent.distribution.mode === 'cross_post' ? destinationCount : 1;
  const expandedJobCount = bulkCampaignExpandedJobCount({
    assetCount: input.assets.length,
    destinationCount,
    distributionMode: input.intent.distribution.mode,
  });
  if (expandedJobCount > MAX_BULK_CAMPAIGN_JOBS) {
    throw new Error('campaign_expansion_limit_exceeded');
  }
  const orderedAssets = orderBulkAssets(input.assets, input.intent.ordering);
  const expanded = expand(orderedAssets, input.intent);
  const jobs: BulkExpandedJob[] = [];
  const overflow: BulkOverflowJob[] = [];
  let dstGapCount = 0;

  const assign = (rows: ExpandedWithoutSlot[]) => {
    const generated = slotsForCount({ count: rows.length, intent: input.intent });
    dstGapCount += generated.dstGapCount;
    rows.forEach((row, index) => {
      const slot = generated.slots[index];
      if (slot) jobs.push({ ...row, slot });
      else {
        overflow.push({
          ...row,
          code: 'capacity_shortage',
          reason:
            'No spacing-respecting slot exists inside the selected dates, weekdays, timezone, and time window.',
        });
      }
    });
  };

  if (input.intent.cadence.scope === 'campaign') {
    assign(expanded);
  } else {
    const byDestination = Array.from(
      { length: input.intent.selection.destinations.length },
      () => [] as ExpandedWithoutSlot[]
    );
    for (const row of expanded) byDestination[row.destinationOrdinal].push(row);
    for (const rows of byDestination) assign(rows);
  }

  jobs.sort((a, b) => a.ordinal - b.ordinal);
  overflow.sort((a, b) => a.ordinal - b.ordinal);
  let firstInstant = Number.POSITIVE_INFINITY;
  let lastInstant = Number.NEGATIVE_INFINITY;
  for (const job of jobs) {
    const instant = job.slot.scheduledAt.getTime();
    if (instant < firstInstant) firstInstant = instant;
    if (instant > lastInstant) lastInstant = instant;
  }
  return {
    expansion: {
      assetCount: orderedAssets.length,
      destinationCount,
      expandedJobCount: expanded.length,
      formula: `${orderedAssets.length} assets × ${multiplier} destinations = ${expanded.length} jobs`,
    },
    jobs,
    overflow,
    firstScheduledAt: jobs.length ? new Date(firstInstant) : null,
    lastScheduledAt: jobs.length ? new Date(lastInstant) : null,
    dstGapCount,
  };
}
