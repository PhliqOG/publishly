import { randomBytes } from 'crypto';

const OAUTH_STATE_BYTES = 32;
const OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type StoredOAuthLoginState = {
  version: 1;
  provider: string;
  codeVerifier: string;
};

type AtomicStateStore = {
  getdel(key: string): Promise<string | null>;
};

export function generateOAuthState(): string {
  return randomBytes(OAUTH_STATE_BYTES).toString('base64url');
}

export function serializeOAuthLoginState(
  provider: string,
  codeVerifier: string
): string {
  if (!provider || !codeVerifier) {
    throw new Error('OAuth provider and verifier are required.');
  }
  return JSON.stringify({
    version: 1,
    provider,
    codeVerifier,
  } satisfies StoredOAuthLoginState);
}

export function parseOAuthLoginState(
  value: string,
  expectedProvider: string
): StoredOAuthLoginState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid OAuth state.');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as Partial<StoredOAuthLoginState>).version !== 1 ||
    (parsed as Partial<StoredOAuthLoginState>).provider !== expectedProvider ||
    typeof (parsed as Partial<StoredOAuthLoginState>).codeVerifier !==
      'string' ||
    !(parsed as Partial<StoredOAuthLoginState>).codeVerifier
  ) {
    throw new Error('Invalid OAuth state.');
  }
  return parsed as StoredOAuthLoginState;
}

export async function consumeOAuthLoginState(
  store: AtomicStateStore,
  state: string,
  expectedProvider: string
): Promise<StoredOAuthLoginState> {
  if (!OAUTH_STATE_PATTERN.test(state)) {
    throw new Error('Invalid OAuth state.');
  }
  const stored = await store.getdel(`login:${state}`);
  if (!stored) {
    throw new Error('Invalid OAuth state.');
  }
  return parseOAuthLoginState(stored, expectedProvider);
}
