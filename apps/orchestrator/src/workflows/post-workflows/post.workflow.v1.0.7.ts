import { PostActivity } from '@gitroom/orchestrator/activities/post.activity';
import {
  defineSignal,
  proxyActivities,
  setHandler,
  startChild,
  workflowInfo,
} from '@temporalio/workflow';
import { postWorkflowV106 } from './post.workflow.v1.0.6';

export type PostWorkflowV107Input = {
  taskQueue: string;
  postId: string;
  organizationId: string;
  postNow?: boolean;
};

const poke = defineSignal('poke');

const { ensureClassifiedPublishingOutcomeV107 } =
  proxyActivities<PostActivity>({
    startToCloseTimeout: '2 minute',
    retry: {
      maximumAttempts: 5,
      backoffCoefficient: 2,
      initialInterval: '2 seconds',
      maximumInterval: '30 seconds',
    },
  });

function serializableFailure(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { message: String(error || 'The publishing workflow stopped unexpectedly.') };
  }

  const failure = error as { message?: unknown; name?: unknown; type?: unknown };
  return {
    message:
      typeof failure.message === 'string' && failure.message.trim()
        ? failure.message
        : 'The publishing workflow stopped unexpectedly.',
    type:
      typeof failure.type === 'string'
        ? failure.type
        : typeof failure.name === 'string'
        ? failure.name
        : 'WorkflowFailure',
  };
}

/**
 * Versioned terminal-invariant wrapper. V106 remains byte-for-byte compatible
 * with executions already in Temporal history; all newly queued posts pass
 * through this wrapper so an unexpected workflow return cannot be silent.
 */
export async function postWorkflowV107(input: PostWorkflowV107Input) {
  const child = await startChild(postWorkflowV106, {
    workflowId: `post_v106_${input.postId}_${workflowInfo().runId}`,
    args: [input],
  });

  setHandler(poke, async () => {
    await child.signal(poke);
  });

  let result: Awaited<ReturnType<typeof postWorkflowV106>>;
  let workflowError: ReturnType<typeof serializableFailure> | undefined;
  try {
    result = await child.result();
  } catch (error) {
    workflowError = serializableFailure(error);
  }

  await ensureClassifiedPublishingOutcomeV107(
    input.organizationId,
    input.postId,
    workflowError
  );
  return result;
}
