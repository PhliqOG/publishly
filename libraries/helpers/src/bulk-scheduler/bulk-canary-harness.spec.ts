/* eslint-disable @typescript-eslint/no-require-imports */
const {
  EXECUTION_ATTESTATION,
  assertCertification,
  assertEvidenceSafe,
  parseConfiguration,
  redactEvidence,
  runCanary,
} = require('../../../../scripts/bulk-scheduler-canary.cjs');

const tupleId = 'instagram.professional.reel.video';
const integrationId = 'ig-canary-1';
const authToken = 'private-auth-token-for-test';

function environment(mode: 'preflight' | 'execute' = 'preflight') {
  return {
    BULK_CANARY_API_BASE_URL: 'https://api.publishly.test/api',
    BULK_CANARY_AUTH_TOKEN: authToken,
    BULK_CANARY_ORGANIZATION_ID: 'org-canary',
    BULK_CANARY_TUPLE_ID: tupleId,
    BULK_CANARY_INTEGRATION_ID: integrationId,
    BULK_CANARY_EXPECTED_DESTINATION_LABEL: 'Publishly Provider Canary',
    BULK_CANARY_EXPECTED_BUILD_REVISION: 'revision-under-test',
    BULK_CANARY_POLL_INTERVAL_MS: '60000',
    BULK_CANARY_TIMEOUT_MS: '60000',
    ...(mode === 'execute'
      ? {
          BULK_CANARY_MEDIA_FILE: 'C:/fixtures/provider-canary.mp4',
          BULK_CANARY_EVIDENCE_FILE:
            'C:/evidence/provider-canary-revision-under-test.json',
          BULK_CANARY_CONFIRM: `publishly-real-canary:${tupleId}:${integrationId}`,
          BULK_CANARY_ACCOUNT_ATTESTATION: EXECUTION_ATTESTATION,
        }
      : {}),
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
  };
}

function preflightPayload(overrides: Record<string, unknown> = {}) {
  return {
    serverTime: '2026-08-12T20:00:00.000Z',
    organizationId: 'org-canary',
    buildRevision: 'revision-under-test',
    matrixHash: 'a'.repeat(64),
    canaryMode: true,
    materializerEnabled: true,
    calendarWriterMode: 'AUTHORITATIVE',
    tuple: {
      id: tupleId,
      provider: 'instagram',
      accountType: 'professional',
      postType: 'reel',
      mediaKind: 'video',
      transportMode: 'provider_pull',
      privateTransportReady: true,
      providerFetchPolicy: {
        ttlSeconds: 14400,
        maxFetches: null,
        allowHead: true,
        allowRange: true,
      },
      confirmationMethod: 'instagram_media_read',
      confirmationImplemented: true,
      ambiguityRecoveryMethod: 'instagram_unpublished_container_boundary',
      ambiguityRecoveryImplemented: true,
      certificationStatus: 'not_run',
      defaultEligible: false,
    },
    integration: {
      id: integrationId,
      name: 'Publishly Provider Canary',
      providerIdentifier: 'instagram',
      disabled: false,
      refreshNeeded: false,
      inBetweenSteps: false,
      tokenHealthState: 'HEALTHY',
      connectionHealthState: 'HEALTHY',
    },
    decision: { eligible: true, code: 'eligible', reason: 'Canary only.' },
    ...overrides,
  };
}

function capabilityPayload() {
  return {
    tuples: [
      {
        id: tupleId,
        integrationDecisions: [
          {
            integrationId,
            eligible: true,
            code: 'eligible',
            reason: 'Canary only.',
          },
        ],
      },
    ],
  };
}

function createFetch(
  overrides: {
    preflight?: Record<string, unknown>;
    jobStates?: Array<Record<string, unknown>>;
    publishingJob?: Record<string, unknown>;
    receipts?: Record<string, unknown>;
    issues?: Array<Record<string, unknown>>;
  } = {}
) {
  const calls: Array<{ method: string; pathname: string }> = [];
  let jobRead = 0;
  const campaignId = 'bulk_campaign_canary';
  const jobId = 'bulk_job_canary';
  const postId = 'bulk_post_canary';
  const defaultJob = {
    id: jobId,
    campaignId,
    state: 'PUBLISHED',
    reservationId: 'calendar_reservation_canary',
    postId,
    publishingJobId: 'publishing_job_canary',
    outcomeClass: null,
    outcomeCode: 'confirmed_live',
    outcomeReason: 'The provider confirmed this post live.',
  };
  const fetchImpl = jest.fn(async (rawUrl: string, options: any = {}) => {
    const url = new URL(rawUrl);
    const method = options.method || 'GET';
    calls.push({ method, pathname: url.pathname });
    if (url.pathname.endsWith('/users/self')) {
      return jsonResponse({ orgId: 'org-canary' });
    }
    if (url.pathname.endsWith('/integrations/list')) {
      return jsonResponse({
        integrations: [
          {
            id: integrationId,
            name: 'Publishly Provider Canary',
            identifier: 'instagram',
            disabled: false,
          },
        ],
      });
    }
    if (url.pathname.endsWith('/bulk/scheduler/capabilities')) {
      return jsonResponse(capabilityPayload());
    }
    if (url.pathname.endsWith('/bulk/scheduler/canary/preflight')) {
      return jsonResponse(preflightPayload(overrides.preflight));
    }
    if (url.pathname.endsWith('/bulk/scheduler/campaigns') && method === 'POST') {
      return jsonResponse({ id: campaignId, currentRevision: 1 }, 201);
    }
    if (url.pathname.endsWith(`/${campaignId}/uploads`) && method === 'POST') {
      return jsonResponse(
        {
          sessions: [
            {
              id: 'bulk_upload_canary',
              campaignId,
              chunkSize: 8 * 1024 * 1024,
              totalParts: 1,
              expectedByteLength: 1024,
            },
          ],
        },
        201
      );
    }
    if (url.pathname.endsWith('/bulk_upload_canary/complete')) {
      return jsonResponse({ accepted: true });
    }
    if (url.pathname.endsWith('/bulk_upload_canary')) {
      return jsonResponse({
        id: 'bulk_upload_canary',
        assetId: 'bulk_asset_canary',
        state: 'READY',
        normalizationApplied: false,
        metadata: { width: 1080, height: 1920, durationSeconds: 3 },
      });
    }
    if (url.pathname.endsWith(`/${campaignId}/plan`)) {
      return jsonResponse({
        expansion: {
          assetCount: 1,
          destinationCount: 1,
          expandedJobCount: 1,
          formula: '1 assets × 1 destinations = 1 jobs',
        },
        overflowCount: 0,
        firstScheduledAt: '2026-08-12T20:10:00.000Z',
        lastScheduledAt: '2026-08-12T20:10:00.000Z',
      });
    }
    if (url.pathname.endsWith(`/${campaignId}/jobs`)) {
      const states = overrides.jobStates || [defaultJob, defaultJob];
      const selected = states[Math.min(jobRead, states.length - 1)];
      jobRead += 1;
      return jsonResponse({ items: [selected], nextCursor: null });
    }
    if (url.pathname.endsWith(`/${postId}/publishing-job`)) {
      return jsonResponse(
        overrides.publishingJob || {
          id: 'publishing_job_canary',
          state: 'PUBLISHED',
          deliveryStage: 'confirmed_live',
          providerPostId: 'provider-post-1',
          providerUrl: 'https://www.instagram.com/reel/provider-post-1/',
          publishingAttempts: [
            {
              id: 'attempt-1',
              attemptNumber: 1,
              phase: 'MUTATION',
              state: 'ACCEPTED',
              mutationInvoked: true,
            },
          ],
          _count: {
            publishingAttempts: 1,
            bulkAssets: 1,
            failures: 0,
            receipts: 1,
          },
          bulkAssets: [
            {
              assetId: 'bulk_asset_canary',
              ordinal: 0,
              _count: { providerGrants: 1 },
              providerGrants: [
                {
                  capabilityTupleId: tupleId,
                  expiresAt: '2026-08-13T00:00:00.000Z',
                  maxFetches: null,
                  fetchCount: 1,
                  lastFetchedAt: '2026-08-12T20:10:10.000Z',
                  _count: { fetchEvents: 1 },
                  fetchEvents: [
                    {
                      method: 'GET',
                      state: 'SERVED',
                      statusCode: 200,
                      bytesServed: 1024,
                      code: 'provider_media_fetch_served',
                      reason: 'The provider media fetch completed successfully.',
                    },
                  ],
                },
              ],
            },
          ],
        }
      );
    }
    if (url.pathname.endsWith(`/${postId}/receipts`)) {
      return jsonResponse(
        overrides.receipts || {
          postId,
          latestStage: 'confirmed_live',
          receipts: [
            {
              id: 'receipt-1',
              stage: 'confirmed_live',
              providerPostId: 'provider-post-1',
              providerUrl: 'https://www.instagram.com/reel/provider-post-1/',
              confirmationMethod: 'instagram_media_read',
            },
          ],
        }
      );
    }
    if (url.pathname.endsWith(`/${campaignId}/issues`)) {
      return jsonResponse({ items: overrides.issues || [], nextCursor: null });
    }
    throw new Error(`Unhandled test request ${method} ${url.pathname}`);
  });
  return { fetchImpl, calls };
}

describe('controlled Bulk Scheduler provider canary harness', () => {
  it('requires explicit confirmation and attestation before any network request', async () => {
    const fetchImpl = jest.fn();
    const env = environment('execute');
    delete env.BULK_CANARY_CONFIRM;
    await expect(
      runCanary({ mode: 'execute', environment: env, fetchImpl })
    ).rejects.toMatchObject({ code: 'canary_input_missing' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps preflight read-only and rejects a destination-label mismatch', async () => {
    const { fetchImpl, calls } = createFetch();
    await expect(
      runCanary({
        mode: 'preflight',
        environment: {
          ...environment(),
          BULK_CANARY_EXPECTED_DESTINATION_LABEL: 'A customer account',
        },
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'canary_destination_label_mismatch' });
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('rejects the wrong deployed build before creating a campaign', async () => {
    const { fetchImpl, calls } = createFetch({
      preflight: { buildRevision: 'some-other-revision' },
    });
    await expect(
      runCanary({ mode: 'execute', environment: environment('execute'), fetchImpl })
    ).rejects.toMatchObject({ code: 'canary_build_revision_mismatch' });
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('does not treat a provider 2xx or sent receipt as certification', () => {
    expect(() =>
      assertCertification(
        { state: 'PUBLISHED' },
        {
          state: 'PUBLISHED',
          deliveryStage: 'sent',
          providerPostId: 'provider-post-1',
          providerUrl: 'https://provider.test/post/1',
          publishingAttempts: [
            { phase: 'MUTATION', state: 'ACCEPTED' },
          ],
        },
        { receipts: [{ stage: 'sent' }] },
        { confirmationMethod: 'provider_readback' }
      )
    ).toThrow(expect.objectContaining({ code: 'canary_not_confirmed_live' }));
  });

  it('accepts a formerly ambiguous mutation only when readback resolved it confirmed', () => {
    const publishingJob = {
      state: 'PUBLISHED',
      deliveryStage: 'confirmed_live',
      providerPostId: 'provider-post-1',
      providerUrl: 'https://provider.test/post/1',
      _count: {
        publishingAttempts: 2,
        bulkAssets: 0,
        failures: 0,
        receipts: 1,
      },
      bulkAssets: [],
      publishingAttempts: [
        {
          id: 'mutation-1',
          attemptNumber: 1,
          phase: 'MUTATION',
          state: 'AMBIGUOUS',
          mutationInvoked: true,
        },
        {
          id: 'reconcile-1',
          attemptNumber: 1,
          phase: 'RECONCILIATION',
          state: 'CONFIRMED',
          mutationInvoked: false,
        },
      ],
    };
    const receipts = {
      receipts: [
        {
          stage: 'confirmed_live',
          providerPostId: 'provider-post-1',
          providerUrl: 'https://provider.test/post/1',
          confirmationMethod: 'provider_readback',
        },
      ],
    };
    expect(() =>
      assertCertification(
        { state: 'PUBLISHED' },
        publishingJob,
        receipts,
        { transportMode: 'direct_upload', confirmationMethod: 'provider_readback' }
      )
    ).not.toThrow();
    publishingJob.publishingAttempts[1].state = 'NEEDS_REVIEW';
    expect(() =>
      assertCertification(
        { state: 'PUBLISHED' },
        publishingJob,
        receipts,
        { transportMode: 'direct_upload', confirmationMethod: 'provider_readback' }
      )
    ).toThrow(expect.objectContaining({ code: 'canary_attempt_unresolved' }));
  });

  it('stops at NEEDS_REVIEW and never invokes the item retry endpoint', async () => {
    const needsReview = {
      id: 'bulk_job_canary',
      campaignId: 'bulk_campaign_canary',
      state: 'NEEDS_REVIEW',
      reservationId: 'calendar_reservation_canary',
      postId: 'bulk_post_canary',
      outcomeClass: 'blocked',
      outcomeCode: 'outcome_unknown',
      outcomeReason: 'Provider acceptance could not be proved absent.',
    };
    const { fetchImpl, calls } = createFetch({
      jobStates: [needsReview, needsReview],
      issues: [
        {
          subjectId: 'bulk_job_canary',
          state: 'open',
          failureClass: 'user_action_needed',
          code: 'outcome_unknown',
          reason: 'Provider acceptance could not be proved absent.',
        },
      ],
    });
    const artifacts: unknown[] = [];
    await expect(
      runCanary({
        mode: 'execute',
        environment: environment('execute'),
        fetchImpl,
        inspectMedia: jest.fn().mockResolvedValue({
          byteLength: 1024,
          sha256: 'b'.repeat(64),
          originalName: 'canary.mp4',
        }),
        uploadParts: jest.fn(),
        writeEvidence: jest.fn(async (_path: string, artifact: unknown) => {
          artifacts.push(artifact);
        }),
        randomId: () => '00000000-0000-4000-8000-000000000001',
        now: () => new Date('2026-08-12T20:00:00.000Z'),
        sleep: jest.fn(),
      })
    ).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(calls.some((call) => call.pathname.endsWith('/retry'))).toBe(false);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({ verdict: 'FAIL', executed: true });
  });

  it('records only redacted machine evidence after exact confirmed-live readback', async () => {
    const { fetchImpl } = createFetch();
    const artifacts: any[] = [];
    const result = await runCanary({
      mode: 'execute',
      environment: environment('execute'),
      fetchImpl,
      inspectMedia: jest.fn().mockResolvedValue({
        byteLength: 1024,
        sha256: 'b'.repeat(64),
        originalName: 'canary.mp4',
      }),
      uploadParts: jest.fn(),
      writeEvidence: jest.fn(async (_path: string, artifact: unknown) => {
        artifacts.push(artifact);
      }),
      randomId: () => '00000000-0000-4000-8000-000000000002',
      now: () => new Date('2026-08-12T20:00:00.000Z'),
      sleep: jest.fn(),
    });

    expect(result).toMatchObject({ verdict: 'PASS', executed: true });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      verdict: 'PASS',
      tupleId,
      integrationId,
      execution: {
        campaign: { id: 'bulk_campaign_canary' },
        campaignJob: { state: 'PUBLISHED' },
        publishingJob: { deliveryStage: 'confirmed_live' },
      },
    });
    expect(JSON.stringify(artifacts[0])).not.toContain(authToken);
  });

  it('redacts and then rejects leaked private capabilities or tokens', () => {
    const capability = `pmg_${'a'.repeat(32)}.${'B'.repeat(43)}`;
    const safe = redactEvidence(
      {
        authorization: authToken,
        detail: `https://api.test/provider-media/${capability}/video.mp4 access_token=provider-secret`,
        providerUrl: 'https://instagram.test/reel/public-id',
      },
      [authToken]
    );
    expect(safe).toEqual({
      authorization: '[redacted]',
      detail:
        'https://api.test/provider-media/[redacted]/video.mp4 access_token=[redacted]',
      providerUrl: 'https://instagram.test/reel/public-id',
    });
    expect(() => assertEvidenceSafe(safe, [authToken])).not.toThrow();
    expect(() =>
      assertEvidenceSafe({ leaked: capability }, [authToken])
    ).toThrow(expect.objectContaining({ code: 'canary_evidence_redaction_failed' }));
  });

  it('requires HTTPS for execution but permits localhost HTTP read-only preflight', () => {
    expect(() =>
      parseConfiguration(
        {
          ...environment('execute'),
          BULK_CANARY_API_BASE_URL: 'http://localhost:3000/api',
        },
        'execute'
      )
    ).toThrow(expect.objectContaining({ code: 'canary_https_required' }));
    expect(
      parseConfiguration(
        {
          ...environment(),
          BULK_CANARY_API_BASE_URL: 'http://localhost:3000/api',
        },
        'preflight'
      ).apiBaseUrl
    ).toBe('http://localhost:3000/api');
  });
});
