export type FleetReconnectAction = {
  integrationId: string;
  internalId: string;
  name: string;
  provider: string;
};

export type FleetReconnectRejection = {
  integrationId: string;
  name?: string;
  provider?: string;
  code: string;
  reason: string;
};

export type FleetReconnectBatch = {
  version: 1;
  actions: FleetReconnectAction[];
  rejected: FleetReconnectRejection[];
  cursor: number;
  completed: string[];
  failed: Array<{ integrationId: string; reason: string }>;
};

function validAction(value: unknown): value is FleetReconnectAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  return ['integrationId', 'internalId', 'name', 'provider'].every(
    (key) => typeof action[key] === 'string' && action[key]!.length > 0
  );
}

function validRejection(value: unknown): value is FleetReconnectRejection {
  if (!value || typeof value !== 'object') return false;
  const rejection = value as Record<string, unknown>;
  return (
    typeof rejection.integrationId === 'string' &&
    typeof rejection.code === 'string' &&
    typeof rejection.reason === 'string' &&
    rejection.reason.length > 0
  );
}

export function createReconnectBatch(input: {
  actions: unknown;
  rejected: unknown;
}): FleetReconnectBatch {
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

export function parseReconnectBatch(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as FleetReconnectBatch;
    if (
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
      !Array.isArray(parsed.failed)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function currentReconnectAction(batch: FleetReconnectBatch) {
  return batch.actions[batch.cursor] || null;
}

export function completeCurrentReconnect(batch: FleetReconnectBatch) {
  const current = currentReconnectAction(batch);
  if (!current) return batch;
  return {
    ...batch,
    cursor: batch.cursor + 1,
    completed: [...batch.completed, current.integrationId],
  };
}

export function failCurrentReconnect(
  batch: FleetReconnectBatch,
  reason: string
) {
  const current = currentReconnectAction(batch);
  if (!current) return batch;
  return {
    ...batch,
    cursor: batch.cursor + 1,
    failed: [
      ...batch.failed,
      {
        integrationId: current.integrationId,
        reason: reason.trim() || 'Reconnect could not be started.',
      },
    ],
  };
}
