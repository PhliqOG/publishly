import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CreationMethod } from '@prisma/client';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { PostCreationRequestRepository } from './post-creation-request.repository';
import {
  allocatePostCreation,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  postCreationRequestHash,
  sha256,
  validateIdempotencyKey,
} from '@gitroom/nestjs-libraries/reliability/post.creation.idempotency';
import { normalizePostFailure } from '@gitroom/nestjs-libraries/reliability/post.failure';

export class IdempotencyInProgressException extends ConflictException {
  constructor(public readonly retryAfterSeconds: number) {
    super({
      failureClass: 'recoverable',
      code: 'idempotency_request_in_progress',
      reason:
        'A request with this Idempotency-Key is still being processed. Retry with the same key after the indicated delay.',
      message:
        'A request with this Idempotency-Key is still being processed. Retry with the same key after the indicated delay.',
      retryAfterSeconds,
    });
  }
}

export type IdempotentPostCreationResult<T> = {
  value: T;
  replayed: boolean;
};

@Injectable()
export class PostCreationIdempotencyService {
  private readonly logger = new Logger(PostCreationIdempotencyService.name);

  constructor(private _repository: PostCreationRequestRepository) {}

  async execute<T>(input: {
    organizationId: string;
    idempotencyKey: unknown;
    body: CreatePostDto;
    creationMethod: CreationMethod;
    operation: (allocatedBody: CreatePostDto) => Promise<T>;
  }): Promise<IdempotentPostCreationResult<T>> {
    if (!validateIdempotencyKey(input.idempotencyKey)) {
      const reason = `Idempotency-Key is required and must be ${IDEMPOTENCY_KEY_MIN_LENGTH}-${IDEMPOTENCY_KEY_MAX_LENGTH} characters using letters, numbers, dot, underscore, colon, or hyphen.`;
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'invalid_idempotency_key',
        reason,
        message: reason,
      });
    }

    const keyHash = sha256(input.idempotencyKey);
    const requestHash = postCreationRequestHash(
      input.body,
      input.creationMethod
    );
    const prepared = allocatePostCreation(
      input.organizationId,
      keyHash,
      input.body
    );
    const claim = await this._repository.claim({
      organizationId: input.organizationId,
      keyHash,
      requestHash,
      creationMethod: input.creationMethod,
      allocation: prepared.allocation,
    });

    if (claim.type === 'mismatch') {
      const reason =
        'This Idempotency-Key was already used for a different post creation request.';
      throw new ConflictException({
        failureClass: 'data_problem',
        code: 'idempotency_key_reused',
        reason,
        message: reason,
      });
    }
    if (claim.type === 'in_progress') {
      throw new IdempotencyInProgressException(claim.retryAfterSeconds);
    }
    if (claim.type === 'replay') {
      return { value: claim.response as T, replayed: true };
    }

    try {
      const value = await input.operation(prepared.body);
      await this._repository.complete(
        claim.requestId,
        claim.leaseToken,
        value
      );
      return { value, replayed: false };
    } catch (error) {
      const failure = normalizePostFailure({ error });
      try {
        await this._repository.fail(
          claim.requestId,
          claim.leaseToken,
          failure
        );
      } catch (ledgerError) {
        this.logger.error({
          event: 'post.creation.idempotency_failure_write_failed',
          requestId: claim.requestId,
          failureCode: failure.code,
          failureReason: failure.reason,
          ledgerReason: normalizePostFailure({ error: ledgerError }).reason,
        });
        throw ledgerError;
      }
      throw error;
    }
  }
}
