import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import { fromBuffer } from 'file-type';
import * as Sentry from '@sentry/nestjs';
import {
  fingerprintProviderMediaCapability,
  hashProviderMediaCapability,
  parseProviderMediaCapability,
  parseProviderMediaRange,
  parseOpaqueBulkPrivateMediaPath,
  privateAdapterMediaPath,
  providerMediaInternalToken,
  providerMediaUrl,
  safeProviderMediaFilename,
} from '@gitroom/helpers/bulk-scheduler/provider-media.contract';
import {
  BULK_SCHEDULER_CAPABILITY_MATRIX,
  findBulkSchedulerTuple,
} from '@gitroom/helpers/bulk-scheduler/capability.matrix';
import {
  PrivateMediaStorage,
  PrivateMediaStorageFactory,
} from '@gitroom/nestjs-libraries/upload/private-media.storage';
import { sha256 } from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { ProviderMediaRepository } from './provider-media.repository';

type ProviderMediaMethod = 'GET' | 'HEAD';

const MAX_PRIVATE_VIDEO_BYTES = 1024 * 1024 * 1024;

function envTrue(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function operationallyKilled(tuple: { killSwitchEnv: string }) {
  return (
    envTrue(
      process.env[BULK_SCHEDULER_CAPABILITY_MATRIX.globalKillSwitchEnv]
    ) || envTrue(process.env[tuple.killSwitchEnv])
  );
}

class ProviderMediaException extends HttpException {
  constructor(
    public readonly internalCode: string,
    public readonly internalReason: string,
    status: number
  ) {
    super(
      {
        failureClass:
          status >= 500 ? 'recoverable' : 'user_action_needed',
        code:
          status === HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE
            ? 'provider_media_range_invalid'
            : status >= 500
            ? 'provider_media_transport_unavailable'
            : 'provider_media_unavailable',
        reason:
          status === HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE
            ? 'The requested provider media byte range is invalid.'
            : status >= 500
            ? 'Publishly could not read the private media object. The provider can retry safely.'
            : 'This provider media capability is invalid or unavailable.',
      },
      status
    );
  }
}

function safeEqualHex(first: string, second: string) {
  if (!/^[a-f0-9]{64}$/.test(first) || !/^[a-f0-9]{64}$/.test(second)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(first, 'hex'), Buffer.from(second, 'hex'));
}

function safeEqualSecret(first: unknown, second: string) {
  const firstHash = createHash('sha256')
    .update(typeof first === 'string' ? first : '', 'utf8')
    .digest();
  const secondHash = createHash('sha256').update(second, 'utf8').digest();
  return timingSafeEqual(firstHash, secondHash);
}

@Injectable()
export class ProviderMediaService {
  private readonly logger = new Logger(ProviderMediaService.name);
  private storage?: PrivateMediaStorage;

  constructor(private _repository: ProviderMediaRepository) {}

  /** Test-only dependency seam; production always uses the private factory. */
  useStorageForTesting(storage: PrivateMediaStorage) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Private media storage can only be replaced in tests.');
    }
    this.storage = storage;
  }

  private getStorage() {
    this.storage ||= PrivateMediaStorageFactory.create();
    return this.storage;
  }

  private tupleForJob(input: {
    tupleId: string;
    transportMode: 'provider_pull' | 'direct_upload';
    provider: string;
  }) {
    const tuple = findBulkSchedulerTuple(input.tupleId);
    if (
      !tuple ||
      !tuple.adapterImplemented ||
      !tuple.privateTransportReady ||
      tuple.transportMode !== input.transportMode ||
      tuple.provider !== input.provider ||
      operationallyKilled(tuple)
    ) {
      throw new Error('bulk_private_transport_tuple_unavailable');
    }
    return tuple;
  }

  async storePrivateVideo(input: {
    organizationId: string;
    originalName: string;
    body: Buffer;
  }) {
    if (
      !Buffer.isBuffer(input.body) ||
      input.body.length < 1 ||
      input.body.length > MAX_PRIVATE_VIDEO_BYTES
    ) {
      throw new HttpException(
        {
          failureClass: 'data_problem',
          code: 'invalid_media_size',
          reason: 'Bulk Scheduler video size must be between 1 byte and 1 GiB.',
        },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    const detected = await fromBuffer(input.body);
    if (!detected || detected.mime !== 'video/mp4') {
      throw new HttpException(
        {
          failureClass: 'data_problem',
          code: 'invalid_media',
          reason: 'The initial Bulk Scheduler MVP accepts verified MP4 video bytes only.',
        },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
    const digest = createHash('sha256').update(input.body).digest('hex');
    const organizationSegment = sha256(input.organizationId).slice(0, 32);
    const id = `bulk_asset_${sha256(`${input.organizationId}:${digest}`).slice(0, 32)}`;
    const storageKey = `bulk/${organizationSegment}/${id}/${digest}.mp4`;
    await this.getStorage().put(storageKey, input.body, 'video/mp4');
    const result = await this._repository.createAsset({
      id,
      organizationId: input.organizationId,
      storageKey,
      originalName: safeProviderMediaFilename(input.originalName),
      mimeType: 'video/mp4',
      byteLength: input.body.length,
      sha256: digest,
    });
    Sentry.metrics.count(
      result.created ? 'bulk_private_asset_stored' : 'bulk_private_asset_deduplicated',
      1
    );
    this.logger.log({
      event: result.created
        ? 'bulk_private_asset_stored'
        : 'bulk_private_asset_deduplicated',
      organizationId: input.organizationId,
      assetId: result.asset.id,
      byteLength: result.asset.byteLength,
      sha256: digest,
    });
    return {
      id: result.asset.id,
      originalName: result.asset.originalName,
      mimeType: result.asset.mimeType,
      byteLength: result.asset.byteLength,
      sha256: result.asset.sha256,
      state: result.asset.state,
      duplicate: !result.created,
    };
  }

  attachCampaignAsset(input: {
    organizationId: string;
    campaignId: string;
    assetId: string;
    position: number;
  }) {
    return this._repository.attachCampaignAsset(input);
  }

  attachJobAsset(input: {
    organizationId: string;
    publishingJobId: string;
    assetId: string;
    ordinal: number;
  }) {
    return this._repository.attachJobAsset(input);
  }

  async openDirectJobAsset(input: {
    organizationId: string;
    publishingJobId: string;
    assetId: string;
    tupleId: string;
    range?: { start: number; end: number } | null;
  }) {
    const link = await this._repository.getJobAsset(
      input.organizationId,
      input.publishingJobId,
      input.assetId
    );
    if (
      !link ||
      link.asset.state !== 'READY' ||
      link.asset.deletedAt ||
      link.publishingJob.organizationId !== input.organizationId
    ) {
      throw new Error('bulk_job_asset_not_found');
    }
    this.tupleForJob({
      tupleId: input.tupleId,
      transportMode: 'direct_upload',
      provider: link.publishingJob.provider,
    });
    return this.getStorage().open(link.asset.storageKey, input.range || null);
  }

  async issueProviderPullGrant(input: {
    organizationId: string;
    publishingJobId: string;
    assetId: string;
    tupleId: string;
    now?: Date;
  }) {
    const link = await this._repository.getJobAsset(
      input.organizationId,
      input.publishingJobId,
      input.assetId
    );
    if (
      !link ||
      link.asset.state !== 'READY' ||
      link.asset.deletedAt ||
      link.publishingJob.organizationId !== input.organizationId
    ) {
      throw new Error('bulk_job_asset_not_found');
    }
    const tuple = this.tupleForJob({
      tupleId: input.tupleId,
      transportMode: 'provider_pull',
      provider: link.publishingJob.provider,
    });
    if (!tuple.providerFetchPolicy) {
      throw new Error('bulk_provider_fetch_policy_missing');
    }
    const now = input.now || new Date();
    const grantId = `pmg_${randomBytes(16).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const capability = `${grantId}.${secret}`;
    const expiresAt = new Date(
      now.getTime() + tuple.providerFetchPolicy.ttlSeconds * 1_000
    );
    await this._repository.createGrant({
      id: grantId,
      organizationId: input.organizationId,
      publishingJobId: input.publishingJobId,
      assetId: input.assetId,
      capabilityTupleId: tuple.id,
      tokenHash: hashProviderMediaCapability(capability),
      expiresAt,
      maxFetches: tuple.providerFetchPolicy.maxFetches,
    });
    Sentry.metrics.count('provider_media_grant_issued', 1);
    this.logger.log({
      event: 'provider_media_grant_issued',
      organizationId: input.organizationId,
      publishingJobId: input.publishingJobId,
      assetId: input.assetId,
      grantId,
      tupleId: tuple.id,
      expiresAt,
      maxFetches: tuple.providerFetchPolicy.maxFetches,
    });
    return {
      grantId,
      url: providerMediaUrl(capability),
      expiresAt,
      fetchPolicy: tuple.providerFetchPolicy,
    };
  }

  async issueDirectUploadGrant(input: {
    organizationId: string;
    publishingJobId: string;
    assetId: string;
    tupleId: string;
    now?: Date;
  }) {
    const link = await this._repository.getJobAsset(
      input.organizationId,
      input.publishingJobId,
      input.assetId
    );
    if (
      !link ||
      link.asset.state !== 'READY' ||
      link.asset.deletedAt ||
      link.publishingJob.organizationId !== input.organizationId
    ) {
      throw new Error('bulk_job_asset_not_found');
    }
    const tuple = this.tupleForJob({
      tupleId: input.tupleId,
      transportMode: 'direct_upload',
      provider: link.publishingJob.provider,
    });
    const now = input.now || new Date();
    const grantId = `pmg_${randomBytes(16).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const capability = `${grantId}.${secret}`;
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1_000);
    await this._repository.createGrant({
      id: grantId,
      organizationId: input.organizationId,
      publishingJobId: input.publishingJobId,
      assetId: input.assetId,
      capabilityTupleId: tuple.id,
      tokenHash: hashProviderMediaCapability(capability),
      expiresAt,
      maxFetches: 512,
    });
    Sentry.metrics.count('direct_private_media_grant_issued', 1);
    this.logger.log({
      event: 'direct_private_media_grant_issued',
      organizationId: input.organizationId,
      publishingJobId: input.publishingJobId,
      assetId: input.assetId,
      grantId,
      tupleId: tuple.id,
      expiresAt,
      maxFetches: 512,
    });
    return {
      grantId,
      url: providerMediaUrl(capability),
      expiresAt,
      fetchPolicy: {
        ttlSeconds: 15 * 60,
        maxFetches: 512,
        allowHead: true,
        allowRange: true,
      },
    };
  }

  async hydratePublishingValue(input: {
    organizationId: string;
    postId: string;
    value: unknown;
  }): Promise<{ value: any; replacements: Array<{ hydrated: string; opaque: string }> }> {
    const paths = new Set<string>();
    const collect = (value: unknown, depth = 0) => {
      if (depth > 20) throw new Error('bulk_private_media_value_too_deep');
      if (typeof value === 'string') {
        if (parseOpaqueBulkPrivateMediaPath(value)) paths.add(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => collect(item, depth + 1));
        return;
      }
      if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((item) =>
          collect(item, depth + 1)
        );
      }
    };
    collect(input.value);
    const replacements: Array<{ hydrated: string; opaque: string }> = [];
    for (const opaque of paths) {
      const assetId = parseOpaqueBulkPrivateMediaPath(opaque)!;
      const link = await this._repository.getPostJobAsset({
        organizationId: input.organizationId,
        postId: input.postId,
        assetId,
      });
      const campaignJob = link?.publishingJob.bulkCampaignJob;
      if (
        !link ||
        !campaignJob ||
        campaignJob.organizationId !== input.organizationId ||
        campaignJob.assetId !== assetId ||
        link.asset.state !== 'READY' ||
        link.asset.deletedAt
      ) {
        throw new Error('bulk_private_media_job_link_invalid');
      }
      const tuple = findBulkSchedulerTuple(campaignJob.capabilityTupleId);
      if (!tuple) throw new Error('bulk_private_media_tuple_unknown');
      const grant =
        tuple.transportMode === 'provider_pull'
          ? await this.issueProviderPullGrant({
              organizationId: input.organizationId,
              publishingJobId: link.publishingJobId,
              assetId,
              tupleId: tuple.id,
            })
          : await this.issueDirectUploadGrant({
              organizationId: input.organizationId,
              publishingJobId: link.publishingJobId,
              assetId,
              tupleId: tuple.id,
            });
      replacements.push({
        opaque,
        hydrated:
          tuple.transportMode === 'provider_pull'
            ? grant.url
            : privateAdapterMediaPath(grant.url),
      });
    }
    const byOpaque = new Map(replacements.map((item) => [item.opaque, item.hydrated]));
    const replace = (value: unknown, depth = 0): any => {
      if (depth > 20) throw new Error('bulk_private_media_value_too_deep');
      if (typeof value === 'string') return byOpaque.get(value) || value;
      if (Array.isArray(value)) return value.map((item) => replace(item, depth + 1));
      if (value && typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(([key, item]) => [
            key,
            replace(item, depth + 1),
          ])
        );
      }
      return value;
    };
    return { value: replace(input.value), replacements };
  }

  private accessError(
    capability: unknown,
    code: string,
    reason: string,
    status: number,
    context: Record<string, unknown> = {}
  ) {
    Sentry.metrics.count('provider_media_fetch_rejected', 1);
    this.logger.warn({
      event: 'provider_media_fetch_rejected',
      capabilityFingerprint: fingerprintProviderMediaCapability(capability),
      code,
      reason,
      ...context,
    });
    return new ProviderMediaException(code, reason, status);
  }

  private async rejectKnown(
    input: {
      grant: any;
      capability: string;
      method: ProviderMediaMethod;
      requestedRange?: string;
      code: string;
      reason: string;
      status: number;
      now: Date;
    }
  ): Promise<never> {
    try {
      await this._repository.recordRejectedFetch({
        eventId: `pmf_${randomBytes(16).toString('hex')}`,
        grantId: input.grant.id,
        organizationId: input.grant.organizationId,
        method: input.method,
        requestedRange: input.requestedRange,
        statusCode: input.status,
        code: input.code,
        reason: input.reason,
        now: input.now,
      });
    } catch (error) {
      this.logger.error({
        event: 'provider_media_rejection_ledger_failed',
        grantId: input.grant.id,
        organizationId: input.grant.organizationId,
        code: 'provider_media_fetch_ledger_unavailable',
        reason: error instanceof Error ? error.message : String(error),
      });
      Sentry.metrics.count('provider_media_fetch_ledger_failed', 1);
    }
    throw this.accessError(
      input.capability,
      input.code,
      input.reason,
      input.status,
      { grantId: input.grant.id, organizationId: input.grant.organizationId }
    );
  }

  async openProviderMedia(input: {
    capability: unknown;
    method: ProviderMediaMethod;
    rangeHeader?: unknown;
    internalToken?: unknown;
    now?: Date;
  }): Promise<{
    statusCode: number;
    contentType: string;
    contentLength: number;
    contentRange?: string;
    etag?: string;
    filename: string;
    body: Readable | null;
    completeServed: () => Promise<void>;
    completeFailed: (reason?: string) => Promise<void>;
  }> {
    const capability =
      typeof input.capability === 'string' ? input.capability : '';
    const parts = parseProviderMediaCapability(capability);
    if (!parts) {
      throw this.accessError(
        capability,
        'provider_media_capability_malformed',
        'The provider media capability format is invalid.',
        HttpStatus.NOT_FOUND
      );
    }
    const grant = await this._repository.findGrant(parts.grantId);
    if (!grant) {
      throw this.accessError(
        capability,
        'provider_media_grant_not_found',
        'No provider media grant matches this capability.',
        HttpStatus.NOT_FOUND
      );
    }
    const now = input.now || new Date();
    const tokenHash = hashProviderMediaCapability(capability);
    if (!safeEqualHex(tokenHash, grant.tokenHash)) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_capability_tampered',
        reason: 'The provider media capability signature does not match.',
        status: HttpStatus.NOT_FOUND,
        now,
      });
    }
    if (grant.revokedAt) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_grant_revoked',
        reason: 'The provider media grant was revoked.',
        status: HttpStatus.GONE,
        now,
      });
    }
    if (grant.expiresAt.getTime() <= now.getTime()) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_grant_expired',
        reason: 'The provider media grant expired.',
        status: HttpStatus.GONE,
        now,
      });
    }
    if (grant.maxFetches !== null && grant.fetchCount >= grant.maxFetches) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_fetch_limit_reached',
        reason: 'The provider media grant reached its fetch limit.',
        status: HttpStatus.GONE,
        now,
      });
    }
    const tuple = findBulkSchedulerTuple(grant.capabilityTupleId);
    const fetchPolicy =
      tuple?.transportMode === 'provider_pull'
        ? tuple.providerFetchPolicy
        : tuple?.transportMode === 'direct_upload'
        ? { allowHead: true, allowRange: true }
        : null;
    if (
      !tuple ||
      !fetchPolicy ||
      !tuple.privateTransportReady ||
      tuple.provider !== grant.jobAsset.publishingJob.provider ||
      operationallyKilled(tuple)
    ) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_tuple_disabled',
        reason: 'The exact provider media tuple is disabled.',
        status: HttpStatus.GONE,
        now,
      });
    }
    if (
      tuple.transportMode === 'direct_upload' &&
      !safeEqualSecret(input.internalToken, providerMediaInternalToken())
    ) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_internal_auth_invalid',
        reason: 'The direct-upload media request lacks valid internal adapter authorization.',
        status: HttpStatus.NOT_FOUND,
        now,
      });
    }
    if (input.method === 'HEAD' && !fetchPolicy.allowHead) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_head_not_allowed',
        reason: 'HEAD is not allowed by this tuple fetch policy.',
        status: HttpStatus.METHOD_NOT_ALLOWED,
        now,
      });
    }
    let range: { start: number; end: number } | null;
    try {
      range = parseProviderMediaRange(
        input.rangeHeader,
        grant.jobAsset.asset.byteLength,
        fetchPolicy.allowRange
      );
    } catch (error) {
      const code =
        error instanceof Error ? error.message : 'provider_media_range_invalid';
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        requestedRange:
          typeof input.rangeHeader === 'string'
            ? input.rangeHeader.slice(0, 100)
            : undefined,
        code,
        reason: 'The requested provider media byte range is invalid.',
        status: HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
        now,
      });
    }

    const eventId = `pmf_${randomBytes(16).toString('hex')}`;
    const event = await this._repository.claimFetch({
      eventId,
      grantId: grant.id,
      organizationId: grant.organizationId,
      tokenHash,
      expectedFetchCount: grant.fetchCount,
      method: input.method,
      requestedRange:
        typeof input.rangeHeader === 'string'
          ? input.rangeHeader.slice(0, 100)
          : undefined,
      now,
    });
    if (!event) {
      return this.rejectKnown({
        grant,
        capability,
        method: input.method,
        code: 'provider_media_grant_race',
        reason: 'The provider media grant changed while this fetch was authorized.',
        status: HttpStatus.CONFLICT,
        now,
      });
    }

    let opened:
      | {
          contentLength: number;
          contentType: string;
          etag?: string;
          contentRange?: string;
          body: Readable | null;
        }
      | undefined;
    try {
      if (input.method === 'HEAD') {
        const head = await this.getStorage().head(
          grant.jobAsset.asset.storageKey
        );
        opened = range
          ? {
              ...head,
              contentLength: range.end - range.start + 1,
              contentRange: `bytes ${range.start}-${range.end}/${head.contentLength}`,
              body: null,
            }
          : { ...head, body: null };
      } else {
        const read = await this.getStorage().open(
          grant.jobAsset.asset.storageKey,
          range
        );
        opened = { ...read, body: read.body };
      }
      if (
        opened.contentType !== grant.jobAsset.asset.mimeType ||
        (input.method === 'HEAD' &&
          opened.contentLength !== grant.jobAsset.asset.byteLength)
      ) {
        throw new Error('Private media storage metadata does not match the asset ledger.');
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Private media read failed.';
      await this._repository.completeFetch({
        eventId,
        organizationId: grant.organizationId,
        grantId: grant.id,
        state: 'FAILED',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        bytesServed: 0,
        code: 'provider_media_storage_unavailable',
        reason: reason.slice(0, 1_000),
        now: new Date(),
      });
      Sentry.metrics.count('provider_media_fetch_failed', 1);
      this.logger.error({
        event: 'provider_media_fetch_failed',
        organizationId: grant.organizationId,
        publishingJobId: grant.publishingJobId,
        assetId: grant.assetId,
        grantId: grant.id,
        eventId,
        code: 'provider_media_storage_unavailable',
        reason,
      });
      throw new ProviderMediaException(
        'provider_media_storage_unavailable',
        reason,
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const statusCode = range ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK;
    let completed = false;
    const finish = async (
      state: 'SERVED' | 'FAILED',
      finishStatus: number,
      bytesServed: number,
      code: string,
      reason: string
    ) => {
      if (completed) return;
      completed = true;
      const result = await this._repository.completeFetch({
        eventId,
        organizationId: grant.organizationId,
        grantId: grant.id,
        state,
        statusCode: finishStatus,
        bytesServed,
        code,
        reason,
        now: new Date(),
      });
      if (result.count !== 1) {
        throw new Error('Provider media fetch event was not in AUTHORIZED state.');
      }
      Sentry.metrics.count(
        state === 'SERVED' ? 'provider_media_fetch_served' : 'provider_media_fetch_failed',
        1
      );
      const logRecord = {
        event:
          state === 'SERVED'
            ? 'provider_media_fetch_served'
            : 'provider_media_fetch_failed',
        organizationId: grant.organizationId,
        publishingJobId: grant.publishingJobId,
        assetId: grant.assetId,
        grantId: grant.id,
        eventId,
        method: input.method,
        statusCode: finishStatus,
        bytesServed,
        code,
      };
      if (state === 'SERVED') this.logger.log(logRecord);
      else this.logger.error(logRecord);
    };
    return {
      statusCode,
      contentType: opened.contentType,
      contentLength: opened.contentLength,
      contentRange: opened.contentRange,
      etag: opened.etag,
      filename: safeProviderMediaFilename(grant.jobAsset.asset.originalName),
      body: opened.body,
      completeServed: () =>
        finish(
          'SERVED',
          statusCode,
          input.method === 'HEAD' ? 0 : opened!.contentLength,
          'provider_media_fetch_served',
          'The provider media fetch completed successfully.'
        ),
      completeFailed: (reason = 'The provider disconnected before the media stream completed.') =>
        finish(
          'FAILED',
          HttpStatus.SERVICE_UNAVAILABLE,
          0,
          'provider_media_stream_interrupted',
          reason.slice(0, 1_000)
        ),
    };
  }

  revokeJobGrants(input: {
    organizationId: string;
    publishingJobId: string;
    code: string;
    now?: Date;
  }) {
    if (!/^[a-z0-9_]{1,120}$/.test(input.code)) {
      throw new Error('Provider media revocation code is invalid.');
    }
    return this._repository.revokeJobGrants({
      organizationId: input.organizationId,
      publishingJobId: input.publishingJobId,
      code: input.code,
      now: input.now || new Date(),
    });
  }
}
