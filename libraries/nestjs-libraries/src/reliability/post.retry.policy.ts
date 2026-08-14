export const PUBLISH_RETRY_BASE_SECONDS = 15;
export const PUBLISH_RETRY_CAP_SECONDS = 30 * 60;
export const PUBLISH_PRIORITY_RETRY_BASE_SECONDS = 5;
export const PUBLISH_PRIORITY_RETRY_CAP_SECONDS = 5 * 60;
export const PUBLISH_RATE_LIMIT_CAP_SECONDS = 24 * 60 * 60;
export const PUBLISH_MAX_MUTATION_ATTEMPTS = 5;

export type RetryMetadata = {
  retryAfterSeconds?: number;
  retryAt?: string;
};

function finitePositive(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0
    ? number
    : undefined;
}

export function parseRetryHeaders(
  headers:
    | { get(name: string): string | null }
    | Record<string, string | string[] | number | undefined>
    | undefined,
  nowMs = Date.now()
): RetryMetadata {
  const read = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof (headers as { get?: unknown }).get === 'function') {
      return (
        (headers as { get(name: string): string | null }).get(name) || undefined
      );
    }
    const record = headers as Record<
      string,
      string | string[] | number | undefined
    >;
    const found = Object.entries(record).find(
      ([key]) => key.toLowerCase() === name.toLowerCase()
    )?.[1];
    return Array.isArray(found) ? found[0] : found?.toString();
  };

  const retryAfter = read('retry-after');
  if (retryAfter) {
    const seconds = finitePositive(retryAfter);
    if (seconds) return { retryAfterSeconds: Math.ceil(seconds) };
    const timestamp = Date.parse(retryAfter);
    if (Number.isFinite(timestamp) && timestamp > nowMs) {
      return { retryAt: new Date(timestamp).toISOString() };
    }
  }

  for (const header of [
    'x-rate-limit-reset',
    'x-ratelimit-reset',
    'ratelimit-reset',
  ]) {
    const raw = finitePositive(read(header));
    if (!raw) continue;
    const timestamp = raw > 10_000_000_000 ? raw : raw * 1000;
    if (timestamp > nowMs)
      return { retryAt: new Date(timestamp).toISOString() };
  }
  return {};
}

function seedHash(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function computePublishingRetry(input: {
  postId: string;
  retryOrdinal: number;
  nowMs?: number;
  metadata?: RetryMetadata;
  priority?: boolean;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const retryOrdinal = Math.max(0, Math.floor(input.retryOrdinal));
  const baseSeconds = input.priority
    ? PUBLISH_PRIORITY_RETRY_BASE_SECONDS
    : PUBLISH_RETRY_BASE_SECONDS;
  const capSeconds = input.priority
    ? PUBLISH_PRIORITY_RETRY_CAP_SECONDS
    : PUBLISH_RETRY_CAP_SECONDS;
  const exponentialCeiling = Math.min(
    capSeconds,
    baseSeconds * 2 ** retryOrdinal
  );
  const jitterSeconds =
    1 + (seedHash(`${input.postId}:${retryOrdinal}`) % exponentialCeiling);

  const explicitSeconds = finitePositive(input.metadata?.retryAfterSeconds);
  const retryAtMs = input.metadata?.retryAt
    ? Date.parse(input.metadata.retryAt)
    : NaN;
  const resetSeconds = Number.isFinite(retryAtMs)
    ? Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000))
    : 0;
  const providerLowerBound = Math.min(
    PUBLISH_RATE_LIMIT_CAP_SECONDS,
    Math.max(explicitSeconds ? Math.ceil(explicitSeconds) : 0, resetSeconds)
  );
  const delaySeconds = Math.max(jitterSeconds, providerLowerBound);

  return {
    delaySeconds,
    nextAttemptAt: new Date(nowMs + delaySeconds * 1000),
    jitterSeconds,
    providerLowerBound,
    priority: !!input.priority,
  };
}

export function extractRetryMetadata(value: unknown): RetryMetadata {
  const seen = new Set<object>();
  const visit = (candidate: unknown, depth = 0): RetryMetadata => {
    if (!candidate || typeof candidate !== 'object' || depth > 7) return {};
    if (seen.has(candidate)) return {};
    seen.add(candidate);
    const record = candidate as Record<string, unknown>;
    const retryAfterSeconds = finitePositive(record.retryAfterSeconds);
    const retryAt =
      typeof record.retryAt === 'string' &&
      Number.isFinite(Date.parse(record.retryAt))
        ? record.retryAt
        : undefined;
    if (retryAfterSeconds || retryAt) {
      return { retryAfterSeconds, retryAt };
    }
    for (const key of [
      'failure',
      'cause',
      'details',
      'originalError',
      'error',
    ]) {
      const nested = record[key];
      const list = Array.isArray(nested) ? nested : [nested];
      for (const item of list) {
        const found = visit(item, depth + 1);
        if (found.retryAfterSeconds || found.retryAt) return found;
      }
    }
    return {};
  };
  return visit(value);
}
