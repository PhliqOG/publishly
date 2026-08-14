import {
  advertisedBulkSchedulerTuples,
  BULK_SCHEDULER_CAPABILITY_MATRIX,
  bulkTupleDecisionForIntegration,
  canaryBulkTupleDecision,
  customerBulkTupleDecision,
} from './capability.matrix';

describe('Bulk Scheduler tuple capability matrix', () => {
  const first = BULK_SCHEDULER_CAPABILITY_MATRIX.tuples[0];

  it('fails closed for unknown tuples', () => {
    expect(customerBulkTupleDecision('unknown.tuple', {})).toMatchObject({
      eligible: false,
      code: 'unknown_tuple',
      tuple: null,
    });
  });

  it('does not advertise a tuple before a real-provider canary and release gate', () => {
    expect(customerBulkTupleDecision(first.id, {})).toMatchObject({
      eligible: false,
      code: 'real_provider_canary_required',
    });
    expect(advertisedBulkSchedulerTuples()).toEqual([]);
  });

  it('honors the permanent global and per-tuple kill switches first', () => {
    expect(
      customerBulkTupleDecision(first.id, {
        BULK_SCHEDULER_KILL_ALL: 'true',
      })
    ).toMatchObject({ eligible: false, code: 'global_kill_switch' });
    expect(
      customerBulkTupleDecision(first.id, {
        [first.killSwitchEnv]: 'TRUE',
      })
    ).toMatchObject({ eligible: false, code: 'tuple_kill_switch' });
  });

  it('permits only explicitly selected, implementation-ready canary tuples', () => {
    expect(
      canaryBulkTupleDecision(first.id, {
        BULK_SCHEDULER_CANARY_MODE: 'true',
        BULK_SCHEDULER_CANARY_TUPLES: first.id,
      })
    ).toMatchObject({
      eligible: true,
      code: 'eligible',
    });
    expect(
      bulkTupleDecisionForIntegration(first.id, 'canary-connection', {
        BULK_SCHEDULER_CANARY_MODE: 'true',
        BULK_SCHEDULER_CANARY_TUPLES: first.id,
        BULK_SCHEDULER_CANARY_INTEGRATIONS: 'canary-connection',
      })
    ).toMatchObject({ eligible: true, code: 'eligible' });
    expect(
      bulkTupleDecisionForIntegration(first.id, 'customer-connection', {
        BULK_SCHEDULER_CANARY_MODE: 'true',
        BULK_SCHEDULER_CANARY_TUPLES: first.id,
        BULK_SCHEDULER_CANARY_INTEGRATIONS: 'canary-connection',
      })
    ).toMatchObject({
      eligible: false,
      code: 'canary_integration_not_selected',
    });
  });

  it('contains only explicit video-first candidate tuples', () => {
    expect(BULK_SCHEDULER_CAPABILITY_MATRIX.tuples.length).toBe(9);
    for (const tuple of BULK_SCHEDULER_CAPABILITY_MATRIX.tuples) {
      expect(tuple.mediaKind).toBe('video');
      expect(tuple.defaultEligible).toBe(false);
      expect(tuple.certificationStatus).toBe('not_run');
      expect(tuple.certificationEvidence).toBeNull();
      expect(tuple.privateTransportReady).toBe(true);
      expect(typeof tuple.ambiguityRecoveryImplemented).toBe('boolean');
      expect(tuple.ambiguityRecoveryMethod).toEqual(expect.any(String));
      expect(tuple.providerFetchPolicy).toEqual(
        tuple.transportMode === 'provider_pull'
          ? expect.objectContaining({
              ttlSeconds: expect.any(Number),
              maxFetches: null,
              allowHead: true,
              allowRange: true,
            })
          : null
      );
      expect(tuple.killSwitchEnv).toMatch(/^BULK_SCHEDULER_KILL_/);
    }
  });
});
