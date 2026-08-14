const boundedInteger = (
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) => {
  if (!raw || !/^\d+$/.test(raw.trim())) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
};

export const temporalWorkerLimits = (
  providerMaximum: number | undefined,
  divider: number,
  env: NodeJS.ProcessEnv = process.env
) => {
  const activityExecutions = providerMaximum
    ? Math.max(1, Math.floor(providerMaximum / Math.max(1, divider)))
    : boundedInteger(
        env.WORKER_DEFAULT_ACTIVITY_CONCURRENCY,
        32,
        1,
        256
      );
  const workflowExecutions = boundedInteger(
    env.WORKER_DEFAULT_WORKFLOW_CONCURRENCY,
    8,
    2,
    64
  );
  const requestedActivityPolls = boundedInteger(
    env.WORKER_ACTIVITY_POLLS,
    4,
    1,
    32
  );
  const requestedWorkflowPolls = boundedInteger(
    env.WORKER_WORKFLOW_POLLS,
    4,
    2,
    32
  );

  return {
    activityExecutions,
    workflowExecutions,
    activityPolls: Math.min(activityExecutions, requestedActivityPolls),
    workflowPolls: Math.min(workflowExecutions, requestedWorkflowPolls),
  };
};
