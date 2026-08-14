export type BulkTransportMode = 'direct_upload' | 'provider_pull';
export type BulkCertificationStatus =
  | 'not_run'
  | 'failed'
  | 'expired'
  | 'certified';

export type BulkSchedulerTuple = {
  id: string;
  provider: string;
  providerDisplayName: string;
  accountType: string;
  postType: string;
  mediaKind: 'video';
  mutationAdapter: string;
  adapterImplemented: boolean;
  transportMode: BulkTransportMode;
  privateTransportReady: boolean;
  providerFetchPolicy: {
    ttlSeconds: number;
    maxFetches: number | null;
    allowHead: boolean;
    allowRange: boolean;
  } | null;
  validationProfile: string;
  confirmationMethod: string;
  confirmationImplemented: boolean;
  ambiguityRecoveryMethod: string;
  ambiguityRecoveryImplemented: boolean;
  certificationStatus: BulkCertificationStatus;
  certificationEvidence: string | null;
  defaultEligible: boolean;
  killSwitchEnv: string;
};

type BulkSchedulerMatrix = {
  schemaVersion: number;
  updated: string;
  globalKillSwitchEnv: string;
  canaryModeEnv: string;
  canaryTupleListEnv: string;
  canaryIntegrationListEnv: string;
  unknownTuplePolicy: 'disabled';
  tuples: readonly BulkSchedulerTuple[];
};

// JSON is intentional: scripts, server code and frontend builds all consume
// the exact same authored rows without maintaining parallel TypeScript lists.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const raw = require('../../../../data/bulk-scheduler-capabilities.json') as BulkSchedulerMatrix;

export const BULK_SCHEDULER_CAPABILITY_MATRIX: Readonly<BulkSchedulerMatrix> =
  validateMatrix(raw);

export type BulkCapabilityEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type BulkCapabilityDecisionCode =
  | 'eligible'
  | 'unknown_tuple'
  | 'global_kill_switch'
  | 'tuple_kill_switch'
  | 'adapter_not_implemented'
  | 'private_transport_not_ready'
  | 'confirmation_not_implemented'
  | 'ambiguity_recovery_not_implemented'
  | 'real_provider_canary_required'
  | 'not_default_eligible'
  | 'canary_mode_disabled'
  | 'canary_tuple_not_selected'
  | 'canary_integration_not_selected';

export type BulkCapabilityDecision = {
  eligible: boolean;
  code: BulkCapabilityDecisionCode;
  reason: string;
  tuple: BulkSchedulerTuple | null;
};

function enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function validateMatrix(matrix: BulkSchedulerMatrix) {
  if (matrix.schemaVersion !== 1 || matrix.unknownTuplePolicy !== 'disabled') {
    throw new Error('Unsupported Bulk Scheduler capability matrix contract.');
  }
  const ids = new Set<string>();
  const switches = new Set<string>();
  for (const tuple of matrix.tuples) {
    if (!tuple.id || ids.has(tuple.id)) {
      throw new Error(`Duplicate or empty Bulk Scheduler tuple: ${tuple.id}`);
    }
    if (!tuple.killSwitchEnv || switches.has(tuple.killSwitchEnv)) {
      throw new Error(
        `Duplicate or empty Bulk Scheduler kill switch: ${tuple.killSwitchEnv}`
      );
    }
    if (
      tuple.defaultEligible &&
      (!tuple.adapterImplemented ||
        !tuple.privateTransportReady ||
        !tuple.confirmationImplemented ||
        !tuple.ambiguityRecoveryImplemented ||
        tuple.certificationStatus !== 'certified' ||
        !tuple.certificationEvidence)
    ) {
      throw new Error(
        `Bulk Scheduler tuple ${tuple.id} is eligible without complete proof.`
      );
    }
    if (
      (tuple.transportMode === 'provider_pull' &&
        (!tuple.providerFetchPolicy ||
          !Number.isInteger(tuple.providerFetchPolicy.ttlSeconds) ||
          tuple.providerFetchPolicy.ttlSeconds < 300 ||
          tuple.providerFetchPolicy.ttlSeconds > 86_400 ||
          (tuple.providerFetchPolicy.maxFetches !== null &&
            (!Number.isInteger(tuple.providerFetchPolicy.maxFetches) ||
              tuple.providerFetchPolicy.maxFetches < 1)))) ||
      (tuple.transportMode === 'direct_upload' && tuple.providerFetchPolicy)
    ) {
      throw new Error(
        `Bulk Scheduler tuple ${tuple.id} has an invalid provider fetch policy.`
      );
    }
    ids.add(tuple.id);
    switches.add(tuple.killSwitchEnv);
  }
  return Object.freeze({
    ...matrix,
    tuples: Object.freeze(matrix.tuples.map((tuple) => Object.freeze(tuple))),
  });
}

export function findBulkSchedulerTuple(id: string) {
  return (
    BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.find(
      (tuple) => tuple.id === id
    ) || null
  );
}

function killed(
  tuple: BulkSchedulerTuple,
  env: BulkCapabilityEnvironment
): BulkCapabilityDecision | null {
  if (enabled(env[BULK_SCHEDULER_CAPABILITY_MATRIX.globalKillSwitchEnv])) {
    return {
      eligible: false,
      code: 'global_kill_switch',
      reason: 'Bulk Scheduler publishing is temporarily disabled.',
      tuple,
    };
  }
  if (enabled(env[tuple.killSwitchEnv])) {
    return {
      eligible: false,
      code: 'tuple_kill_switch',
      reason: `${tuple.providerDisplayName} ${tuple.postType} ${tuple.mediaKind} scheduling is temporarily disabled.`,
      tuple,
    };
  }
  return null;
}

export function customerBulkTupleDecision(
  tupleId: string,
  env: BulkCapabilityEnvironment = process.env
): BulkCapabilityDecision {
  const tuple = findBulkSchedulerTuple(tupleId);
  if (!tuple) {
    return {
      eligible: false,
      code: 'unknown_tuple',
      reason: 'This Bulk Scheduler combination is not supported.',
      tuple: null,
    };
  }
  const killDecision = killed(tuple, env);
  if (killDecision) return killDecision;
  if (!tuple.adapterImplemented) {
    return {
      eligible: false,
      code: 'adapter_not_implemented',
      reason: 'The provider mutation adapter is not implemented for this combination.',
      tuple,
    };
  }
  if (!tuple.privateTransportReady) {
    return {
      eligible: false,
      code: 'private_transport_not_ready',
      reason: 'Private media delivery has not been proved for this combination.',
      tuple,
    };
  }
  if (!tuple.confirmationImplemented) {
    return {
      eligible: false,
      code: 'confirmation_not_implemented',
      reason: 'Provider read-back confirmation is not implemented for this combination.',
      tuple,
    };
  }
  if (!tuple.ambiguityRecoveryImplemented) {
    return {
      eligible: false,
      code: 'ambiguity_recovery_not_implemented',
      reason:
        'This adapter cannot safely reconcile an ambiguous provider mutation without blind reposting.',
      tuple,
    };
  }
  if (
    tuple.certificationStatus !== 'certified' ||
    !tuple.certificationEvidence
  ) {
    return {
      eligible: false,
      code: 'real_provider_canary_required',
      reason: 'This exact combination has not passed a controlled real-provider canary.',
      tuple,
    };
  }
  if (!tuple.defaultEligible) {
    return {
      eligible: false,
      code: 'not_default_eligible',
      reason: 'This certified combination has not been released to customers.',
      tuple,
    };
  }
  return {
    eligible: true,
    code: 'eligible',
    reason: 'This combination is certified and available.',
    tuple,
  };
}

export function canaryBulkTupleDecision(
  tupleId: string,
  env: BulkCapabilityEnvironment = process.env
): BulkCapabilityDecision {
  const tuple = findBulkSchedulerTuple(tupleId);
  if (!tuple) return customerBulkTupleDecision(tupleId, env);
  const killDecision = killed(tuple, env);
  if (killDecision) return killDecision;
  if (!tuple.adapterImplemented) {
    return {
      eligible: false,
      code: 'adapter_not_implemented',
      reason: 'The provider mutation adapter is not implemented for this combination.',
      tuple,
    };
  }
  if (!tuple.privateTransportReady) {
    return {
      eligible: false,
      code: 'private_transport_not_ready',
      reason: 'Private media delivery must pass its contract suite before a canary.',
      tuple,
    };
  }
  if (!tuple.confirmationImplemented) {
    return {
      eligible: false,
      code: 'confirmation_not_implemented',
      reason: 'Provider read-back confirmation must exist before a canary.',
      tuple,
    };
  }
  if (!tuple.ambiguityRecoveryImplemented) {
    return {
      eligible: false,
      code: 'ambiguity_recovery_not_implemented',
      reason:
        'Safe ambiguous-mutation recovery must exist before a controlled canary.',
      tuple,
    };
  }
  if (!enabled(env[BULK_SCHEDULER_CAPABILITY_MATRIX.canaryModeEnv])) {
    return {
      eligible: false,
      code: 'canary_mode_disabled',
      reason: 'Controlled Bulk Scheduler canary mode is disabled.',
      tuple,
    };
  }
  const selected = new Set(
    (env[BULK_SCHEDULER_CAPABILITY_MATRIX.canaryTupleListEnv] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (!selected.has(tuple.id)) {
    return {
      eligible: false,
      code: 'canary_tuple_not_selected',
      reason: 'This tuple was not explicitly selected for the controlled canary.',
      tuple,
    };
  }
  return {
    eligible: true,
    code: 'eligible',
    reason: 'This tuple is enabled only for a controlled real-provider canary.',
    tuple,
  };
}

export function bulkTupleDecisionForIntegration(
  tupleId: string,
  integrationId: string,
  env: BulkCapabilityEnvironment = process.env
): BulkCapabilityDecision {
  const customer = customerBulkTupleDecision(tupleId, env);
  if (customer.eligible) return customer;
  const canary = canaryBulkTupleDecision(tupleId, env);
  if (!canary.eligible) return customer;
  const selected = new Set(
    (env[BULK_SCHEDULER_CAPABILITY_MATRIX.canaryIntegrationListEnv] || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (!selected.has(integrationId)) {
    return {
      eligible: false,
      code: 'canary_integration_not_selected',
      reason:
        'This connection is not an explicitly designated Bulk Scheduler canary destination.',
      tuple: canary.tuple,
    };
  }
  return canary;
}

export function bulkSchedulerCapabilitySnapshot(
  env: BulkCapabilityEnvironment = process.env
) {
  return {
    schemaVersion: BULK_SCHEDULER_CAPABILITY_MATRIX.schemaVersion,
    updated: BULK_SCHEDULER_CAPABILITY_MATRIX.updated,
    unknownTuplePolicy:
      BULK_SCHEDULER_CAPABILITY_MATRIX.unknownTuplePolicy,
    tuples: BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.map((tuple) => ({
      ...tuple,
      decision: customerBulkTupleDecision(tuple.id, env),
    })),
    canaryMode: env[BULK_SCHEDULER_CAPABILITY_MATRIX.canaryModeEnv] === 'true',
  };
}

export function bulkSchedulerCapabilitySnapshotForIntegrations(
  integrationIds: string[],
  env: BulkCapabilityEnvironment = process.env
) {
  const ids = [...new Set(integrationIds.filter(Boolean))];
  return {
    schemaVersion: BULK_SCHEDULER_CAPABILITY_MATRIX.schemaVersion,
    updated: BULK_SCHEDULER_CAPABILITY_MATRIX.updated,
    unknownTuplePolicy: BULK_SCHEDULER_CAPABILITY_MATRIX.unknownTuplePolicy,
    canaryMode: env[BULK_SCHEDULER_CAPABILITY_MATRIX.canaryModeEnv] === 'true',
    tuples: BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.map((tuple) => ({
      ...tuple,
      decision: customerBulkTupleDecision(tuple.id, env),
      integrationDecisions: ids.map((integrationId) => ({
        integrationId,
        ...bulkTupleDecisionForIntegration(tuple.id, integrationId, env),
      })),
    })),
  };
}

export function advertisedBulkSchedulerTuples() {
  return BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.filter(
    (tuple) =>
      tuple.defaultEligible &&
      tuple.certificationStatus === 'certified' &&
      tuple.ambiguityRecoveryImplemented &&
      !!tuple.certificationEvidence
  );
}
