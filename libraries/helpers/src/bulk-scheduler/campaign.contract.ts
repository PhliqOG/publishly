export const BULK_CAMPAIGN_STATES = [
  'DRAFT',
  'UPLOADING',
  'VALIDATING',
  'NORMALIZING',
  'PLANNING',
  'RESERVING',
  'SCHEDULED',
  'DISPATCHING',
  'PAUSED',
  'CANCELLING',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'NEEDS_REVIEW',
] as const;

export type BulkCampaignState = (typeof BULK_CAMPAIGN_STATES)[number];
export type BulkCampaignIssueClass =
  | 'blocked'
  | 'failed'
  | 'conflicted'
  | 'quarantined'
  | 'overflow';
export type BulkFailureClass =
  | 'recoverable'
  | 'user_action_needed'
  | 'data_problem';

export const BULK_CAMPAIGN_ISSUE_CODES = {
  capability_tuple_unknown: {
    issueClass: 'blocked',
    failureClass: 'data_problem',
    retryable: false,
  },
  capability_tuple_disabled: {
    issueClass: 'blocked',
    failureClass: 'user_action_needed',
    retryable: false,
  },
  connection_not_found: {
    issueClass: 'blocked',
    failureClass: 'user_action_needed',
    retryable: false,
  },
  connection_provider_mismatch: {
    issueClass: 'blocked',
    failureClass: 'data_problem',
    retryable: false,
  },
  connection_disconnected: {
    issueClass: 'blocked',
    failureClass: 'user_action_needed',
    retryable: false,
  },
  upload_incomplete: {
    issueClass: 'blocked',
    failureClass: 'recoverable',
    retryable: true,
  },
  upload_processing_failed: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
  upload_aborted: {
    issueClass: 'blocked',
    failureClass: 'data_problem',
    retryable: false,
  },
  upload_expired: {
    issueClass: 'blocked',
    failureClass: 'recoverable',
    retryable: true,
  },
  invalid_media: {
    issueClass: 'quarantined',
    failureClass: 'data_problem',
    retryable: false,
  },
  duplicate_media: {
    issueClass: 'quarantined',
    failureClass: 'data_problem',
    retryable: false,
  },
  normalization_failed: {
    issueClass: 'quarantined',
    failureClass: 'data_problem',
    retryable: false,
  },
  invalid_settings: {
    issueClass: 'quarantined',
    failureClass: 'data_problem',
    retryable: false,
  },
  reservation_ledger_unavailable: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
  private_media_transport_failed: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
  materialization_failed: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
  calendar_conflict: {
    issueClass: 'conflicted',
    failureClass: 'data_problem',
    retryable: false,
  },
  reservation_race: {
    issueClass: 'conflicted',
    failureClass: 'recoverable',
    retryable: true,
  },
  capacity_shortage: {
    issueClass: 'overflow',
    failureClass: 'data_problem',
    retryable: false,
  },
  campaign_overflow: {
    issueClass: 'overflow',
    failureClass: 'data_problem',
    retryable: false,
  },
  dispatch_failed: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
  provider_rejected: {
    issueClass: 'failed',
    failureClass: 'data_problem',
    retryable: false,
  },
  provider_timeout_ambiguous: {
    issueClass: 'blocked',
    failureClass: 'recoverable',
    retryable: false,
  },
  verification_inconclusive: {
    issueClass: 'blocked',
    failureClass: 'recoverable',
    retryable: false,
  },
  needs_review: {
    issueClass: 'blocked',
    failureClass: 'user_action_needed',
    retryable: false,
  },
  cancellation_failed: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
  internal_error: {
    issueClass: 'failed',
    failureClass: 'recoverable',
    retryable: true,
  },
} as const satisfies Record<
  string,
  {
    issueClass: BulkCampaignIssueClass;
    failureClass: BulkFailureClass;
    retryable: boolean;
  }
>;

export type BulkCampaignIssueCode = keyof typeof BULK_CAMPAIGN_ISSUE_CODES;

export function isBulkCampaignIssueCode(
  value: unknown
): value is BulkCampaignIssueCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(BULK_CAMPAIGN_ISSUE_CODES, value)
  );
}

const transitions: Readonly<Record<BulkCampaignState, BulkCampaignState[]>> = {
  DRAFT: ['UPLOADING', 'CANCELLING', 'CANCELLED'],
  UPLOADING: ['VALIDATING', 'PAUSED', 'CANCELLING', 'FAILED'],
  VALIDATING: ['NORMALIZING', 'PLANNING', 'PAUSED', 'CANCELLING', 'FAILED'],
  NORMALIZING: ['PLANNING', 'PAUSED', 'CANCELLING', 'FAILED'],
  PLANNING: ['RESERVING', 'PAUSED', 'CANCELLING', 'FAILED'],
  RESERVING: ['SCHEDULED', 'PAUSED', 'CANCELLING', 'FAILED'],
  SCHEDULED: ['DISPATCHING', 'PAUSED', 'CANCELLING', 'FAILED'],
  DISPATCHING: [
    'PAUSED',
    'CANCELLING',
    'COMPLETED',
    'FAILED',
    'NEEDS_REVIEW',
  ],
  PAUSED: [
    'UPLOADING',
    'VALIDATING',
    'NORMALIZING',
    'PLANNING',
    'RESERVING',
    'SCHEDULED',
    'DISPATCHING',
    'CANCELLING',
    'FAILED',
  ],
  CANCELLING: ['CANCELLED', 'FAILED', 'NEEDS_REVIEW'],
  NEEDS_REVIEW: ['DISPATCHING', 'CANCELLING', 'CANCELLED', 'COMPLETED'],
  CANCELLED: [],
  COMPLETED: [],
  FAILED: [],
};

export function canTransitionBulkCampaign(
  from: BulkCampaignState,
  to: BulkCampaignState
) {
  return transitions[from]?.includes(to) === true;
}

export type BulkCampaignIntentV1 = {
  schemaVersion: 1;
  selection: {
    accountGroupId?: string;
    tagIds?: string[];
    destinations: Array<{
      integrationId: string;
      capabilityTupleId: string;
    }>;
  };
  distribution: { mode: 'cross_post' | 'distribute' };
  cadence: {
    scope: 'per_account' | 'campaign';
    postsPerDay: number;
  };
  schedule: {
    startDate: string;
    endDate?: string;
    weekdays: number[];
    timezone: string;
    windowStart: string;
    windowEnd: string;
    spacingMinutes: number;
    slotStrategy: 'fixed' | 'even' | 'best_time';
    conflictBehavior: 'next_available' | 'keep_conflict' | 'stop';
  };
  ordering: {
    mode: 'upload' | 'filename' | 'manual' | 'deterministic_shuffle';
    seed?: string;
  };
  publication?: {
    caption: string;
    settingsByTuple?: Record<string, Record<string, unknown>>;
    settingsByDestination?: Record<string, Record<string, unknown>>;
  };
};

export type BulkCampaignIntentValidation =
  | { valid: true; value: BulkCampaignIntentV1 }
  | { valid: false; code: 'invalid_campaign_intent'; reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value: unknown) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validTimeZone(value: unknown) {
  if (!boundedString(value, 100)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value as string }).format();
    return true;
  } catch {
    return false;
  }
}

function invalid(reason: string): BulkCampaignIntentValidation {
  return { valid: false, code: 'invalid_campaign_intent', reason };
}

export function validateBulkCampaignIntent(
  input: unknown
): BulkCampaignIntentValidation {
  if (!record(input) || input.schemaVersion !== 1) {
    return invalid('intent.schemaVersion must be 1 and intent must be an object.');
  }
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, 'utf8') > 256 * 1024) {
    return invalid('Campaign intent must not exceed 256 KiB.');
  }
  const selection = input.selection;
  if (!record(selection) || !Array.isArray(selection.destinations)) {
    return invalid('intent.selection.destinations must be an array.');
  }
  if (selection.destinations.length < 1 || selection.destinations.length > 500) {
    return invalid('A campaign must select between 1 and 500 destinations.');
  }
  if (
    selection.accountGroupId !== undefined &&
    !boundedString(selection.accountGroupId, 200)
  ) {
    return invalid('selection.accountGroupId must be a non-empty identifier.');
  }
  if (
    selection.tagIds !== undefined &&
    (!Array.isArray(selection.tagIds) ||
      selection.tagIds.length > 100 ||
      selection.tagIds.some((id) => !boundedString(id, 200)))
  ) {
    return invalid('selection.tagIds must contain at most 100 identifiers.');
  }
  const destinationKeys = new Set<string>();
  for (const destination of selection.destinations) {
    if (
      !record(destination) ||
      !boundedString(destination.integrationId, 200) ||
      !boundedString(destination.capabilityTupleId, 200)
    ) {
      return invalid('Every destination requires integrationId and capabilityTupleId.');
    }
    const key = `${destination.integrationId}:${destination.capabilityTupleId}`;
    if (destinationKeys.has(key)) {
      return invalid(`Destination ${key} is duplicated.`);
    }
    destinationKeys.add(key);
  }
  const distribution = input.distribution;
  if (
    !record(distribution) ||
    !['cross_post', 'distribute'].includes(distribution.mode as string)
  ) {
    return invalid('distribution.mode must be cross_post or distribute.');
  }
  const cadence = input.cadence;
  if (
    !record(cadence) ||
    !['per_account', 'campaign'].includes(cadence.scope as string) ||
    !Number.isInteger(cadence.postsPerDay) ||
    (cadence.postsPerDay as number) < 1 ||
    (cadence.postsPerDay as number) > 100
  ) {
    return invalid('cadence requires a scope and postsPerDay from 1 through 100.');
  }
  const schedule = input.schedule;
  if (!record(schedule)) return invalid('schedule must be an object.');
  if (!validDate(schedule.startDate) || (schedule.endDate !== undefined && !validDate(schedule.endDate))) {
    return invalid('schedule dates must use YYYY-MM-DD.');
  }
  if (
    typeof schedule.endDate === 'string' &&
    schedule.endDate < (schedule.startDate as string)
  ) {
    return invalid('schedule.endDate cannot be before startDate.');
  }
  if (
    !Array.isArray(schedule.weekdays) ||
    schedule.weekdays.length < 1 ||
    schedule.weekdays.length > 7 ||
    schedule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
    new Set(schedule.weekdays).size !== schedule.weekdays.length
  ) {
    return invalid('schedule.weekdays must contain unique integers from 0 through 6.');
  }
  if (!validTimeZone(schedule.timezone)) {
    return invalid('schedule.timezone must be a valid IANA timezone.');
  }
  if (!validTime(schedule.windowStart) || !validTime(schedule.windowEnd)) {
    return invalid('schedule windows must use 24-hour HH:mm values.');
  }
  if (schedule.windowStart === schedule.windowEnd) {
    return invalid('schedule.windowStart and windowEnd cannot be equal.');
  }
  if (
    !Number.isInteger(schedule.spacingMinutes) ||
    (schedule.spacingMinutes as number) < 1 ||
    (schedule.spacingMinutes as number) > 1440
  ) {
    return invalid('schedule.spacingMinutes must be from 1 through 1440.');
  }
  if (!['fixed', 'even', 'best_time'].includes(schedule.slotStrategy as string)) {
    return invalid('schedule.slotStrategy is invalid.');
  }
  if (!['next_available', 'keep_conflict', 'stop'].includes(schedule.conflictBehavior as string)) {
    return invalid('schedule.conflictBehavior is invalid.');
  }
  const ordering = input.ordering;
  if (
    !record(ordering) ||
    !['upload', 'filename', 'manual', 'deterministic_shuffle'].includes(
      ordering.mode as string
    )
  ) {
    return invalid('ordering.mode is invalid.');
  }
  if (
    ordering.mode === 'deterministic_shuffle' &&
    !boundedString(ordering.seed, 200)
  ) {
    return invalid('deterministic_shuffle requires a non-empty seed.');
  }
  if (input.publication !== undefined) {
    if (
      !record(input.publication) ||
      typeof input.publication.caption !== 'string' ||
      input.publication.caption.length > 5_000
    ) {
      return invalid('publication.caption must be a string of at most 5,000 characters.');
    }
    for (const field of ['settingsByTuple', 'settingsByDestination'] as const) {
      const settings = input.publication[field];
      if (
        settings !== undefined &&
        (!record(settings) ||
          Object.keys(settings).length > 500 ||
          Object.entries(settings).some(
            ([key, value]) => !boundedString(key, 200) || !record(value)
          ))
      ) {
        return invalid(`publication.${field} must contain at most 500 settings objects.`);
      }
    }
  }
  return { valid: true, value: input as BulkCampaignIntentV1 };
}

export type BulkCursorKind =
  | 'campaign'
  | 'intent'
  | 'issue'
  | 'job'
  | 'attempt'
  | 'upload';
export type BulkCursor = {
  kind: BulkCursorKind;
  timestamp: Date;
  id: string;
};

export function encodeBulkCursor(input: BulkCursor) {
  return Buffer.from(
    JSON.stringify({ v: 1, k: input.kind, t: input.timestamp.toISOString(), i: input.id }),
    'utf8'
  ).toString('base64url');
}

export function decodeBulkCursor(
  value: string | undefined,
  expectedKind: BulkCursorKind
): BulkCursor | null {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('invalid_cursor');
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const timestamp = new Date(parsed?.t);
    if (
      parsed?.v !== 1 ||
      parsed?.k !== expectedKind ||
      !boundedString(parsed?.i, 240) ||
      Number.isNaN(timestamp.valueOf()) ||
      timestamp.toISOString() !== parsed.t
    ) {
      throw new Error('invalid_cursor');
    }
    return { kind: expectedKind, timestamp, id: parsed.i };
  } catch {
    throw new Error('invalid_cursor');
  }
}

export function bulkPageLimit(value: unknown, fallback = 50) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('invalid_page_limit');
  }
  return parsed;
}
