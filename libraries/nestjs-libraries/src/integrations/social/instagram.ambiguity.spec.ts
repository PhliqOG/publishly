import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';

describe('Instagram ambiguous mutation recovery', () => {
  it('proves V109 container creation cannot have produced a live post', async () => {
    const provider = new InstagramProvider();
    await expect(
      provider.reconcileAmbiguousPost(
        'unused-token',
        {
          publishlyPostId: 'post-1',
          mutationFingerprint: 'a'.repeat(64),
          mutationStartedAt: '2026-08-13T00:00:00.000Z',
        },
        {} as any
      )
    ).resolves.toEqual({
      status: 'absent',
      method: 'instagram_unpublished_container_boundary',
      reason: expect.stringMatching(/unpublished container/i),
      evidence: {
        mutationBoundary: 'container_create',
        livePublicationPossible: false,
      },
    });
  });
});
