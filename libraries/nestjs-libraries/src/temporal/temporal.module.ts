import {
  TemporalModule,
  TemporalOptions,
  WorkerDefinition,
} from 'nestjs-temporal-core';
import {
  bundleWorkflowCode,
  WorkflowBundleWithSourceMap,
} from '@temporalio/worker';
import { socialIntegrationList } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { temporalWorkerLimits } from '@gitroom/nestjs-libraries/temporal/temporal.worker.limits';

type WorkflowBundler = typeof bundleWorkflowCode;

const connectionOptions = (environment: NodeJS.ProcessEnv) => ({
  address: environment.TEMPORAL_ADDRESS || 'localhost:7233',
  ...(environment.TEMPORAL_TLS === 'true' ? { tls: true } : {}),
  ...(environment.TEMPORAL_API_KEY
    ? { apiKey: environment.TEMPORAL_API_KEY }
    : {}),
  namespace: environment.TEMPORAL_NAMESPACE || 'default',
});

const excludedQueues = (environment: NodeJS.ProcessEnv) =>
  (environment.EXCLUDE_QUEUE || '')
    .split(',')
    .map((queue) => queue.trim())
    .filter(Boolean);

const concurrencyDivider = (environment: NodeJS.ProcessEnv) =>
  Math.max(1, Number(environment.WORKER_CONCURRENCY_DIVIDER) || 1);

export const createTemporalWorkerDefinitions = (
  activityClasses: any[],
  workflowBundle: WorkflowBundleWithSourceMap,
  environment: NodeJS.ProcessEnv = process.env
): WorkerDefinition[] => {
  const excluded = excludedQueues(environment);
  const divider = concurrencyDivider(environment);

  return [
    { identifier: 'main', maxConcurrentJob: undefined },
    ...socialIntegrationList,
  ]
    .filter((integration) => integration.identifier.indexOf('-') === -1)
    .map((integration) => ({
      integration,
      taskQueue: integration.identifier.split('-')[0],
    }))
    .filter(({ taskQueue }) => !excluded.includes(taskQueue))
    .map(({ integration, taskQueue }) => {
      // Split the per-provider cap across the servers sharing this queue.
      // Providers whose cap is smaller than the replica count remain pinned
      // with EXCLUDE_QUEUE, preserving the existing queue ownership model.
      const limits = temporalWorkerLimits(
        integration.maxConcurrentJob,
        divider,
        environment
      );

      return {
        taskQueue,
        workflowBundle: workflowBundle as unknown as Record<string, unknown>,
        activityClasses,
        autoStart: true,
        workerOptions: {
          maxConcurrentActivityTaskExecutions: limits.activityExecutions,
          maxConcurrentWorkflowTaskExecutions: limits.workflowExecutions,
          maxConcurrentActivityTaskPolls: limits.activityPolls,
          maxConcurrentWorkflowTaskPolls: limits.workflowPolls,
        },
      };
    });
};

export const createTemporalWorkerOptions = async (
  workflowsPath: string | undefined,
  activityClasses: any[] | undefined,
  environment: NodeJS.ProcessEnv = process.env,
  workflowBundler: WorkflowBundler = bundleWorkflowCode
): Promise<TemporalOptions> => {
  if (!workflowsPath) {
    throw new Error('Temporal worker workflows path is required.');
  }

  // Every task queue executes the same workflow module. Building once and
  // sharing the immutable result avoids one webpack compilation per provider.
  const workflowBundle = await workflowBundler({ workflowsPath });

  return {
    isGlobal: true,
    connection: connectionOptions(environment),
    taskQueue: 'main',
    logLevel: 'error',
    workers: createTemporalWorkerDefinitions(
      activityClasses || [],
      workflowBundle,
      environment
    ),
  };
};

export const getTemporalModule = (
  isWorkers: boolean,
  workflowsPath?: string,
  activityClasses?: any[]
) => {
  if (!isWorkers) {
    return TemporalModule.register({
      isGlobal: true,
      connection: connectionOptions(process.env),
      taskQueue: 'main',
      logLevel: 'error',
    });
  }

  return TemporalModule.registerAsync({
    isGlobal: true,
    useFactory: () =>
      createTemporalWorkerOptions(workflowsPath, activityClasses, process.env),
  });
};
