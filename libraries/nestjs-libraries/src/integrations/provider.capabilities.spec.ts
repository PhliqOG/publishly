import { providerCapabilities } from './provider.capabilities';

describe('provider capability registry', () => {
  it('defaults unknown and unsupported features to false', () => {
    const result = providerCapabilities({
      identifier: 'unknown',
      post: async () => [],
    } as any);
    expect(result.scheduledPublishing).toBe(true);
    expect(result.image).toBe(false);
    expect(result.analytics).toBe(false);
    expect(result.comments).toBe(false);
    expect(result.directMessages).toBe(false);
  });

  it('advertises only methods actually present for dynamic capabilities', () => {
    const result = providerCapabilities({
      identifier: 'instagram',
      post: async () => [],
      analytics: async () => [],
      listComments: async () => ({ comments: [] }),
      listDirectMessages: async () => ({ messages: [] }),
    } as any);
    expect(result.image).toBe(true);
    expect(result.story).toBe(true);
    expect(result.thumbnail).toBe(true);
    expect(result.analytics).toBe(true);
    expect(result.comments).toBe(true);
    expect(result.commentReplies).toBe(false);
    expect(result.directMessages).toBe(true);
    expect(result.directMessageReplies).toBe(false);
  });
});
