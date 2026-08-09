import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const { url } = context.switchToHttp().getRequest<Request>();
    // Every public API route is rate limited per organization. The app's own
    // frontend traffic (cookie auth) stays unthrottled.
    if (url.includes('/public/v1')) {
      return super.canActivate(context);
    }

    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    // Separate buckets so heavy post creation cannot starve reads and
    // vice versa; each bucket gets the configured hourly limit.
    const bucket =
      req.method === 'POST' && req.url.indexOf('/posts') > -1
        ? 'posts'
        : req.method === 'GET'
        ? 'read'
        : 'write';
    return req.org.id + '_' + bucket;
  }
}
