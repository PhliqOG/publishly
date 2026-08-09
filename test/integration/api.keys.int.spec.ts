import { PrismaService, PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { ApiKeysRepository } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.repository';
import { ApiKeysService } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { requiredScopeFor } from '@gitroom/backend/services/auth/public.auth.middleware';
import { stackUp, closeDb, db, randomEmail } from './helpers';

const d = stackUp() ? describe : describe.skip;

d('hashed scoped api keys', () => {
  let prisma: PrismaService;
  let service: ApiKeysService;
  let orgId: string;

  jest.setTimeout(60_000);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const repo = new ApiKeysRepository(
      new PrismaRepository(prisma) as PrismaRepository<'apiKey'>
    );
    service = new ApiKeysService(repo);
    const org = await db().organization.create({
      data: { name: 'apikey-it-' + randomEmail() },
    });
    orgId = org.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeDb();
  });

  it('stores only a hash, never the key', async () => {
    const created = await service.createKey(orgId, 'k1', ['posts:read']);
    expect(created.key).toMatch(/^pub_/);

    const row = await db().apiKey.findUnique({ where: { id: created.id } });
    expect(row!.hash).toHaveLength(64);
    expect(row!.hash).not.toEqual(created.key);
    expect(JSON.stringify(row)).not.toContain(created.key);
    expect(row!.prefix).toBe(created.key.slice(0, 12));
  });

  it('validates a presented key and returns scopes', async () => {
    const created = await service.createKey(orgId, 'k2', ['posts:write']);
    const validated = await service.validateKey(created.key);
    expect(validated).toBeTruthy();
    expect(validated!.organization.id).toBe(orgId);
    expect(validated!.scopes).toEqual(['posts:write']);
  });

  it('rejects unknown and revoked keys', async () => {
    expect(await service.validateKey('pub_does-not-exist')).toBeNull();

    const created = await service.createKey(orgId, 'k3', ['*']);
    await service.revoke(orgId, created.id);
    expect(await service.validateKey(created.key)).toBeNull();
  });

  it('another org cannot revoke the key', async () => {
    const other = await db().organization.create({
      data: { name: 'apikey-other-' + randomEmail() },
    });
    const created = await service.createKey(orgId, 'k4', ['*']);
    const res = await service.revoke(other.id, created.id);
    expect(res.count).toBe(0);
    expect(await service.validateKey(created.key)).toBeTruthy();
  });

  it('invalid scopes are dropped; empty falls back to wildcard', async () => {
    const created = await service.createKey(orgId, 'k5', ['nonsense' as any]);
    const validated = await service.validateKey(created.key);
    expect(validated!.scopes).toEqual(['*']);
  });

  it('scope map covers the public API surface', () => {
    expect(requiredScopeFor('POST', '/public/v1/posts')).toBe('posts:write');
    expect(requiredScopeFor('GET', '/public/v1/posts')).toBe('posts:read');
    expect(requiredScopeFor('POST', '/public/v1/upload')).toBe('media:write');
    expect(requiredScopeFor('GET', '/public/v1/integrations')).toBe(
      'integrations:read'
    );
    expect(requiredScopeFor('DELETE', '/public/v1/integrations/x')).toBe(
      'integrations:write'
    );
    // Unlisted routes demand the wildcard - deny-by-default for narrow keys
    expect(requiredScopeFor('POST', '/public/v1/new-feature')).toBe('*');
    expect(
      ApiKeysService.scopeAllows(['posts:read'], '*')
    ).toBe(false);
    expect(ApiKeysService.scopeAllows(['*'], 'anything')).toBe(true);
  });
});
