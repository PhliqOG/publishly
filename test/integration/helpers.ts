import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

// Integration tier talks to the RUNNING dev stack (backend :3000 + its
// database). Suites call stackUp() synchronously at module load so jest can
// register describe vs describe.skip before collection ends.
export function stackUp(): boolean {
  try {
    execSync(
      `curl -s -m 3 -o nul -w "%{http_code}" ${
        process.env.TEST_BACKEND_URL || 'http://localhost:3000'
      }/health`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    // curl exits non-zero on connection failure
    return false;
  }
}

export const BACKEND =
  process.env.TEST_BACKEND_URL || 'http://localhost:3000';

let prisma: PrismaClient | null = null;
export function db(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DATABASE_URL ||
            'postgresql://publishly-local:publishly-local-pwd@localhost:5433/publishly-db-local',
        },
      },
    });
  }
  return prisma;
}

export async function closeDb() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

export function randomEmail() {
  return `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.publishly.invalid`;
}

export type TestUser = {
  email: string;
  password: string;
  authHeader: Record<string, string>;
  orgId: string;
  userId: string;
};

async function extractAuth(res: Response): Promise<string> {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = /auth=([^;]+)/.exec(setCookie);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  const body = await res
    .clone()
    .json()
    .catch(() => ({} as any));
  return body?.jwt || '';
}

// Registers a fresh user+organization through the real API and returns an
// auth header usable for subsequent calls.
export async function registerUser(): Promise<TestUser> {
  const email = randomEmail();
  const password = 'Str0ngPassw0rd!';
  const res = await fetch(`${BACKEND}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      company: 'IT Org ' + Math.random().toString(36).slice(2, 6),
      provider: 'LOCAL',
      providerToken: '',
    }),
  });
  if (res.status >= 400) {
    throw new Error(
      `register failed ${res.status}: ${await res.text()}`
    );
  }
  const auth = await extractAuth(res);
  if (!auth) {
    throw new Error('register returned no auth cookie/jwt');
  }

  const user = await db().user.findFirst({
    where: { email },
    include: { organizations: true },
  });
  if (!user || !user.organizations.length) {
    throw new Error('registered user/org not found in DB');
  }

  return {
    email,
    password,
    authHeader: { auth },
    orgId: user.organizations[0].organizationId,
    userId: user.id,
  };
}

export async function api(
  user: TestUser | null,
  method: string,
  path: string,
  body?: any
) {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(user ? user.authHeader : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json: any = null;
  try {
    json = await res.clone().json();
  } catch {
    json = await res.text().catch(() => null);
  }
  return { status: res.status, body: json };
}

// Seeds a connected test-provider channel directly (the OAuth dance needs a
// browser); providerIdentifier 'testprovider' only publishes to the sink.
export async function seedIntegration(orgId: string) {
  return db().integration.create({
    data: {
      organizationId: orgId,
      internalId: 'it-' + Math.random().toString(36).slice(2, 10),
      name: 'IT Test Channel',
      providerIdentifier: 'testprovider',
      token: 'it-plain-token',
      type: 'social',
      profile: 'test.account',
    },
  });
}
