import { Injectable } from '@nestjs/common';
import {
  BulkCampaignIssueClass,
  BulkCampaignIssueState,
  BulkCampaignState,
  BulkCampaignSubjectType,
  PostFailureClass,
  Prisma,
} from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';

export type BulkCampaignAuditActor = {
  userId?: string;
  actorType?: 'user' | 'apikey' | 'system';
};

export type BulkCampaignPageCursor = { timestamp: Date; id: string } | null;

function auditId(action: string, ...parts: string[]) {
  return `bulk_audit_${sha256([action, ...parts].join(':')).slice(0, 40)}`;
}

function auditData(input: {
  id: string;
  organizationId: string;
  actor: BulkCampaignAuditActor;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}) {
  return {
    id: input.id,
    organizationId: input.organizationId,
    userId: input.actor.userId,
    actorType: input.actor.actorType || 'user',
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: JSON.stringify(input.metadata),
  };
}

@Injectable()
export class BulkCampaignRepository {
  constructor(
    private _db: PrismaRepository<
      | 'bulkCampaign'
      | 'bulkCampaignIntent'
      | 'bulkCampaignIssue'
      | 'integration'
      | 'auditLog'
    >,
    private _transaction: PrismaTransaction
  ) {}

  findByKey(organizationId: string, idempotencyKeyHash: string) {
    return this._db.model.bulkCampaign.findUnique({
      where: {
        organizationId_idempotencyKeyHash: {
          organizationId,
          idempotencyKeyHash,
        },
      },
    });
  }

  async get(organizationId: string, campaignId: string) {
    const campaign = await this._db.model.bulkCampaign.findFirst({
      where: { id: campaignId, organizationId },
    });
    if (!campaign) return null;
    const intent = await this._db.model.bulkCampaignIntent.findFirst({
      where: {
        campaignId: campaign.id,
        organizationId,
        revision: campaign.currentRevision,
      },
    });
    if (!intent) {
      throw new Error(
        `Campaign ${campaign.id} is missing intent revision ${campaign.currentRevision}.`
      );
    }
    return { ...campaign, intent };
  }

  async list(input: {
    organizationId: string;
    state?: BulkCampaignState;
    cursor: BulkCampaignPageCursor;
    limit: number;
  }) {
    const rows = await this._db.model.bulkCampaign.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor
          ? {
              OR: [
                { updatedAt: { lt: input.cursor.timestamp } },
                {
                  updatedAt: input.cursor.timestamp,
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async listIntents(input: {
    organizationId: string;
    campaignId: string;
    cursor: BulkCampaignPageCursor;
    limit: number;
  }) {
    const campaign = await this._db.model.bulkCampaign.findFirst({
      where: { id: input.campaignId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!campaign) return null;
    const rows = await this._db.model.bulkCampaignIntent.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: input.cursor.timestamp } },
                {
                  createdAt: input.cursor.timestamp,
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  async listIssues(input: {
    organizationId: string;
    campaignId: string;
    state?: BulkCampaignIssueState;
    cursor: BulkCampaignPageCursor;
    limit: number;
  }) {
    const campaign = await this._db.model.bulkCampaign.findFirst({
      where: { id: input.campaignId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!campaign) return null;
    const rows = await this._db.model.bulkCampaignIssue.findMany({
      where: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        ...(input.state ? { state: input.state } : {}),
        ...(input.cursor
          ? {
              OR: [
                { occurredAt: { lt: input.cursor.timestamp } },
                {
                  occurredAt: input.cursor.timestamp,
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    return {
      items: rows.slice(0, input.limit),
      hasMore: rows.length > input.limit,
    };
  }

  findConnections(organizationId: string, integrationIds: string[]) {
    return this._db.model.integration.findMany({
      where: {
        organizationId,
        id: { in: integrationIds },
        deletedAt: null,
        type: 'social',
      },
      select: {
        id: true,
        organizationId: true,
        providerIdentifier: true,
        disabled: true,
        token: true,
        deletedAt: true,
      },
    });
  }

  async create(input: {
    id: string;
    intentId: string;
    organizationId: string;
    name: string;
    idempotencyKeyHash: string;
    requestHash: string;
    intent: Prisma.InputJsonValue;
    intentHash: string;
    actor: BulkCampaignAuditActor;
  }) {
    try {
      return await this._transaction.model.$transaction(async (tx) => {
        const existing = await tx.bulkCampaign.findUnique({
          where: {
            organizationId_idempotencyKeyHash: {
              organizationId: input.organizationId,
              idempotencyKeyHash: input.idempotencyKeyHash,
            },
          },
        });
        if (existing) return { created: false as const, campaign: existing };

        const campaign = await tx.bulkCampaign.create({
          data: {
            id: input.id,
            organizationId: input.organizationId,
            name: input.name,
            idempotencyKeyHash: input.idempotencyKeyHash,
            requestHash: input.requestHash,
          },
        });
        await tx.bulkCampaignIntent.create({
          data: {
            id: input.intentId,
            organizationId: input.organizationId,
            campaignId: campaign.id,
            revision: 1,
            schemaVersion: 1,
            intent: input.intent,
            intentHash: input.intentHash,
            createdByUserId: input.actor.userId,
          },
        });
        await tx.auditLog.create({
          data: auditData({
            id: auditId('bulk.campaign.created', campaign.id),
            organizationId: input.organizationId,
            actor: input.actor,
            action: 'bulk.campaign.created',
            targetType: 'bulkCampaign',
            targetId: campaign.id,
            metadata: { revision: 1, intentHash: input.intentHash },
          }),
        });
        return { created: true as const, campaign };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const campaign = await this.findByKey(
        input.organizationId,
        input.idempotencyKeyHash
      );
      if (!campaign) throw error;
      return { created: false as const, campaign };
    }
  }

  revise(input: {
    organizationId: string;
    campaignId: string;
    expectedRevision: number;
    intentId: string;
    intent: Prisma.InputJsonValue;
    intentHash: string;
    actor: BulkCampaignAuditActor;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const current = await tx.bulkCampaign.findFirst({
        where: { id: input.campaignId, organizationId: input.organizationId },
      });
      if (!current) return { type: 'not_found' as const };

      const currentIntent = await tx.bulkCampaignIntent.findFirst({
        where: {
          campaignId: current.id,
          organizationId: input.organizationId,
          revision: current.currentRevision,
        },
      });
      if (!currentIntent) {
        throw new Error(
          `Campaign ${current.id} is missing intent revision ${current.currentRevision}.`
        );
      }
      if (current.currentRevision !== input.expectedRevision) {
        if (currentIntent.intentHash === input.intentHash) {
          return { type: 'replay' as const, campaign: current };
        }
        return {
          type: 'revision_conflict' as const,
          currentRevision: current.currentRevision,
        };
      }
      if (['CANCELLED', 'COMPLETED', 'FAILED'].includes(current.state)) {
        return { type: 'terminal' as const, state: current.state };
      }

      const nextRevision = current.currentRevision + 1;
      const claimed = await tx.bulkCampaign.updateMany({
        where: {
          id: current.id,
          organizationId: input.organizationId,
          currentRevision: input.expectedRevision,
        },
        data: { currentRevision: nextRevision },
      });
      if (claimed.count !== 1) {
        return { type: 'revision_race' as const };
      }
      await tx.bulkCampaignIntent.create({
        data: {
          id: input.intentId,
          organizationId: input.organizationId,
          campaignId: current.id,
          revision: nextRevision,
          schemaVersion: 1,
          intent: input.intent,
          intentHash: input.intentHash,
          createdByUserId: input.actor.userId,
        },
      });
      await tx.auditLog.upsert({
        where: {
          id: auditId('bulk.campaign.intent-revised', current.id, String(nextRevision)),
        },
        create: auditData({
          id: auditId('bulk.campaign.intent-revised', current.id, String(nextRevision)),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'bulk.campaign.intent-revised',
          targetType: 'bulkCampaign',
          targetId: current.id,
          metadata: {
            previousRevision: current.currentRevision,
            revision: nextRevision,
            intentHash: input.intentHash,
          },
        }),
        update: {},
      });
      const campaign = await tx.bulkCampaign.findUniqueOrThrow({
        where: { id: current.id },
      });
      return { type: 'updated' as const, campaign };
    });
  }

  transition(input: {
    organizationId: string;
    campaignId: string;
    from: BulkCampaignState;
    to: BulkCampaignState;
    actor: BulkCampaignAuditActor;
    now: Date;
    operationId?: string;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const changed = await tx.bulkCampaign.updateMany({
        where: {
          id: input.campaignId,
          organizationId: input.organizationId,
          state: input.from,
        },
        data: {
          state: input.to,
          ...(input.to === 'PAUSED'
            ? { pausedAt: input.now, pausedFromState: input.from }
            : {}),
          ...(input.from === 'PAUSED' && input.to !== 'PAUSED'
            ? { pausedAt: null, pausedFromState: null }
            : {}),
          ...(input.to === 'CANCELLED' ? { cancelledAt: input.now } : {}),
          ...(input.to === 'COMPLETED' ? { completedAt: input.now } : {}),
        },
      });
      if (changed.count !== 1) return null;
      await tx.auditLog.upsert({
        where: {
          id:
            input.operationId ||
            auditId(
              'bulk.campaign.state-changed',
              input.campaignId,
              input.from,
              input.to
            ),
        },
        create: auditData({
          id:
            input.operationId ||
            auditId(
              'bulk.campaign.state-changed',
              input.campaignId,
              input.from,
              input.to
            ),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'bulk.campaign.state-changed',
          targetType: 'bulkCampaign',
          targetId: input.campaignId,
          metadata: { from: input.from, to: input.to },
        }),
        update: {},
      });
      return tx.bulkCampaign.findUniqueOrThrow({
        where: { id: input.campaignId },
      });
    });
  }

  getActionReplay(
    organizationId: string,
    campaignId: string,
    operationId: string
  ) {
    return this._db.model.auditLog.findFirst({
      where: {
        id: operationId,
        organizationId,
        targetType: 'bulkCampaign',
        targetId: campaignId,
      },
      select: { id: true, action: true, metadata: true },
    });
  }

  recordActionNoop(input: {
    organizationId: string;
    campaignId: string;
    operationId: string;
    action: 'pause' | 'cancel';
    state: BulkCampaignState;
    actor: BulkCampaignAuditActor;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const campaign = await tx.bulkCampaign.findFirst({
        where: {
          id: input.campaignId,
          organizationId: input.organizationId,
          state: input.state,
        },
        select: { id: true },
      });
      if (!campaign) return false;
      await tx.auditLog.upsert({
        where: { id: input.operationId },
        create: auditData({
          id: input.operationId,
          organizationId: input.organizationId,
          actor: input.actor,
          action: `bulk.campaign.${input.action}-noop`,
          targetType: 'bulkCampaign',
          targetId: input.campaignId,
          metadata: { state: input.state, noOp: true },
        }),
        update: {},
      });
      return true;
    });
  }

  async recordIssue(input: {
    id: string;
    organizationId: string;
    campaignId: string;
    eventKey: string;
    issueClass: BulkCampaignIssueClass;
    failureClass: PostFailureClass;
    code: string;
    reason: string;
    subjectType?: BulkCampaignSubjectType;
    subjectId?: string;
    retryable: boolean;
    details?: Prisma.InputJsonValue;
    occurredAt: Date;
    actor: BulkCampaignAuditActor;
  }) {
    try {
      return await this._transaction.model.$transaction(async (tx) => {
        const campaign = await tx.bulkCampaign.findFirst({
          where: { id: input.campaignId, organizationId: input.organizationId },
          select: { id: true },
        });
        if (!campaign) return { type: 'not_found' as const };
        const issue = await tx.bulkCampaignIssue.create({
          data: {
            id: input.id,
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            eventKey: input.eventKey,
            issueClass: input.issueClass,
            failureClass: input.failureClass,
            code: input.code,
            reason: input.reason,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            retryable: input.retryable,
            details: input.details,
            occurredAt: input.occurredAt,
          },
        });
        await tx.bulkCampaign.update({
          where: { id: campaign.id },
          data: { issueCount: { increment: 1 }, openIssueCount: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: auditData({
            id: auditId('bulk.campaign.issue-recorded', issue.id),
            organizationId: input.organizationId,
            actor: input.actor,
            action: 'bulk.campaign.issue-recorded',
            targetType: 'bulkCampaignIssue',
            targetId: issue.id,
            metadata: {
              campaignId: input.campaignId,
              issueClass: input.issueClass,
              failureClass: input.failureClass,
              code: input.code,
              subjectType: input.subjectType,
              subjectId: input.subjectId,
            },
          }),
        });
        return { type: 'created' as const, issue };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const issue = await this._db.model.bulkCampaignIssue.findUnique({
        where: {
          organizationId_campaignId_eventKey: {
            organizationId: input.organizationId,
            campaignId: input.campaignId,
            eventKey: input.eventKey,
          },
        },
      });
      if (!issue) throw error;
      return { type: 'replay' as const, issue };
    }
  }

  resolveIssue(input: {
    organizationId: string;
    campaignId: string;
    issueId: string;
    resolutionCode: string;
    resolutionNote?: string;
    actor: BulkCampaignAuditActor;
    now: Date;
  }) {
    return this._transaction.model.$transaction(async (tx) => {
      const issue = await tx.bulkCampaignIssue.findFirst({
        where: {
          id: input.issueId,
          campaignId: input.campaignId,
          organizationId: input.organizationId,
        },
      });
      if (!issue) return { type: 'not_found' as const };
      if (issue.state === 'resolved') return { type: 'replay' as const, issue };
      const changed = await tx.bulkCampaignIssue.updateMany({
        where: {
          id: issue.id,
          campaignId: input.campaignId,
          organizationId: input.organizationId,
          state: 'open',
        },
        data: {
          state: 'resolved',
          resolvedAt: input.now,
          resolutionCode: input.resolutionCode,
          resolutionNote: input.resolutionNote,
        },
      });
      if (changed.count !== 1) return { type: 'race' as const };
      await tx.bulkCampaign.update({
        where: { id: input.campaignId },
        data: { openIssueCount: { decrement: 1 } },
      });
      await tx.auditLog.upsert({
        where: { id: auditId('bulk.campaign.issue-resolved', issue.id) },
        create: auditData({
          id: auditId('bulk.campaign.issue-resolved', issue.id),
          organizationId: input.organizationId,
          actor: input.actor,
          action: 'bulk.campaign.issue-resolved',
          targetType: 'bulkCampaignIssue',
          targetId: issue.id,
          metadata: {
            campaignId: input.campaignId,
            resolutionCode: input.resolutionCode,
          },
        }),
        update: {},
      });
      const resolved = await tx.bulkCampaignIssue.findUniqueOrThrow({
        where: { id: issue.id },
      });
      return { type: 'resolved' as const, issue: resolved };
    });
  }
}
