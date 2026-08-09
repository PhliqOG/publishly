import {
  api,
  closeDb,
  registerUser,
  seedIntegration,
  stackUp,
  TestUser,
} from './helpers';

// Cross-tenant IDOR matrix: user B must never read or mutate resources that
// belong to organization A. Runs against the live backend; suites skip when
// the stack is down (jest prints them as skipped, not passed).
const d = stackUp() ? describe : describe.skip;

d('tenant isolation (IDOR)', () => {
  let userA: TestUser;
  let userB: TestUser;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    userA = await registerUser();
    userB = await registerUser();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('registered two distinct organizations', () => {
    expect(userA.orgId).toBeTruthy();
    expect(userB.orgId).toBeTruthy();
    expect(userA.orgId).not.toEqual(userB.orgId);
  });

  it('webhooks: B cannot delete the webhook of A', async () => {
    const created = await api(userA, 'POST', '/webhooks', {
      name: 'A hook',
      url: 'https://example.com/a',
      integrations: [],
    });
    expect(created.status).toBeLessThan(300);
    const webhookId = created.body?.id;
    expect(webhookId).toBeTruthy();

    const listB = await api(userB, 'GET', '/webhooks');
    const idsB = JSON.stringify(listB.body || '');
    expect(idsB).not.toContain(webhookId);

    await api(userB, 'DELETE', `/webhooks/${webhookId}`);
    // Whatever status the delete returned, the resource must survive
    const stillThere = await api(userA, 'GET', '/webhooks');
    expect(JSON.stringify(stillThere.body)).toContain(webhookId);
  });

  it('integrations: B cannot see or disable the channel of A', async () => {
    const integration = await seedIntegration(userA.orgId);

    const listB = await api(userB, 'GET', '/integrations/list');
    expect(JSON.stringify(listB.body || '')).not.toContain(integration.id);

    await api(userB, 'POST', '/integrations/disable', { id: integration.id });
    const listA = await api(userA, 'GET', '/integrations/list');
    const rowA = (listA.body?.integrations || []).find(
      (i: any) => i.id === integration.id
    );
    expect(rowA).toBeTruthy();
    expect(rowA.disabled ?? false).toBe(false);
  });

  it('api-keys: B cannot revoke the key of A and never sees it', async () => {
    const created = await api(userA, 'POST', '/api-keys', {
      name: 'A key',
      scopes: ['posts:read'],
    });
    expect(created.status).toBeLessThan(300);
    const keyId = created.body?.id;
    expect(keyId).toBeTruthy();
    expect(created.body?.key).toMatch(/^pub_/);

    const listB = await api(userB, 'GET', '/api-keys');
    expect(JSON.stringify(listB.body || '')).not.toContain(keyId);

    const revoke = await api(userB, 'DELETE', `/api-keys/${keyId}`);
    expect(revoke.body?.revoked ?? false).toBe(false);

    const listA = await api(userA, 'GET', '/api-keys');
    const rowA = (listA.body || []).find((k: any) => k.id === keyId);
    expect(rowA).toBeTruthy();
    expect(rowA.revokedAt).toBeNull();
  });

  it('audit logs: B sees only their own organization entries', async () => {
    const logsB = await api(userB, 'GET', '/audit-logs');
    const all = JSON.stringify(logsB.body || '');
    expect(all).not.toContain(userA.orgId);
  });

  it('bulk imports: B cannot read the import of A', async () => {
    const csv = 'date,content,integrations\n2099-01-01T10:00:00Z,hello,none';
    const created = await api(userA, 'POST', '/bulk/import', {
      name: 'A import',
      csv,
    });
    expect(created.status).toBeLessThan(300);
    const importId = created.body?.id;
    expect(importId).toBeTruthy();

    const readB = await api(userB, 'GET', `/bulk/import/${importId}`);
    expect(readB.status).toBe(404);

    const readA = await api(userA, 'GET', `/bulk/import/${importId}`);
    expect(readA.status).toBe(200);
  });

  it('public API: an api key only reaches its own org data', async () => {
    const createdKey = await api(userA, 'POST', '/api-keys', {
      name: 'A public key',
      scopes: ['*'],
    });
    const key = createdKey.body?.key;
    expect(key).toBeTruthy();

    const integrationB = await seedIntegration(userB.orgId);

    const res = await fetch(
      `${process.env.TEST_BACKEND_URL || 'http://localhost:3000'}/public/v1/integrations`,
      { headers: { Authorization: key } }
    );
    const body = await res.text();
    expect(res.status).toBeLessThan(300);
    expect(body).not.toContain(integrationB.id);
  });
});
