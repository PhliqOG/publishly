export type FleetConnectAction = {
  actionId: string;
  provider: string;
  providerName: string;
  ordinal: number;
};

export type FleetConnectRejection = {
  provider: string;
  providerName?: string;
  count: number;
  code: string;
  reason: string;
};

export type FleetConnectBatch = {
  version: 1;
  actions: FleetConnectAction[];
  rejected: FleetConnectRejection[];
  cursor: number;
  completed: string[];
  failed: Array<{ actionId: string; reason: string }>;
};

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validAction(value: unknown): value is FleetConnectAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return (
    hasOnlyKeys(action, ['actionId', 'provider', 'providerName', 'ordinal']) &&
    ['actionId', 'provider', 'providerName'].every(
      (key) => typeof action[key] === 'string' && action[key]!.length > 0
    ) &&
    Number.isInteger(action.ordinal) &&
    (action.ordinal as number) >= 1
  );
}

function validRejection(value: unknown): value is FleetConnectRejection {
  if (!value || typeof value !== 'object') return false;
  const rejection = value as Record<string, unknown>;
  return (
    hasOnlyKeys(rejection, [
      'provider',
      'providerName',
      'count',
      'code',
      'reason',
    ]) &&
    typeof rejection.provider === 'string' &&
    typeof rejection.code === 'string' &&
    typeof rejection.reason === 'string' &&
    rejection.reason.length > 0 &&
    Number.isInteger(rejection.count) &&
    (rejection.count as number) >= 1
  );
}

export function createConnectBatch(input: {
  actions: unknown;
  rejected: unknown;
}): FleetConnectBatch {
  return {
    version: 1,
    actions: Array.isArray(input.actions)
      ? input.actions.filter(validAction).slice(0, 500)
      : [],
    rejected: Array.isArray(input.rejected)
      ? input.rejected.filter(validRejection).slice(0, 500)
      : [],
    cursor: 0,
    completed: [],
    failed: [],
  };
}

export function parseConnectBatch(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FleetConnectBatch;
    if (
      !parsed ||
      !hasOnlyKeys(parsed as unknown as Record<string, unknown>, [
        'version',
        'actions',
        'rejected',
        'cursor',
        'completed',
        'failed',
      ]) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.actions) ||
      !parsed.actions.every(validAction) ||
      !Array.isArray(parsed.rejected) ||
      !parsed.rejected.every(validRejection) ||
      !Number.isInteger(parsed.cursor) ||
      parsed.cursor < 0 ||
      parsed.cursor > parsed.actions.length ||
      !Array.isArray(parsed.completed) ||
      !parsed.completed.every((id) => typeof id === 'string') ||
      !Array.isArray(parsed.failed) ||
      !parsed.failed.every(
        (failure) =>
          !!failure &&
          typeof failure === 'object' &&
          hasOnlyKeys(failure, ['actionId', 'reason']) &&
          typeof failure.actionId === 'string' &&
          typeof failure.reason === 'string' &&
          failure.reason.length > 0
      )
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function currentConnectAction(batch: FleetConnectBatch) {
  return batch.actions[batch.cursor] || null;
}

export function confirmCurrentConnect(
  batch: FleetConnectBatch,
  addedProvider: string | null
) {
  const current = currentConnectAction(batch);
  if (!current || addedProvider !== current.provider) return batch;
  return {
    ...batch,
    cursor: batch.cursor + 1,
    completed: [...batch.completed, current.actionId],
  };
}

export function failCurrentConnect(batch: FleetConnectBatch, reason: string) {
  const current = currentConnectAction(batch);
  if (!current) return batch;
  return {
    ...batch,
    cursor: batch.cursor + 1,
    failed: [
      ...batch.failed,
      {
        actionId: current.actionId,
        reason: reason.trim() || 'Connection OAuth could not be started.',
      },
    ],
  };
}
