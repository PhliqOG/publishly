import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { FleetDistributionRepository } from './fleet-distribution.repository';
import {
  allocateFleetStagger,
  isValidIanaTimeZone,
  parseExplicitIsoDate,
} from '@gitroom/nestjs-libraries/reliability/fleet.stagger';
import {
  canonicalJson,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  sha256,
  validateIdempotencyKey,
} from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import {
  normalizePostFailure,
  PostFailureClass,
} from '@gitroom/nestjs-libraries/reliability/post.failure';

type FleetStaggerInput = {
  accountGroupId?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
  timezone?: unknown;
  minimumSpacingSeconds?: unknown;
  shortLink?: unknown;
  tags?: unknown;
  value?: unknown;
  settingsByProvider?: unknown;
};

type FleetConnection = {
  id: string;
  organizationId: string;
  name: string;
  providerIdentifier: string;
  disabled: boolean;
  deletedAt: Date | null;
};

type DistributionItem = {
  id: string;
  integrationId: string;
  postId: string;
  postGroup: string;
  scheduledAt: Date;
  status: 'ALLOCATED' | 'CREATED';
  integration: FleetConnection;
};

function fleetFailure(error: unknown): {
  failureClass: PostFailureClass;
  code: string;
  reason: string;
} {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const detail = response as Record<string, unknown>;
      if (
        ['recoverable', 'user_action_needed', 'data_problem'].includes(
          detail.failureClass as string
        ) &&
        typeof detail.code === 'string' &&
        typeof detail.reason === 'string' &&
        detail.reason.trim()
      ) {
        return {
          failureClass: detail.failureClass as PostFailureClass,
          code: detail.code,
          reason: detail.reason.trim(),
        };
      }
    }
  }
  return normalizePostFailure({ error });
}

function classifiedHttpException(error: unknown) {
  if (error instanceof HttpException) return error;
  const failure = fleetFailure(error);
  const status =
    failure.failureClass === 'recoverable'
      ? 503
      : failure.failureClass === 'user_action_needed'
      ? 409
      : 422;
  return new HttpException(
    {
      failureClass: failure.failureClass,
      code: failure.code,
      reason: failure.reason,
    },
    status
  );
}

function deterministicIdentity(
  prefix: 'fleet_dist' | 'fleet_item' | 'fleet_post' | 'fleet_group',
  ...parts: string[]
) {
  return `${prefix}_${sha256(parts.join(':')).slice(0, 32)}`;
}

@Injectable()
export class FleetDistributionService {
  private readonly logger = new Logger(FleetDistributionService.name);

  constructor(
    private _repository: FleetDistributionRepository,
    private _posts: PostsService
  ) {}

  private normalizeInput(input: FleetStaggerInput, now: Date) {
    const accountGroupId =
      typeof input.accountGroupId === 'string'
        ? input.accountGroupId.trim()
        : '';
    const windowStart = parseExplicitIsoDate(input.windowStart);
    const windowEnd = parseExplicitIsoDate(input.windowEnd);
    const timezone =
      typeof input.timezone === 'string' ? input.timezone.trim() : '';
    const minimumSpacingSeconds =
      input.minimumSpacingSeconds === undefined
        ? 60
        : input.minimumSpacingSeconds;
    if (!accountGroupId || accountGroupId.length > 200) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_account_group',
        reason: 'A valid accountGroupId is required for fleet distribution.',
      });
    }
    if (!windowStart || !windowEnd) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_stagger_window',
        reason:
          'windowStart and windowEnd must be ISO timestamps with an explicit Z or UTC offset.',
      });
    }
    if (
      windowEnd.getTime() <= now.getTime() ||
      windowStart.getTime() < now.getTime() - 60_000
    ) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'stagger_window_in_past',
        reason:
          'The stagger window must start now or later and end in the future.',
      });
    }
    if (!isValidIanaTimeZone(timezone)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_stagger_timezone',
        reason:
          'timezone must be a valid IANA timezone such as America/New_York.',
      });
    }
    if (
      !Number.isInteger(minimumSpacingSeconds) ||
      (minimumSpacingSeconds as number) < 1 ||
      (minimumSpacingSeconds as number) > 86_400
    ) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_stagger_spacing',
        reason:
          'minimumSpacingSeconds must be an integer from 1 through 86400.',
      });
    }
    if (
      !Array.isArray(input.value) ||
      !input.value.length ||
      input.value.length > 25
    ) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_stagger_content',
        reason: 'value must contain between 1 and 25 shared content entries.',
      });
    }
    if (input.tags !== undefined && !Array.isArray(input.tags)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_stagger_tags',
        reason: 'tags must be an array.',
      });
    }
    if (
      input.settingsByProvider !== undefined &&
      (!input.settingsByProvider ||
        typeof input.settingsByProvider !== 'object' ||
        Array.isArray(input.settingsByProvider))
    ) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_stagger_settings',
        reason:
          'settingsByProvider must be an object keyed by provider identifier.',
      });
    }
    return {
      accountGroupId,
      windowStart,
      windowEnd,
      timezone,
      minimumSpacingSeconds: minimumSpacingSeconds as number,
      shortLink: input.shortLink === true,
      tags: (input.tags || []) as Array<{ value: string; label: string }>,
      value: input.value as Array<Record<string, unknown>>,
      settingsByProvider: (input.settingsByProvider || {}) as Record<
        string,
        unknown
      >,
    };
  }

  private requestHash(
    input: ReturnType<FleetDistributionService['normalizeInput']>
  ) {
    return sha256(
      canonicalJson({
        accountGroupId: input.accountGroupId,
        windowStart: input.windowStart.toISOString(),
        windowEnd: input.windowEnd.toISOString(),
        timezone: input.timezone,
        minimumSpacingSeconds: input.minimumSpacingSeconds,
        shortLink: input.shortLink,
        tags: input.tags,
        value: input.value,
        settingsByProvider: input.settingsByProvider,
      })
    );
  }

  private rawBody(
    organizationId: string,
    distributionId: string,
    item: DistributionItem,
    input: ReturnType<FleetDistributionService['normalizeInput']>
  ): CreatePostDto {
    const value = input.value.map((entry, index) => ({
      ...JSON.parse(JSON.stringify(entry)),
      id:
        index === 0
          ? item.postId
          : deterministicIdentity(
              'fleet_post',
              organizationId,
              distributionId,
              item.integrationId,
              String(index)
            ),
      content: typeof entry.content === 'string' ? entry.content : '',
      image: Array.isArray(entry.image) ? entry.image : [],
    })) as any;
    return {
      type: 'schedule',
      date: item.scheduledAt.toISOString(),
      shortLink: input.shortLink,
      tags: JSON.parse(JSON.stringify(input.tags)),
      posts: [
        {
          integration: { id: item.integrationId },
          value,
          group: item.postGroup,
          settings: JSON.parse(
            JSON.stringify(
              input.settingsByProvider[item.integration.providerIdentifier] ||
                {}
            )
          ) as any,
        },
      ],
    };
  }

  private async prepareBodies(
    organizationId: string,
    distributionId: string,
    items: DistributionItem[],
    input: ReturnType<FleetDistributionService['normalizeInput']>
  ) {
    const rawBodies = items.map((item) =>
      this.rawBody(organizationId, distributionId, item, input)
    );
    const validation = await this._posts.validatePosts(
      organizationId,
      rawBodies.map((body) => body.posts[0])
    );
    for (const item of validation) {
      const detail = item.emptyContent
        ? { code: 'empty_content', reason: 'Every post needs text or media.' }
        : !item.valid
        ? {
            code: 'invalid_platform_settings',
            reason: item.settingsError || 'Platform settings are invalid.',
          }
        : item.errors !== true
        ? { code: 'invalid_media', reason: String(item.errors) }
        : item.tooLong
        ? {
            code: 'caption_too_long',
            reason: 'The shared caption exceeds this platform character limit.',
          }
        : null;
      if (detail) {
        throw new UnprocessableEntityException({
          failureClass: 'data_problem',
          ...detail,
          provider: item.identifier,
          integrationId: item.id,
        });
      }
    }
    const mapped = await Promise.all(
      rawBodies.map((body) => this._posts.mapTypeToPost(body, organizationId))
    );
    return new Map(
      items.map((item, index) => {
        (mapped[index].posts[0] as any).__publishlyTargetGroup = item.postGroup;
        return [item.id, mapped[index]];
      })
    );
  }

  private response(distribution: any, replayed: boolean) {
    return {
      distributionId: distribution.id,
      state: 'COMPLETED',
      replayed,
      accountGroup: distribution.accountGroup,
      window: {
        start: distribution.windowStart,
        end: distribution.windowEnd,
        timezone: distribution.timezone,
        minimumSpacingSeconds: distribution.minimumSpacingSec,
      },
      items: distribution.items.map((item: DistributionItem) => ({
        integrationId: item.integrationId,
        provider: item.integration.providerIdentifier,
        postId: item.postId,
        postGroup: item.postGroup,
        scheduledAt: item.scheduledAt,
        status: 'CREATED',
      })),
    };
  }

  async create(
    organizationId: string,
    idempotencyKey: unknown,
    rawInput: FleetStaggerInput,
    now = new Date()
  ) {
    if (!validateIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason: `Idempotency-Key is required and must be ${IDEMPOTENCY_KEY_MIN_LENGTH}-${IDEMPOTENCY_KEY_MAX_LENGTH} characters using letters, numbers, dot, underscore, colon, or hyphen.`,
      });
    }
    const input = this.normalizeInput(rawInput || {}, now);
    const keyHash = sha256(idempotencyKey);
    const requestHash = this.requestHash(input);
    let distribution = await this._repository.findByKey(
      organizationId,
      keyHash
    );
    if (distribution && distribution.requestHash !== requestHash) {
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'idempotency_key_reused',
        reason:
          'This Idempotency-Key was already used for a different fleet distribution request.',
      });
    }
    if (distribution?.state === 'COMPLETED') {
      return this.response(distribution, true);
    }

    let prepared: Map<string, CreatePostDto> | null = null;
    if (!distribution) {
      const group = await this._repository.getActiveGroup(
        organizationId,
        input.accountGroupId
      );
      if (!group) {
        throw new NotFoundException({
          failureClass: 'data_problem',
          code: 'account_group_not_found',
          reason: 'This account group was not found in the current workspace.',
        });
      }
      const connections = group.integrations.map(
        (assignment) => assignment.integration as FleetConnection
      );
      if (!connections.length || connections.length > 500) {
        throw new BadRequestException({
          failureClass: 'data_problem',
          code: 'invalid_stagger_fleet_size',
          reason:
            'The selected group must contain between 1 and 500 active accounts.',
        });
      }
      const disabled = connections.find((connection) => connection.disabled);
      if (disabled) {
        throw new ConflictException({
          failureClass: 'user_action_needed',
          code: 'connection_disabled',
          reason: `Reconnect or enable ${disabled.name} before distributing to this group.`,
          integrationId: disabled.id,
        });
      }
      const existing = await this._repository.listExistingSlots({
        organizationId,
        integrationIds: connections.map((connection) => connection.id),
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        paddingSeconds: input.minimumSpacingSeconds,
      });
      const existingByIntegration = existing.reduce<Record<string, Date[]>>(
        (all, post) => {
          (all[post.integrationId] ||= []).push(post.publishDate);
          return all;
        },
        {}
      );
      const allocation = allocateFleetStagger({
        integrationIds: connections.map((connection) => connection.id),
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        minimumSpacingSeconds: input.minimumSpacingSeconds,
        existingByIntegration,
      });
      if (allocation.ok === false) {
        throw new BadRequestException({
          failureClass: 'data_problem',
          code: allocation.code,
          reason: allocation.reason,
        });
      }
      const distributionId = deterministicIdentity(
        'fleet_dist',
        organizationId,
        keyHash
      );
      const connectionById = new Map(
        connections.map((connection) => [connection.id, connection])
      );
      const items = allocation.allocations.map((slot) => {
        const postId = deterministicIdentity(
          'fleet_post',
          organizationId,
          keyHash,
          slot.integrationId,
          '0'
        );
        return {
          id: deterministicIdentity(
            'fleet_item',
            distributionId,
            slot.integrationId
          ),
          integrationId: slot.integrationId,
          postId,
          postGroup: deterministicIdentity(
            'fleet_group',
            organizationId,
            keyHash,
            slot.integrationId
          ),
          scheduledAt: slot.scheduledAt,
          status: 'ALLOCATED' as const,
          integration: connectionById.get(slot.integrationId)!,
        };
      });

      // Preflight every destination before the distribution ledger or any Post
      // row is written, preventing partially-created bad campaigns.
      prepared = await this.prepareBodies(
        organizationId,
        distributionId,
        items,
        input
      );
      const claim = await this._repository.create({
        id: distributionId,
        organizationId,
        accountGroupId: input.accountGroupId,
        keyHash,
        requestHash,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        timezone: input.timezone,
        minimumSpacingSec: input.minimumSpacingSeconds,
        items: items.map(
          ({ integration: _integration, status: _status, ...item }) => item
        ),
      });
      distribution = claim.distribution;
      if (distribution.requestHash !== requestHash) {
        throw new ConflictException({
          failureClass: 'data_problem',
          code: 'idempotency_key_reused',
          reason:
            'This Idempotency-Key was concurrently used for a different fleet distribution request.',
        });
      }
      if (distribution.state === 'COMPLETED') {
        return this.response(distribution, true);
      }
      if (!claim.created) prepared = null;
    }

    const items = distribution.items as DistributionItem[];
    const unavailable = items.find(
      (item) =>
        item.integration.organizationId !== organizationId ||
        !!item.integration.deletedAt ||
        item.integration.disabled
    );
    if (unavailable) {
      const error = new ConflictException({
        failureClass: 'user_action_needed',
        code: unavailable.integration.disabled
          ? 'connection_disabled'
          : 'connection_not_found',
        reason: `${unavailable.integration.name} must be reconnected or enabled before this distribution can resume.`,
        integrationId: unavailable.integrationId,
      });
      const failure = fleetFailure(error);
      await this._repository.recordFailure({
        distributionId: distribution.id,
        itemId: unavailable.id,
        failureClass: failure.failureClass,
        code: failure.code,
        reason: failure.reason,
      });
      throw error;
    }

    try {
      prepared ||= await this.prepareBodies(
        organizationId,
        distribution.id,
        items,
        input
      );
      if (distribution.state === 'FAILED') {
        await this._repository.resume(distribution.id);
      }
    } catch (error) {
      const failure = fleetFailure(error);
      await this._repository.recordFailure({
        distributionId: distribution.id,
        failureClass: failure.failureClass,
        code: failure.code,
        reason: failure.reason,
      });
      throw classifiedHttpException(error);
    }

    let currentItem: DistributionItem | undefined;
    try {
      for (const item of items) {
        if (item.status === 'CREATED') continue;
        currentItem = item;
        const body = prepared.get(item.id);
        if (!body) {
          throw new Error(
            `Prepared fleet post body is missing for distribution item ${item.id}`
          );
        }
        const created = await this._posts.createPost(
          organizationId,
          body,
          'WEB',
          false,
          true
        );
        if (!created.some((post) => post.postId === item.postId)) {
          throw new Error(
            `Fleet post ${item.postId} was not returned after deterministic creation`
          );
        }
        await this._repository.markItemCreated(distribution.id, item.id);
      }
      const completion = await this._repository.complete(distribution.id, now);
      if (!completion.completed) {
        throw new Error(
          `${completion.remaining} fleet distribution items remain uncreated`
        );
      }
      return this.response(distribution, false);
    } catch (error) {
      const failure = fleetFailure(error);
      try {
        await this._repository.recordFailure({
          distributionId: distribution.id,
          itemId: currentItem?.id,
          failureClass: failure.failureClass,
          code: failure.code,
          reason: failure.reason,
        });
      } catch (ledgerError) {
        this.logger.error({
          event: 'fleet.distribution_failure_write_failed',
          distributionId: distribution.id,
          failureCode: failure.code,
          failureReason: failure.reason,
          ledgerReason: normalizePostFailure({ error: ledgerError }).reason,
        });
        throw classifiedHttpException(ledgerError);
      }
      throw classifiedHttpException(error);
    }
  }
}
