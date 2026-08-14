import {
  Controller,
  Get,
  Head,
  Headers,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { ProviderMediaService } from '@gitroom/nestjs-libraries/database/prisma/bulk-scheduler/provider-media.service';
import { PROVIDER_MEDIA_INTERNAL_HEADER } from '@gitroom/helpers/bulk-scheduler/provider-media.contract';

@Controller('/provider-media')
export class ProviderMediaController {
  constructor(private _providerMedia: ProviderMediaService) {}

  @Head(['/:capability/video.mp4', '/:capability'])
  head(
    @Param('capability') capability: string,
    @Headers('range') range: string | undefined,
    @Headers(PROVIDER_MEDIA_INTERNAL_HEADER) internalToken: string | undefined,
    @Res() response: Response
  ) {
    return this.respond(capability, 'HEAD', range, internalToken, response);
  }

  @Get(['/:capability/video.mp4', '/:capability'])
  get(
    @Param('capability') capability: string,
    @Headers('range') range: string | undefined,
    @Headers(PROVIDER_MEDIA_INTERNAL_HEADER) internalToken: string | undefined,
    @Req() _request: Request,
    @Res() response: Response
  ) {
    return this.respond(capability, 'GET', range, internalToken, response);
  }

  private async respond(
    capability: string,
    method: 'GET' | 'HEAD',
    range: string | undefined,
    internalToken: string | undefined,
    response: Response
  ) {
    const media = await this._providerMedia.openProviderMedia({
      capability,
      method,
      rangeHeader: range,
      internalToken,
    });
    response.status(media.statusCode);
    response.setHeader('Content-Type', media.contentType);
    response.setHeader('Content-Length', String(media.contentLength));
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${media.filename}"`
    );
    if (media.contentRange) {
      response.setHeader('Content-Range', media.contentRange);
    }
    if (media.etag) response.setHeader('ETag', media.etag);

    if (method === 'HEAD') {
      await media.completeServed();
      return response.end();
    }
    if (!media.body) {
      await media.completeFailed('Private media GET returned no stream.');
      return response.status(503).end();
    }
    try {
      await pipeline(media.body, response);
      await media.completeServed();
    } catch (error) {
      await media.completeFailed(
        error instanceof Error
          ? error.message
          : 'The provider media stream was interrupted.'
      );
      if (!response.headersSent) response.status(503).end();
      else response.destroy();
    }
  }
}
