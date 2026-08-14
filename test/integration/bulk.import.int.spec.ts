import {
  api,
  closeDb,
  db,
  registerUser,
  seedIntegration,
  stackUp,
  TestUser,
} from './helpers';

const d = stackUp() ? describe : describe.skip;

d('durable bulk import', () => {
  let user: TestUser;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    user = await registerUser();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('commits asynchronously and a duplicate commit cannot create another post', async () => {
    const integration = await seedIntegration(user.orgId);
    const marker = `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const csv = [
      'date,content,integrations',
      `2099-01-01T10:00:00Z,${marker},${integration.id}`,
    ].join('\n');

    const created = await api(user, 'POST', '/bulk/import', {
      name: 'Durability test',
      csv,
    });
    expect(created.status).toBeLessThan(300);
    expect(created.body?.validRows).toBe(1);

    const firstCommit = await api(
      user,
      'POST',
      `/bulk/import/${created.body.id}/commit`
    );
    expect(firstCommit.status).toBeLessThan(300);
    expect(firstCommit.body?.started).toBe(true);

    const duplicateCommit = await api(
      user,
      'POST',
      `/bulk/import/${created.body.id}/commit`
    );
    expect(duplicateCommit.status).toBe(400);

    let state: any;
    // A cold Temporal worker can spend several seconds loading the workflow
    // bundle before the first activity runs. Give the durable async path a
    // full minute while still polling often enough to keep the test fast on a
    // warm worker.
    for (let attempt = 0; attempt < 120; attempt++) {
      state = (
        await api(user, 'GET', `/bulk/import/${created.body.id}`)
      ).body;
      if (
        state?.status === 'completed' ||
        state?.status === 'completed_with_errors'
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(state?.status).toBe('completed');
    expect(state?.processedRows).toBe(1);

    const posts = await db().post.findMany({
      where: {
        organizationId: user.orgId,
        integrationId: integration.id,
        content: marker,
      },
    });
    expect(posts).toHaveLength(1);
  });
});
