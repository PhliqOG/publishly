import { Integration } from '@prisma/client';
import crypto from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import {
  ProviderTransient,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  AnalyticsData,
  AuthTokenDetails,
  GenerateAuthUrlResponse,
  InboxComment,
  PendingCheckResponse,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';

// Internal test provider - registered ONLY when ENABLE_TEST_PROVIDER=true
// (integration.manager.ts). It completes the real connect + publish lifecycle
// without any external platform, so the full pipeline (OAuth callback flow,
// Temporal workflow, retries, pending finalization) can be exercised in dev,
// tests, and operator demos before any platform credentials exist.
//
// Knobs (env):
//   TEST_PROVIDER_MODE=pending      post() returns 'pending' so the workflow
//                                   must run checkPostStatus -> finalizePost
//   TEST_PROVIDER_FAIL_TIMES=n      first n post() attempts per post id throw a
//                                   safe pre-publish transient error
//   TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES=n
//                                   record a side effect, then fail ambiguously;
//                                   the workflow must never replay the publish
//   TEST_PROVIDER_SINK=<file path>  append one JSON line per side-effecting
//                                   call, so tests in other processes can
//                                   assert exactly-once behavior

type SinkEvent = {
  event: 'post' | 'comment' | 'finalize';
  ids: string[];
  attempt?: number;
  at: string;
};

const attemptCounters = new Map<string, number>();
export const testProviderCalls: SinkEvent[] = [];
export function resetTestProviderState() {
  testProviderCalls.splice(0, testProviderCalls.length);
  attemptCounters.clear();
}

// In-memory reply store backing the inbox capability (dev/test only).
const inboxReplies: Array<{
  id: string;
  integrationId: string;
  parentId: string;
  postId?: string;
  message: string;
  createdAt: string;
}> = [];

function record(event: SinkEvent) {
  testProviderCalls.push(event);
  const sink = process.env.TEST_PROVIDER_SINK;
  if (sink) {
    mkdirSync(dirname(sink), { recursive: true });
    appendFileSync(sink, JSON.stringify(event) + '\n');
  }
}

function deterministicId(seed: string) {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 12);
}

export class TestProviderProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'testprovider';
  name = 'Test Provider';
  toolTip = 'Internal sandbox channel - publishes nowhere, records everything';
  isBetweenSteps = false;
  scopes: string[] = [];
  editor = 'normal' as const;
  maxConcurrentJob = 5;

  maxLength() {
    return 5000;
  }

  async generateAuthUrl(): Promise<GenerateAuthUrlResponse> {
    const state = crypto.randomBytes(16).toString('hex');
    const code = 'testcode-' + crypto.randomBytes(8).toString('hex');
    return {
      // Points straight back at the standard frontend OAuth callback route, so
      // the normal connect flow completes with zero external hops.
      url: `${process.env.FRONTEND_URL}/integrations/social/testprovider?code=${code}&state=${state}`,
      codeVerifier: crypto.randomBytes(16).toString('hex'),
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails> {
    const id = 'test-' + deterministicId(params.code);
    return {
      id,
      name: 'Test Account',
      username: 'test.account',
      accessToken: 'test-access-' + crypto.randomBytes(12).toString('hex'),
      refreshToken: 'test-refresh-' + crypto.randomBytes(12).toString('hex'),
      expiresIn: 60 * 60 * 24 * 365,
      picture: '',
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      id: 'test-' + deterministicId(refreshToken),
      name: 'Test Account',
      username: 'test.account',
      accessToken: 'test-access-' + crypto.randomBytes(12).toString('hex'),
      refreshToken: 'test-refresh-' + crypto.randomBytes(12).toString('hex'),
      expiresIn: 60 * 60 * 24 * 365,
      picture: '',
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const key = postDetails[0]?.id || id;
    const attempt = (attemptCounters.get(key) || 0) + 1;
    attemptCounters.set(key, attempt);

    const failTimes = parseInt(process.env.TEST_PROVIDER_FAIL_TIMES || '0', 10);
    if (attempt <= failTimes) {
      throw new ProviderTransient(
        `Test provider simulated pre-publish transient failure (attempt ${attempt}/${failTimes})`
      );
    }

    const ambiguousFailTimes = parseInt(
      process.env.TEST_PROVIDER_AMBIGUOUS_FAIL_TIMES || '0',
      10
    );
    if (attempt <= failTimes + ambiguousFailTimes) {
      record({
        event: 'post',
        ids: postDetails.map((p) => p.id),
        attempt,
        at: new Date().toISOString(),
      });
      throw new Error(
        `Test provider simulated ambiguous failure after side effect (attempt ${attempt})`
      );
    }

    if (process.env.TEST_PROVIDER_MODE === 'pending') {
      return postDetails.map((p) => ({
        id: p.id,
        postId: '',
        releaseURL: '',
        status: 'pending',
        pendingData: { step: 'processing', internalId: p.id, attempt },
      }));
    }

    record({
      event: 'post',
      ids: postDetails.map((p) => p.id),
      attempt,
      at: new Date().toISOString(),
    });

    return postDetails.map((p) => ({
      id: p.id,
      postId: 'tp_' + p.id,
      releaseURL: 'https://testprovider.invalid/p/' + p.id,
      status: 'success',
    }));
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    record({
      event: 'comment',
      ids: postDetails.map((p) => p.id),
      at: new Date().toISOString(),
    });
    return postDetails.map((p) => ({
      id: p.id,
      postId: 'tpc_' + p.id,
      releaseURL: 'https://testprovider.invalid/p/' + postId + '#c-' + p.id,
      status: 'success',
    }));
  }

  public override async checkPostStatus(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    if (pendingData?.step === 'processing') {
      return {
        status: 'ready',
        pendingData: { ...pendingData, step: 'ready' },
      };
    }
    // Per the pending contract: once finalizePost's mutations went through,
    // this must report completed so a finalize retry can't duplicate.
    return {
      status: 'completed',
      postId: 'tp_' + pendingData.internalId,
      releaseURL: 'https://testprovider.invalid/p/' + pendingData.internalId,
    };
  }

  public override async finalizePost(
    accessToken: string,
    pendingData: any,
    integration: Integration
  ): Promise<PendingCheckResponse> {
    record({
      event: 'finalize',
      ids: [pendingData.internalId],
      at: new Date().toISOString(),
    });
    return {
      status: 'completed',
      postId: 'tp_' + pendingData.internalId,
      releaseURL: 'https://testprovider.invalid/p/' + pendingData.internalId,
    };
  }

  public override async confirmPost(
    accessToken: string,
    postId: string,
    releaseURL: string,
    integration: Integration
  ) {
    return {
      status: 'confirmed' as const,
      method: 'test_provider_read',
      providerPostId: postId,
      providerUrl: releaseURL,
      evidence: { testProvider: true },
    };
  }

  public override async reconcileAmbiguousPost(
    accessToken: string,
    input: { publishlyPostId: string; mutationFingerprint: string; mutationStartedAt: string },
    integration: Integration
  ) {
    const accepted = testProviderCalls.find(
      (event) => event.event === 'post' && event.ids.includes(input.publishlyPostId)
    );
    if (!accepted) {
      return {
        status: 'absent' as const,
        method: 'test_provider_side_effect_read',
        reason: 'The test provider side-effect ledger proves no matching post exists.',
        evidence: { testProvider: true, sideEffectCount: 0 },
      };
    }
    return {
      status: 'confirmed' as const,
      method: 'test_provider_side_effect_read',
      providerPostId: `tp_${input.publishlyPostId}`,
      providerUrl: `https://testprovider.invalid/p/${input.publishlyPostId}`,
      evidence: { testProvider: true, sideEffectCount: 1 },
    };
  }

  // Inbox capability: deterministic seeded comments per integration plus any
  // replies sent in this process - proves the unified-inbox pipe end to end
  // without any external platform.
  async listComments(
    accessToken: string,
    integration: Integration,
    params: { page?: number; postId?: string }
  ): Promise<{ comments: InboxComment[]; nextPage?: number }> {
    const seedBase = deterministicId('inbox-' + integration.id);
    const seeded: InboxComment[] = [1, 2, 3].map((n) => ({
      id: `tc_${seedBase}_${n}`,
      postId: params.postId || `tp_seeded_${n}`,
      releaseURL: `https://testprovider.invalid/p/seeded_${n}`,
      author: {
        name: [
          'Test Commenter One',
          'Test Commenter Two',
          'Test Commenter Three',
        ][n - 1],
        username: `test.commenter.${n}`,
        picture: '',
      },
      message: [
        'This is a seeded test comment - the inbox pipeline works.',
        'Second seeded comment with an emoji reaction level of enthusiasm!',
        'Third seeded comment asking a question: does replying work?',
      ][n - 1],
      createdAt: new Date(Date.now() - n * 3600_000).toISOString(),
      repliesCount: inboxReplies.filter(
        (r) => r.parentId === `tc_${seedBase}_${n}`
      ).length,
    }));

    const replies: InboxComment[] = inboxReplies
      .filter((r) => r.integrationId === integration.id)
      .map((r) => ({
        id: r.id,
        postId: r.postId,
        author: { name: 'Test Account (you)', username: 'test.account' },
        message: r.message,
        createdAt: r.createdAt,
      }));

    return { comments: [...seeded, ...replies] };
  }

  async replyToComment(
    accessToken: string,
    integration: Integration,
    commentId: string,
    message: string,
    postId?: string
  ): Promise<{ id: string; releaseURL?: string }> {
    const id =
      'tcr_' +
      deterministicId(
        integration.id + commentId + message + inboxReplies.length
      );
    inboxReplies.push({
      id,
      integrationId: integration.id,
      parentId: commentId,
      postId,
      message,
      createdAt: new Date().toISOString(),
    });
    return {
      id,
      releaseURL: 'https://testprovider.invalid/c/' + id,
    };
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const days = Math.min(date, 30);
    const series = (label: string, base: number): AnalyticsData => ({
      label,
      percentageChange: 5,
      data: Array.from({ length: days }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        return {
          total: String(base + i * 3),
          date: d.toISOString().split('T')[0],
        };
      }),
    });
    return [series('Test impressions', 100), series('Test followers', 40)];
  }
}
