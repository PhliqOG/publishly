jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  socialIntegrationList: [
    { identifier: 'instagram', maxConcurrentJob: 5 },
    { identifier: 'facebook', maxConcurrentJob: 8 },
    { identifier: 'linkedin-page', maxConcurrentJob: 4 },
  ],
}));

import { temporalWorkerLimits } from './temporal.worker.limits';
import {
  createTemporalWorkerDefinitions,
  createTemporalWorkerOptions,
} from './temporal.module';

describe('temporal worker limits', () => {
  it('uses finite safe defaults instead of effectively unbounded slots', () => {
    expect(temporalWorkerLimits(undefined, 1, {})).toEqual({
      activityExecutions: 32,
      workflowExecutions: 8,
      activityPolls: 4,
      workflowPolls: 4,
    });
  });

  it('preserves provider caps and replica division', () => {
    expect(temporalWorkerLimits(9, 2, {})).toEqual({
      activityExecutions: 4,
      workflowExecutions: 8,
      activityPolls: 4,
      workflowPolls: 4,
    });
    expect(temporalWorkerLimits(1, 4, {})).toMatchObject({
      activityExecutions: 1,
      activityPolls: 1,
    });
  });

  it('accepts bounded overrides and limits pollers to execution slots', () => {
    expect(
      temporalWorkerLimits(undefined, 1, {
        WORKER_DEFAULT_ACTIVITY_CONCURRENCY: '12',
        WORKER_DEFAULT_WORKFLOW_CONCURRENCY: '6',
        WORKER_ACTIVITY_POLLS: '20',
        WORKER_WORKFLOW_POLLS: '12',
      })
    ).toEqual({
      activityExecutions: 12,
      workflowExecutions: 6,
      activityPolls: 12,
      workflowPolls: 6,
    });
  });

  it.each([
    ['0', '0'],
    ['-1', '-1'],
    ['257', '65'],
    ['1.5', '4.5'],
    ['unbounded', 'many'],
  ])('falls back safely for invalid overrides %s/%s', (activity, workflow) => {
    expect(
      temporalWorkerLimits(undefined, 1, {
        WORKER_DEFAULT_ACTIVITY_CONCURRENCY: activity,
        WORKER_DEFAULT_WORKFLOW_CONCURRENCY: workflow,
      })
    ).toMatchObject({ activityExecutions: 32, workflowExecutions: 8 });
  });
});

describe('temporal worker workflow bundle', () => {
  it('builds workflow code once and shares the immutable bundle across queues', async () => {
    const workflowBundle = { code: 'workflow-code', sourceMap: '' };
    const workflowBundler = jest.fn().mockResolvedValue(workflowBundle);

    const options = await createTemporalWorkerOptions(
      'resolved/workflows.js',
      [],
      {},
      workflowBundler
    );

    expect(workflowBundler).toHaveBeenCalledTimes(1);
    expect(workflowBundler).toHaveBeenCalledWith({
      workflowsPath: 'resolved/workflows.js',
    });
    expect(options.workers?.length).toBeGreaterThan(1);
    expect(
      options.workers?.every(
        (worker) => worker.workflowBundle === workflowBundle
      )
    ).toBe(true);
    expect(options.workers?.every((worker) => !worker.workflowsPath)).toBe(
      true
    );
  });

  it('preserves queue exclusion and per-provider worker limits', () => {
    const workers = createTemporalWorkerDefinitions(
      [],
      { code: 'workflow-code', sourceMap: '' },
      {
        EXCLUDE_QUEUE: 'instagram,facebook',
        WORKER_DEFAULT_ACTIVITY_CONCURRENCY: '7',
        WORKER_DEFAULT_WORKFLOW_CONCURRENCY: '5',
      }
    );

    expect(workers.some((worker) => worker.taskQueue === 'instagram')).toBe(
      false
    );
    expect(workers.some((worker) => worker.taskQueue === 'facebook')).toBe(
      false
    );
    expect(workers.find((worker) => worker.taskQueue === 'main')).toMatchObject(
      {
        workerOptions: {
          maxConcurrentActivityTaskExecutions: 7,
          maxConcurrentWorkflowTaskExecutions: 5,
        },
      }
    );
  });

  it('fails closed when worker workflow code has no resolvable path', async () => {
    const workflowBundler = jest.fn();

    await expect(
      createTemporalWorkerOptions(undefined, [], {}, workflowBundler)
    ).rejects.toThrow('Temporal worker workflows path is required.');
    expect(workflowBundler).not.toHaveBeenCalled();
  });
});
