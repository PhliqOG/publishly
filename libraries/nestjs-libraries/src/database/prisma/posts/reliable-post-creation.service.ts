import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { CreationMethod } from '@prisma/client';
import { PostsService } from './posts.service';
import { PostCreationIdempotencyService } from './post-creation-idempotency.service';
import { SubscriptionService } from '../subscriptions/subscription.service';

type ClassifiedValidationFailure = {
  failureClass: 'recoverable' | 'user_action_needed' | 'data_problem';
  code: string;
  reason: string;
};

@Injectable()
export class ReliablePostCreationService {
  constructor(
    private _posts: PostsService,
    private _idempotency: PostCreationIdempotencyService,
    private _subscriptions: SubscriptionService
  ) {}

  async create(input: {
    organizationId: string;
    organizationCreatedAt: Date;
    rawBody: any;
    type: 'draft' | 'schedule' | 'now';
    idempotencyKey: unknown;
    creationMethod: CreationMethod;
  }) {
    if (process.env.STRIPE_PUBLISHABLE_KEY) {
      const usage = await this._subscriptions.getSuccessfulPostUsage(
        input.organizationId,
        input.organizationCreatedAt
      );
      if (usage.exhausted) {
        throw new HttpException(
          {
            failureClass: 'user_action_needed',
            code: 'successful_post_quota_exhausted',
            reason:
              'This workspace has used its confirmed-live post allowance for the current billing month.',
            usage,
          },
          HttpStatus.PAYMENT_REQUIRED
        );
      }
    }

    // Resolve every connection inside this workspace and normalize the DTO.
    // The explicit caller type is restored because mapTypeToPost's replacement
    // mode deliberately prevents an existing draft from being reused.
    const body = await this._posts.mapTypeToPost(
      { ...input.rawBody, type: input.type },
      input.organizationId,
      true
    );
    body.type = input.type;

    if (
      process.env.RESTRICT_UPLOAD_DOMAINS &&
      body.posts.some((post) =>
        post.value.some((value) =>
          value.image.some(
            (media) =>
              media.path.indexOf(process.env.RESTRICT_UPLOAD_DOMAINS!) === -1
          )
        )
      )
    ) {
      const reason = `All media must be uploaded through Publishly and use ${process.env.RESTRICT_UPLOAD_DOMAINS}.`;
      throw new BadRequestException({
        failureClass: 'data_problem',
        code: 'media_domain_not_allowed',
        reason,
        message: reason,
      });
    }

    const validation = await this._posts.validatePosts(
      input.organizationId,
      body.posts
    );
    const fail = (
      item: (typeof validation)[number],
      message: string,
      failure?: ClassifiedValidationFailure | null
    ): never => {
      const normalized = failure || {
        failureClass: 'data_problem' as const,
        code: 'post_validation_failed',
        reason: message || 'The post failed provider validation.',
      };
      throw new BadRequestException({
        provider: item.identifier,
        name: item.name,
        failureClass: normalized.failureClass,
        code: normalized.code,
        reason: normalized.reason,
        message: message || normalized.reason,
      });
    };

    for (const item of validation) {
      if (item.emptyContent) {
        fail(
          item,
          'Your post should have at least one character or one image.',
          item.emptyContentFailure
        );
      }
    }

    if (body.type !== 'draft') {
      for (const item of validation) {
        if (!item.valid) {
          fail(
            item,
            item.settingsError || 'Please fix your settings.',
            item.settingsFailure
          );
        }
        if (item.errors !== true) {
          fail(
            item,
            item.errors as string,
            item.preflightFailure || item.mediaFailure
          );
        }
        if (item.tooLong) {
          fail(
            item,
            'The post is too long for this platform.',
            item.tooLongFailure
          );
        }
      }
    }

    return this._idempotency.execute({
      organizationId: input.organizationId,
      idempotencyKey: input.idempotencyKey,
      body,
      creationMethod: input.creationMethod,
      operation: (allocatedBody) =>
        this._posts.createPost(
          input.organizationId,
          allocatedBody,
          input.creationMethod,
          false,
          true
        ),
    });
  }
}
