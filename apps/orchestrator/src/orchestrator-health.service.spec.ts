import { Connection } from '@temporalio/client';
import { OrchestratorHealthService } from './orchestrator-health.service';

describe('OrchestratorHealthService', () => {
  const now = new Date('2026-08-11T12:00:00.000Z');
  const close = jest.fn().mockResolvedValue(undefined);
  const describeNamespace = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    close.mockClear();
    describeNamespace.mockClear();
    jest.spyOn(Connection, 'connect').mockResolvedValue({
      close,
      workflowService: { describeNamespace },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS;
  });

  const service = (result: unknown) =>
    new OrchestratorHealthService({
      serviceHealthSample: {
        findFirst:
          result instanceof Error
            ? jest.fn().mockRejectedValue(result)
            : jest.fn().mockResolvedValue(result),
      },
    } as any);

  const heartbeat = (overrides: Record<string, unknown> = {}) => ({
    status: 'OPERATIONAL',
    code: 'publishing_engine_heartbeat',
    reason: 'The publishing engine completed its durable heartbeat.',
    observedAt: new Date(now.getTime() - 30_000),
    ...overrides,
  });

  it('reports healthy only with Temporal and a fresh durable heartbeat', async () => {
    await expect(service(heartbeat()).check(now)).resolves.toMatchObject({
      healthy: true,
      status: 'ok',
      code: 'publishing_engine_heartbeat',
      checks: { temporal: true, publishingEngine: true },
    });
    expect(describeNamespace).toHaveBeenCalledWith({ namespace: 'default' });
    expect(close).toHaveBeenCalled();
  });

  it('keeps a fresh degraded engine ready while surfacing its reason', async () => {
    await expect(
      service(
        heartbeat({
          status: 'DEGRADED',
          code: 'publishing_engine_degraded',
          reason: 'Publishing is delayed but still executing.',
        })
      ).check(now)
    ).resolves.toMatchObject({
      healthy: true,
      status: 'degraded',
      reason: 'Publishing is delayed but still executing.',
    });
  });

  it('fails closed when Temporal is unavailable', async () => {
    jest
      .spyOn(Connection, 'connect')
      .mockRejectedValueOnce(new Error('connection refused'));
    await expect(service(heartbeat()).check(now)).resolves.toMatchObject({
      healthy: false,
      code: 'temporal_unavailable',
      reason: expect.any(String),
      checks: { temporal: false, publishingEngine: false },
    });
  });

  it('fails closed when heartbeat evidence is missing', async () => {
    await expect(service(null).check(now)).resolves.toMatchObject({
      healthy: false,
      code: 'publishing_engine_heartbeat_missing',
      reason: expect.any(String),
    });
  });

  it('fails closed when the heartbeat is stale', async () => {
    process.env.ORCHESTRATOR_HEARTBEAT_MAX_AGE_SECONDS = '60';
    await expect(
      service(heartbeat({ observedAt: new Date(now.getTime() - 61_000) })).check(
        now
      )
    ).resolves.toMatchObject({
      healthy: false,
      code: 'publishing_engine_heartbeat_stale',
      reason: 'The last durable publishing-engine heartbeat is 61 seconds old.',
    });
  });

  it('fails closed with classified evidence when the engine reports outage', async () => {
    await expect(
      service(
        heartbeat({
          status: 'OUTAGE',
          code: '',
          reason: '',
        })
      ).check(now)
    ).resolves.toMatchObject({
      healthy: false,
      code: 'publishing_engine_outage',
      reason: expect.any(String),
    });
  });

  it('classifies a database evidence-read failure', async () => {
    await expect(service(new Error('database down')).check(now)).resolves.toMatchObject(
      {
        healthy: false,
        code: 'publishing_engine_evidence_unavailable',
        reason: expect.any(String),
      }
    );
  });
});
