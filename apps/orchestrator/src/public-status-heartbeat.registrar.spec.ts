import { PublicStatusHeartbeatRegistrar } from './public-status-heartbeat.registrar';

describe('PublicStatusHeartbeatRegistrar', () => {
  it('idempotently registers the heartbeat on every orchestrator boot', async () => {
    const start = jest.fn().mockResolvedValue({});
    const registrar = new PublicStatusHeartbeatRegistrar({
      client: {
        getRawClient: () => ({ workflow: { start } }),
      },
    } as any);

    await registrar.onApplicationBootstrap();

    expect(start).toHaveBeenCalledWith('publicStatusHeartbeatWorkflowV101', {
      workflowId: 'public-status-heartbeat-v101',
      taskQueue: 'main',
      workflowIdConflictPolicy: 'USE_EXISTING',
    });
  });

  it('logs a classified non-empty failure when registration is rejected', async () => {
    const registrar = new PublicStatusHeartbeatRegistrar({
      client: {
        getRawClient: () => ({
          workflow: { start: jest.fn().mockRejectedValue(new Error('denied')) },
        }),
      },
    } as any);
    const error = jest
      .spyOn((registrar as any).logger, 'error')
      .mockImplementation(() => undefined);

    await registrar.onApplicationBootstrap();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'publishing_engine_heartbeat_registration_failed',
        code: 'heartbeat_workflow_registration_failed',
        reason: 'denied',
      })
    );
  });

  it('logs a classified failure when no Temporal client exists', async () => {
    const registrar = new PublicStatusHeartbeatRegistrar({
      client: { getRawClient: (): undefined => undefined },
    } as any);
    const error = jest
      .spyOn((registrar as any).logger, 'error')
      .mockImplementation(() => undefined);

    await registrar.onApplicationBootstrap();

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'temporal_client_unavailable',
        reason: expect.any(String),
      })
    );
  });
});
