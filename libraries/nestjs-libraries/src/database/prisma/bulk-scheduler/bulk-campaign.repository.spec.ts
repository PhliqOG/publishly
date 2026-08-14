import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BulkCampaignRepository } from './bulk-campaign.repository';

describe('BulkCampaignRepository', () => {
  let db: any;
  let tx: any;
  let repository: BulkCampaignRepository;

  beforeEach(() => {
    db = {
      model: {
        bulkCampaign: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
          findUnique: jest.fn(),
        },
        bulkCampaignIntent: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        bulkCampaignIssue: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
        },
        integration: { findMany: jest.fn() },
      },
    };
    tx = {
      bulkCampaign: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      bulkCampaignIntent: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      bulkCampaignIssue: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn(), upsert: jest.fn() },
    };
    repository = new BulkCampaignRepository(db, {
      model: { $transaction: jest.fn((operation) => operation(tx)) },
    } as any);
  });

  it('scopes campaign and current-intent reads to the same tenant', async () => {
    db.model.bulkCampaign.findFirst.mockResolvedValue({
      id: 'campaign-1',
      organizationId: 'org-1',
      currentRevision: 3,
    });
    db.model.bulkCampaignIntent.findFirst.mockResolvedValue({
      id: 'intent-3',
      revision: 3,
    });

    await expect(repository.get('org-1', 'campaign-1')).resolves.toMatchObject({
      id: 'campaign-1',
      intent: { id: 'intent-3' },
    });
    expect(db.model.bulkCampaign.findFirst).toHaveBeenCalledWith({
      where: { id: 'campaign-1', organizationId: 'org-1' },
    });
    expect(db.model.bulkCampaignIntent.findFirst).toHaveBeenCalledWith({
      where: {
        campaignId: 'campaign-1',
        organizationId: 'org-1',
        revision: 3,
      },
    });
  });

  it('uses bounded timestamp-plus-id cursor pagination inside the tenant', async () => {
    db.model.bulkCampaign.findMany.mockResolvedValue([
      { id: 'campaign-2', updatedAt: new Date('2026-08-12T20:00:00Z') },
      { id: 'campaign-1', updatedAt: new Date('2026-08-12T19:00:00Z') },
    ]);
    const cursor = {
      timestamp: new Date('2026-08-12T21:00:00Z'),
      id: 'campaign-3',
    };
    await expect(
      repository.list({
        organizationId: 'org-1',
        state: 'DRAFT',
        cursor,
        limit: 1,
      })
    ).resolves.toEqual({
      items: [{ id: 'campaign-2', updatedAt: new Date('2026-08-12T20:00:00Z') }],
      hasMore: true,
    });
    expect(db.model.bulkCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          state: 'DRAFT',
          OR: [
            { updatedAt: { lt: cursor.timestamp } },
            { updatedAt: cursor.timestamp, id: { lt: cursor.id } },
          ],
        }),
        take: 2,
      })
    );
  });

  it('atomically creates campaign, first immutable intent, and audit event', async () => {
    tx.bulkCampaign.findUnique.mockResolvedValue(null);
    tx.bulkCampaign.create.mockResolvedValue({
      id: 'campaign-1',
      organizationId: 'org-1',
      requestHash: 'request-hash',
    });
    const result = await repository.create({
      id: 'campaign-1',
      intentId: 'intent-1',
      organizationId: 'org-1',
      name: 'Launch batch',
      idempotencyKeyHash: 'key-hash',
      requestHash: 'request-hash',
      intent: { schemaVersion: 1 },
      intentHash: 'a'.repeat(64),
      actor: { userId: 'user-1' },
    });

    expect(result.created).toBe(true);
    expect(tx.bulkCampaign.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'campaign-1',
        organizationId: 'org-1',
        idempotencyKeyHash: 'key-hash',
      }),
    });
    expect(tx.bulkCampaignIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'intent-1',
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        revision: 1,
        intentHash: 'a'.repeat(64),
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        action: 'bulk.campaign.created',
        targetId: 'campaign-1',
      }),
    });
  });

  it('appends a revision only after an optimistic tenant-scoped claim', async () => {
    tx.bulkCampaign.findFirst.mockResolvedValue({
      id: 'campaign-1',
      organizationId: 'org-1',
      state: 'DRAFT',
      currentRevision: 1,
    });
    tx.bulkCampaignIntent.findFirst.mockResolvedValue({ intentHash: 'old-hash' });
    tx.bulkCampaign.updateMany.mockResolvedValue({ count: 1 });
    tx.bulkCampaign.findUniqueOrThrow.mockResolvedValue({
      id: 'campaign-1',
      currentRevision: 2,
    });

    await expect(
      repository.revise({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        expectedRevision: 1,
        intentId: 'intent-2',
        intent: { schemaVersion: 1, changed: true },
        intentHash: 'b'.repeat(64),
        actor: { userId: 'user-1' },
      })
    ).resolves.toMatchObject({ type: 'updated' });
    expect(tx.bulkCampaign.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'campaign-1',
        organizationId: 'org-1',
        currentRevision: 1,
      },
      data: { currentRevision: 2 },
    });
    expect(tx.bulkCampaignIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        revision: 2,
      }),
    });
  });

  it('records a classified issue and its counters/audit in one transaction', async () => {
    tx.bulkCampaign.findFirst.mockResolvedValue({ id: 'campaign-1' });
    tx.bulkCampaignIssue.create.mockResolvedValue({
      id: 'issue-1',
      code: 'invalid_media',
    });
    await expect(
      repository.recordIssue({
        id: 'issue-1',
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        eventKey: 'asset-1:validation',
        issueClass: 'quarantined',
        failureClass: 'data_problem',
        code: 'invalid_media',
        reason: 'The video codec is unsupported.',
        subjectType: 'asset',
        subjectId: 'asset-1',
        retryable: false,
        occurredAt: new Date('2026-08-12T20:00:00Z'),
        actor: { actorType: 'system' },
      })
    ).resolves.toMatchObject({ type: 'created' });
    expect(tx.bulkCampaign.findFirst).toHaveBeenCalledWith({
      where: { id: 'campaign-1', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(tx.bulkCampaignIssue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        issueClass: 'quarantined',
        failureClass: 'data_problem',
        code: 'invalid_media',
        reason: 'The video codec is unsupported.',
      }),
    });
    expect(tx.bulkCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { issueCount: { increment: 1 }, openIssueCount: { increment: 1 } },
    });
  });

  it('resolves without deleting the issue and decrements only the open counter', async () => {
    tx.bulkCampaignIssue.findFirst.mockResolvedValue({
      id: 'issue-1',
      state: 'open',
    });
    tx.bulkCampaignIssue.updateMany.mockResolvedValue({ count: 1 });
    tx.bulkCampaignIssue.findUniqueOrThrow.mockResolvedValue({
      id: 'issue-1',
      state: 'resolved',
    });
    await expect(
      repository.resolveIssue({
        organizationId: 'org-1',
        campaignId: 'campaign-1',
        issueId: 'issue-1',
        resolutionCode: 'media_replaced',
        actor: { userId: 'user-1' },
        now: new Date('2026-08-12T21:00:00Z'),
      })
    ).resolves.toMatchObject({ type: 'resolved' });
    expect(tx.bulkCampaignIssue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'issue-1',
          campaignId: 'campaign-1',
          organizationId: 'org-1',
          state: 'open',
        }),
        data: expect.objectContaining({ state: 'resolved' }),
      })
    );
    expect(tx.bulkCampaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: { openIssueCount: { decrement: 1 } },
    });
  });
});

describe('Bulk campaign ledger schema contract', () => {
  const root = process.cwd();
  const schema = readFileSync(
    path.join(root, 'libraries/nestjs-libraries/src/database/prisma/schema.prisma'),
    'utf8'
  );
  const migration = readFileSync(
    path.join(
      root,
      'libraries/nestjs-libraries/src/database/prisma/migrations/20260812230000_bulk_campaign_ledgers/migration.sql'
    ),
    'utf8'
  );

  it('uses composite campaign-plus-tenant foreign keys for both ledgers', () => {
    expect(schema).toContain('@@unique([id, organizationId])');
    expect(schema).toContain(
      '@relation(fields: [campaignId, organizationId], references: [id, organizationId], onDelete: Cascade)'
    );
    expect(migration.match(/FOREIGN KEY \("campaignId", "organizationId"\)/g)).toHaveLength(2);
  });

  it('enforces non-empty issues and coherent durable resolution in SQL', () => {
    expect(migration).toContain('"BulkCampaignIssue_code_nonempty"');
    expect(migration).toContain('"BulkCampaignIssue_reason_nonempty"');
    expect(migration).toContain('"BulkCampaignIssue_resolution_coherent"');
    expect(migration).toContain('jsonb_typeof("intent") = \'object\'');
  });
});
