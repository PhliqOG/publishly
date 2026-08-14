import {
  allocatePostCreation,
  canonicalJson,
  postCreationRequestHash,
  sha256,
  validateIdempotencyKey,
} from './post.creation.idempotency';

const body = {
  type: 'schedule',
  date: '2026-08-10T12:00:00.000Z',
  shortLink: false,
  tags: [],
  posts: [
    {
      integration: { id: 'connection-1' },
      settings: { __type: 'x', z: 2, a: 1 },
      value: [
        { content: 'hello', image: [] },
        { id: 'existing-comment', content: 'reply', image: [] },
      ],
    },
  ],
} as any;

describe('post creation idempotency primitives', () => {
  it('canonicalizes object keys without changing array order', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] })).toBe(
      '{"a":{"x":3,"y":2},"list":[2,1],"z":1}'
    );
    expect(postCreationRequestHash(body, 'API')).toBe(
      postCreationRequestHash(
        { ...body, posts: [{ ...body.posts[0], settings: { a: 1, z: 2, __type: 'x' } }] },
        'API'
      )
    );
  });

  it('allocates stable tenant/key-scoped post and group IDs', () => {
    const first = allocatePostCreation('org-1', sha256('request-key'), body);
    const replay = allocatePostCreation('org-1', sha256('request-key'), body);
    const other = allocatePostCreation('org-2', sha256('request-key'), body);

    expect(first).toEqual(replay);
    expect(first.allocation[0].groupId).toMatch(/^idem_group_/);
    expect(first.allocation[0].postIds[0]).toMatch(/^idem_post_/);
    expect(first.allocation[0].postIds[1]).toBe('existing-comment');
    expect((first.body.posts[0] as any).__publishlyTargetGroup).toBe(
      first.allocation[0].groupId
    );
    expect(other.allocation[0].postIds[0]).not.toBe(
      first.allocation[0].postIds[0]
    );
  });

  it.each([
    ['campaign:location-42', true],
    ['short', false],
    ['contains spaces', false],
    ['x'.repeat(201), false],
    [undefined, false],
  ])('validates idempotency key %p', (key, valid) => {
    expect(validateIdempotencyKey(key)).toBe(valid);
  });
});
