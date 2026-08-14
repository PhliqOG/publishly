import { createHash } from 'crypto';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';

export const IDEMPOTENCY_KEY_MIN_LENGTH = 8;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export type PostCreationAllocation = Array<{
  destination: number;
  groupId: string;
  postIds: string[];
}>;

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((output, key) => {
        const child = (value as Record<string, unknown>)[key];
        if (child !== undefined) output[key] = canonicalValue(child);
        return output;
      }, {});
  }
  return null;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function validateIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= IDEMPOTENCY_KEY_MIN_LENGTH &&
    value.length <= IDEMPOTENCY_KEY_MAX_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

export function postCreationRequestHash(
  body: CreatePostDto,
  creationMethod: string
) {
  return sha256(canonicalJson({ creationMethod, body }));
}

function deterministicId(
  prefix: 'idem_post' | 'idem_group',
  organizationId: string,
  keyHash: string,
  destination: number,
  entry?: number
) {
  const suffix = sha256(
    [organizationId, keyHash, destination, entry ?? 'group'].join(':')
  ).slice(0, 32);
  return `${prefix}_${suffix}`;
}

/**
 * Allocates every database identity before the first write. Existing value IDs
 * are retained for edit/republish requests, while the target group is always
 * stable for this creation intent. `__publishlyTargetGroup` is server-owned and
 * consumed only by PostsRepository; it is never persisted in provider settings.
 */
export function allocatePostCreation(
  organizationId: string,
  keyHash: string,
  body: CreatePostDto
): { body: CreatePostDto; allocation: PostCreationAllocation } {
  const cloned = JSON.parse(JSON.stringify(body)) as CreatePostDto;
  const allocation = cloned.posts.map((destination, destinationIndex) => {
    const groupId = deterministicId(
      'idem_group',
      organizationId,
      keyHash,
      destinationIndex
    );
    (destination as any).__publishlyTargetGroup = groupId;
    const postIds = destination.value.map((entry, entryIndex) => {
      const id =
        entry.id ||
        deterministicId(
          'idem_post',
          organizationId,
          keyHash,
          destinationIndex,
          entryIndex
        );
      entry.id = id;
      return id;
    });
    return { destination: destinationIndex, groupId, postIds };
  });
  return { body: cloned, allocation };
}
