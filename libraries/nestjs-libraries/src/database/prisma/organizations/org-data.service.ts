import { Injectable } from '@nestjs/common';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { cancelCalendarReservationsInTransaction } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/calendar-reservation.mutation';

// Workspace data portability + deletion.
//
// exportData: everything a workspace owner is entitled to take with them,
// WITHOUT secrets - integration rows exclude tokens by construction.
//
// requestDeletion: destroys secret material immediately (tokens nulled, API
// keys revoked), soft-deletes content, disables memberships, and renames the
// org. Row purging after the retention window is an operator policy decision
// documented in docs/OPERATIONS.md - what matters is that credentials die now.
@Injectable()
export class OrgDataService {
  constructor(private _prisma: PrismaService) {}

  async exportData(organizationId: string) {
    const CAP = 5000;
    const [
      organization,
      members,
      integrations,
      posts,
      media,
      webhooks,
      sets,
      signatures,
      auditLogs,
    ] = await Promise.all([
      this._prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, createdAt: true },
      }),
      this._prisma.userOrganization.findMany({
        where: { organizationId },
        select: {
          role: true,
          disabled: true,
          createdAt: true,
          user: { select: { email: true, name: true } },
        },
      }),
      this._prisma.integration.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          providerIdentifier: true,
          internalId: true,
          profile: true,
          disabled: true,
          createdAt: true,
          deletedAt: true,
        },
      }),
      this._prisma.post.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: CAP,
        select: {
          id: true,
          state: true,
          publishDate: true,
          content: true,
          group: true,
          releaseURL: true,
          integrationId: true,
          createdAt: true,
        },
      }),
      this._prisma.media.findMany({
        where: { organizationId },
        take: CAP,
        select: {
          id: true,
          name: true,
          path: true,
          type: true,
          createdAt: true,
        },
      }),
      this._prisma.webhooks.findMany({
        where: { organizationId },
        select: { id: true, name: true, url: true, createdAt: true },
      }),
      this._prisma.sets.findMany({
        where: { organizationId },
        select: { id: true, name: true, content: true },
      }),
      this._prisma.signatures.findMany({
        where: { organizationId },
        select: { id: true, content: true, autoAdd: true },
      }),
      this._prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: CAP,
        select: {
          action: true,
          actorType: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

    const postCount = await this._prisma.post.count({
      where: { organizationId },
    });

    return {
      exportedAt: new Date().toISOString(),
      truncated:
        postCount > CAP ? { posts: { total: postCount, included: CAP } } : null,
      organization,
      members,
      integrations,
      posts,
      media,
      webhooks,
      sets,
      signatures,
      auditLogs,
    };
  }

  async requestDeletion(organizationId: string) {
    const now = new Date();
    await this._prisma.$transaction(async (tx) => {
      await cancelCalendarReservationsInTransaction(tx, {
        organizationId,
        action: 'calendar.writer.workspace_erasure',
        subject: organizationId,
        code: 'calendar_workspace_erasure_requested',
        reason:
          'Workspace erasure cancelled all pending unpinned calendar work.',
        actor: { actorType: 'user' },
        now,
      });
      // Secret material dies first.
      await tx.integration.updateMany({
        where: { organizationId },
        data: {
          token: '',
          refreshToken: '',
          customInstanceDetails: null,
          disabled: true,
          deletedAt: now,
        },
      });
      await tx.apiKey.updateMany({
        where: { organizationId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.organization.updateMany({
        where: { id: organizationId },
        data: { apiKey: null, name: `deleted-${organizationId.slice(0, 8)}` },
      });
      await tx.post.updateMany({
        where: { organizationId },
        data: { deletedAt: now },
      });
      await tx.webhooks.updateMany({
        where: { organizationId },
        data: { deletedAt: now },
      });
      await tx.media.updateMany({
        where: { organizationId },
        data: { deletedAt: now },
      });
      await tx.userOrganization.updateMany({
        where: { organizationId },
        data: { disabled: true },
      });
    });
    return { deleted: true, at: now.toISOString() };
  }
}
