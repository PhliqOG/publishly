import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FleetHealthRepository } from './fleet-health.repository';
import {
  deriveFleetHealthColor,
  fleetSuccessRate,
  fleetWindowDays,
  normalizeAccountGroupColor,
  normalizeAccountGroupName,
  normalizeAccountTagColor,
  normalizeAccountTagName,
} from '@gitroom/nestjs-libraries/reliability/fleet.health';
import { tokenDaysRemaining } from '@gitroom/nestjs-libraries/reliability/connection.health.policy';
import { platformTruthResponse } from '@gitroom/nestjs-libraries/reliability/platform.truth';

function selectedIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === 'string' && id.length >= 1 && id.length <= 200
      )
    ),
  ];
}

type ConnectCatalogEntry = {
  identifier?: unknown;
  name?: unknown;
  configured?: unknown;
  isExternal?: unknown;
  isChromeExtension?: unknown;
  customFields?: unknown;
};

@Injectable()
export class FleetHealthService {
  constructor(private _repository: FleetHealthRepository) {}

  async getFleetHealth(
    organizationId: string,
    filters: {
      windowDays?: unknown;
      groupId?: string;
      tagId?: string;
      color?: string;
    },
    now = new Date()
  ) {
    const windowDays = fleetWindowDays(filters.windowDays);
    const since = new Date(now.getTime() - windowDays * 86_400_000);
    const [connections, facets] = await Promise.all([
      this._repository.listConnections(organizationId, {
        groupId: filters.groupId,
        tagId: filters.tagId,
      }),
      this._repository.listFacets(organizationId),
    ]);
    const integrationIds = connections.map((connection) => connection.id);
    const [terminalGroups, queueGroups] = await Promise.all([
      this._repository.aggregateTerminalOutcomes(
        organizationId,
        integrationIds,
        since
      ),
      this._repository.aggregateQueue(organizationId, integrationIds),
    ]);

    const metrics = new Map<
      string,
      { confirmedLive: number; failed: number; retries: number }
    >();
    for (const group of terminalGroups) {
      const current = metrics.get(group.integrationId) || {
        confirmedLive: 0,
        failed: 0,
        retries: 0,
      };
      const count = group._count._all;
      if (
        group.state === 'PUBLISHED' &&
        group.deliveryStage === 'confirmed_live'
      ) {
        current.confirmedLive += count;
      } else if (group.state === 'FAILED' && group.deliveryStage === 'failed') {
        current.failed += count;
      }
      current.retries += Math.max((group._sum.attempts || 0) - count, 0);
      metrics.set(group.integrationId, current);
    }
    const queues = new Map(
      queueGroups.map((group) => [
        group.integrationId,
        { count: group._count._all, oldestAt: group._min.createdAt },
      ])
    );

    const rows = connections
      .map((connection) => {
        const healthColor = deriveFleetHealthColor(connection);
        const outcome = metrics.get(connection.id) || {
          confirmedLive: 0,
          failed: 0,
          retries: 0,
        };
        const queue = queues.get(connection.id) || {
          count: 0,
          oldestAt: null,
        };
        const tokenNeedsAttention = connection.tokenHealthState !== 'HEALTHY';
        const platformNeedsAttention = !['NOT_APPLICABLE', 'READY'].includes(
          connection.platformTruthState
        );
        return {
          id: connection.id,
          internalId: connection.internalId,
          name: connection.name,
          picture: connection.picture,
          provider: connection.providerIdentifier,
          disabled: connection.disabled,
          refreshNeeded: connection.refreshNeeded,
          healthColor,
          healthReason:
            (platformNeedsAttention ? connection.platformTruthReason : null) ||
            (tokenNeedsAttention ? connection.tokenHealthReason : null) ||
            connection.connectionHealthReason ||
            connection.tokenHealthReason ||
            'This connection is healthy.',
          tokenExpiration: connection.tokenExpiration,
          tokenDaysRemaining: tokenDaysRemaining(
            connection.tokenExpiration,
            now
          ),
          tokenHealthState: connection.tokenHealthState,
          tokenHealthReason: connection.tokenHealthReason,
          connectionHealthState: connection.connectionHealthState,
          connectionHealthReason: connection.connectionHealthReason,
          lastProviderContactAt: connection.lastProviderContactAt,
          lastSuccessfulPublishAt: connection.lastSuccessfulPublishAt,
          lastFailedPublishAt: connection.lastFailedPublishAt,
          consecutiveErrors: connection.consecutiveErrors,
          staleSince: connection.staleSince,
          deadAccountAt: connection.deadAccountAt,
          rateLimitedUntil: connection.rateLimitedUntil,
          platformTruth: platformTruthResponse(connection),
          groups: connection.accountGroups.map(
            (assignment) => assignment.accountGroup
          ),
          group: connection.accountGroups[0]?.accountGroup || null,
          tags: connection.accountTags.map(
            (assignment) => assignment.accountTag
          ),
          metrics: {
            ...outcome,
            terminal: outcome.confirmedLive + outcome.failed,
            successRate: fleetSuccessRate(
              outcome.confirmedLive,
              outcome.failed
            ),
            queued: queue.count,
            oldestQueuedAt: queue.oldestAt,
          },
        };
      })
      .filter(
        (row) =>
          !filters.color ||
          !['green', 'yellow', 'red'].includes(filters.color) ||
          row.healthColor === filters.color
      );

    const summary = rows.reduce(
      (current, row) => {
        current.total += 1;
        current[row.healthColor] += 1;
        current.confirmedLive += row.metrics.confirmedLive;
        current.failed += row.metrics.failed;
        return current;
      },
      { total: 0, green: 0, yellow: 0, red: 0, confirmedLive: 0, failed: 0 }
    );

    return {
      generatedAt: now,
      windowDays,
      summary: {
        ...summary,
        successRate: fleetSuccessRate(summary.confirmedLive, summary.failed),
      },
      facets,
      rows,
    };
  }

  async buildReconnectPlan(organizationId: string, rawIds: unknown) {
    const integrationIds = selectedIds(rawIds);
    if (!integrationIds.length || integrationIds.length > 500) {
      throw new BadRequestException({
        code: 'invalid_reconnect_selection',
        reason: 'Select between 1 and 500 unique connections to reconnect.',
      });
    }
    const candidates = await this._repository.listReconnectCandidates(
      organizationId,
      integrationIds
    );
    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate])
    );
    const actions: Array<Record<string, unknown>> = [];
    const rejected: Array<Record<string, unknown>> = [];
    for (const id of integrationIds) {
      const candidate = byId.get(id);
      if (!candidate) {
        rejected.push({
          integrationId: id,
          code: 'connection_not_found',
          reason: 'This connection was not found in the current workspace.',
        });
      } else if (candidate.disabled) {
        rejected.push({
          integrationId: id,
          name: candidate.name,
          provider: candidate.providerIdentifier,
          code: 'connection_disabled',
          reason: 'Enable this connection before reconnecting it.',
        });
      } else {
        actions.push({
          integrationId: candidate.id,
          internalId: candidate.internalId,
          name: candidate.name,
          provider: candidate.providerIdentifier,
          tokenHealthState: candidate.tokenHealthState,
          connectionHealthState: candidate.connectionHealthState,
        });
      }
    }
    return { requested: integrationIds.length, actions, rejected };
  }

  buildConnectPlan(rawSelections: unknown, catalog: ConnectCatalogEntry[]) {
    if (
      !Array.isArray(rawSelections) ||
      !rawSelections.length ||
      rawSelections.length > 500
    ) {
      throw new BadRequestException({
        code: 'invalid_bulk_connect_selection',
        reason: 'Choose between 1 and 500 provider connection actions.',
      });
    }

    const selections: Array<{ provider: string; count: number }> = [];
    const seen = new Set<string>();
    let requested = 0;
    for (const raw of rawSelections) {
      const value = raw as Record<string, unknown>;
      const provider =
        value && typeof value.provider === 'string'
          ? value.provider.trim()
          : '';
      const count = value?.count;
      if (
        !/^[a-z0-9._-]{1,100}$/i.test(provider) ||
        !Number.isInteger(count) ||
        (count as number) < 1 ||
        (count as number) > 500 ||
        seen.has(provider)
      ) {
        throw new BadRequestException({
          code: 'invalid_bulk_connect_selection',
          reason:
            'Each provider must appear once with an integer connection count between 1 and 500.',
        });
      }
      seen.add(provider);
      requested += count as number;
      selections.push({ provider, count: count as number });
    }
    if (requested > 500) {
      throw new BadRequestException({
        code: 'invalid_bulk_connect_selection',
        reason:
          'A bulk connect plan can contain at most 500 connection actions.',
      });
    }

    const providers = new Map(
      catalog
        .filter(
          (entry) =>
            typeof entry.identifier === 'string' && entry.identifier.length > 0
        )
        .map((entry) => [entry.identifier as string, entry])
    );
    const actions: Array<{
      actionId: string;
      provider: string;
      providerName: string;
      ordinal: number;
    }> = [];
    const rejected: Array<{
      provider: string;
      providerName?: string;
      count: number;
      code: string;
      reason: string;
    }> = [];

    for (const selection of selections) {
      const provider = providers.get(selection.provider);
      const providerName =
        typeof provider?.name === 'string' && provider.name
          ? provider.name
          : selection.provider;
      let rejection: { code: string; reason: string } | null = null;
      if (!provider) {
        rejection = {
          code: 'provider_not_found',
          reason: 'This provider is not available on this server.',
        };
      } else if (provider.configured !== true) {
        rejection = {
          code: 'provider_not_configured',
          reason:
            'This provider is missing server credentials and cannot start OAuth.',
        };
      } else if (provider.isExternal === true) {
        rejection = {
          code: 'external_details_required',
          reason:
            'This provider needs instance details and must be connected individually.',
        };
      } else if (provider.isChromeExtension === true) {
        rejection = {
          code: 'extension_required',
          reason:
            'This provider requires the browser extension and must be connected individually.',
        };
      } else if (provider.customFields !== undefined) {
        rejection = {
          code: 'credentials_required',
          reason:
            'This provider needs credentials or custom fields and must be connected individually.',
        };
      }

      if (rejection) {
        rejected.push({
          provider: selection.provider,
          providerName,
          count: selection.count,
          ...rejection,
        });
        continue;
      }
      for (let ordinal = 1; ordinal <= selection.count; ordinal += 1) {
        actions.push({
          actionId: `${selection.provider}:${ordinal}`,
          provider: selection.provider,
          providerName,
          ordinal,
        });
      }
    }

    return { requested, actions, rejected };
  }

  createTag(
    organizationId: string,
    input: { name?: unknown; color?: unknown }
  ) {
    const tag = normalizeAccountTagName(input.name);
    if (!tag) {
      throw new BadRequestException({
        code: 'invalid_account_tag',
        reason: 'Account tag name must contain between 1 and 40 characters.',
      });
    }
    return this._repository.createTag({
      organizationId,
      ...tag,
      color: normalizeAccountTagColor(input.color),
    });
  }

  createGroup(
    organizationId: string,
    input: { name?: unknown; color?: unknown }
  ) {
    const group = normalizeAccountGroupName(input.name);
    if (!group) {
      throw new BadRequestException({
        code: 'invalid_account_group',
        reason: 'Account group name must contain between 1 and 60 characters.',
      });
    }
    return this._repository.createGroup({
      organizationId,
      ...group,
      color: normalizeAccountGroupColor(input.color),
    });
  }

  async updateTag(
    organizationId: string,
    accountTagId: string,
    input: { name?: unknown; color?: unknown }
  ) {
    const tag = normalizeAccountTagName(input.name);
    if (!tag) {
      throw new BadRequestException({
        code: 'invalid_account_tag',
        reason: 'Account tag name must contain between 1 and 40 characters.',
      });
    }
    const result = await this._repository.updateTag({
      organizationId,
      accountTagId,
      ...tag,
      color: normalizeAccountTagColor(input.color),
    });
    if (!result.ok && result.code === 'account_tag_conflict') {
      throw new ConflictException({
        code: result.code,
        reason: 'Another account tag already uses this name.',
      });
    }
    if (!result.ok) {
      throw new NotFoundException({
        code: result.code,
        reason: 'This account tag was not found in the current workspace.',
      });
    }
    return result.tag;
  }

  async updateGroup(
    organizationId: string,
    accountGroupId: string,
    input: { name?: unknown; color?: unknown }
  ) {
    const group = normalizeAccountGroupName(input.name);
    if (!group) {
      throw new BadRequestException({
        code: 'invalid_account_group',
        reason: 'Account group name must contain between 1 and 60 characters.',
      });
    }
    const result = await this._repository.updateGroup({
      organizationId,
      accountGroupId,
      ...group,
      color: normalizeAccountGroupColor(input.color),
    });
    if (!result.ok && result.code === 'account_group_conflict') {
      throw new ConflictException({
        code: result.code,
        reason: 'Another account group already uses this name.',
      });
    }
    if (!result.ok) {
      throw new NotFoundException({
        code: result.code,
        reason: 'This account group was not found in the current workspace.',
      });
    }
    return result.group;
  }

  async archiveTag(
    organizationId: string,
    accountTagId: string,
    now = new Date()
  ) {
    const result = await this._repository.archiveTag(
      organizationId,
      accountTagId,
      now
    );
    if (!result.count) {
      throw new NotFoundException({
        code: 'account_tag_not_found',
        reason: 'This account tag was not found in the current workspace.',
      });
    }
    return { archived: true, accountTagId, archivedAt: now };
  }

  async archiveGroup(
    organizationId: string,
    accountGroupId: string,
    now = new Date()
  ) {
    const result = await this._repository.archiveGroup(
      organizationId,
      accountGroupId,
      now
    );
    if (!result.count) {
      throw new NotFoundException({
        code: 'account_group_not_found',
        reason: 'This account group was not found in the current workspace.',
      });
    }
    return { archived: true, accountGroupId, archivedAt: now };
  }

  async assignTag(
    organizationId: string,
    accountTagId: string,
    input: { integrationIds?: unknown; mode?: unknown }
  ) {
    const integrationIds = selectedIds(input.integrationIds);
    if (!integrationIds.length || integrationIds.length > 500) {
      throw new BadRequestException({
        code: 'invalid_tag_selection',
        reason: 'Select between 1 and 500 unique connections to tag.',
      });
    }
    if (input.mode !== 'add' && input.mode !== 'remove') {
      throw new BadRequestException({
        code: 'invalid_tag_mode',
        reason: 'Tag mode must be add or remove.',
      });
    }
    const result = await this._repository.assignTag({
      organizationId,
      accountTagId,
      integrationIds,
      mode: input.mode,
    });
    if (!result.ok && result.code === 'account_tag_not_found') {
      throw new NotFoundException({
        code: result.code,
        reason: 'This account tag was not found in the current workspace.',
      });
    }
    if (!result.ok) {
      throw new NotFoundException({
        code: result.code,
        reason:
          'One or more selected connections were not found in the current workspace.',
      });
    }
    return result;
  }

  async assignGroup(
    organizationId: string,
    accountGroupId: string,
    input: { integrationIds?: unknown; mode?: unknown }
  ) {
    const integrationIds = selectedIds(input.integrationIds);
    if (!integrationIds.length || integrationIds.length > 500) {
      throw new BadRequestException({
        code: 'invalid_group_selection',
        reason: 'Select between 1 and 500 unique connections to group.',
      });
    }
    if (input.mode !== 'add' && input.mode !== 'remove') {
      throw new BadRequestException({
        code: 'invalid_group_mode',
        reason: 'Group mode must be add or remove.',
      });
    }
    const result = await this._repository.assignGroup({
      organizationId,
      accountGroupId,
      integrationIds,
      mode: input.mode,
    });
    if (!result.ok && result.code === 'account_group_not_found') {
      throw new NotFoundException({
        code: result.code,
        reason: 'This account group was not found in the current workspace.',
      });
    }
    if (!result.ok) {
      throw new NotFoundException({
        code: result.code,
        reason:
          'One or more selected connections were not found in the current workspace.',
      });
    }
    return result;
  }
}
