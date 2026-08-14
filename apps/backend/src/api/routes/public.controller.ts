import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { TrackService } from '@gitroom/nestjs-libraries/track/track.service';
import { RealIP } from 'nestjs-real-ip';
import { UserAgent } from '@gitroom/nestjs-libraries/user/user.agent';
import { TrackEnum } from '@gitroom/nestjs-libraries/user/track.enum';
import { Request, Response } from 'express';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { AgentGraphInsertService } from '@gitroom/nestjs-libraries/agent/agent.graph.insert.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { Readable, pipeline } from 'stream';
import { promisify } from 'util';
import { OnlyURL } from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { MetaDataDeletionService } from '@gitroom/nestjs-libraries/database/prisma/meta-deletion/meta-data-deletion.service';
import { PublicStatusService } from '@gitroom/nestjs-libraries/database/prisma/public-status/public-status.service';
import { verifyMetaWebhookSignature } from '@gitroom/backend/services/meta-webhook.verifier';

const pump = promisify(pipeline);

@ApiTags('Public')
@Controller('/public')
export class PublicController {
  constructor(
    private _trackService: TrackService,
    private _agentGraphInsertService: AgentGraphInsertService,
    private _postsService: PostsService,
    private _subscriptionService: SubscriptionService,
    private _metaDataDeletionService: MetaDataDeletionService,
    private _publicStatus: PublicStatusService
  ) {}

  @Get('/status')
  async publicStatus(@Res({ passthrough: true }) res: Response) {
    res.setHeader(
      'Cache-Control',
      'public, max-age=30, stale-if-error=300, stale-while-revalidate=30'
    );
    return this._publicStatus.getPublicStatus();
  }

  @Get('/meta/webhooks/instagram')
  @HttpCode(200)
  metaInstagramWebhookVerification(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string
  ) {
    const configuredToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!configuredToken) {
      throw new HttpException('Meta webhook is not configured', 503);
    }
    if (
      mode !== 'subscribe' ||
      !verifyToken ||
      verifyToken !== configuredToken ||
      !challenge
    ) {
      throw new HttpException('Meta webhook verification failed', 403);
    }
    return challenge;
  }

  @Post('/meta/webhooks/instagram')
  @HttpCode(200)
  metaInstagramWebhook(@Req() req: RawBodyRequest<Request>) {
    if (
      !verifyMetaWebhookSignature(
        req.rawBody,
        req.headers['x-hub-signature-256'],
        [process.env.FACEBOOK_APP_SECRET, process.env.INSTAGRAM_APP_SECRET]
      )
    ) {
      throw new HttpException('Invalid Meta webhook signature', 401);
    }
    const payload = req.body as { object?: string; entry?: unknown[] };
    Logger.log(
      JSON.stringify({
        event: 'meta_webhook_received',
        object: payload?.object || 'unknown',
        entryCount: Array.isArray(payload?.entry) ? payload.entry.length : 0,
      }),
      'MetaWebhook'
    );
    // Inbox data is read from the official Conversations API. The webhook is a
    // signed low-latency signal; polling remains the source of truth and avoids
    // persisting duplicated message payloads.
    return { received: true };
  }

  @Post('/meta/data-deletion')
  @HttpCode(200)
  async metaDataDeletion(@Body('signed_request') signedRequest: string) {
    return this._metaDataDeletionService.requestDeletion(signedRequest);
  }

  @Get('/meta/data-deletion/status')
  async metaDataDeletionStatus(@Query('code') code: string) {
    const status = await this._metaDataDeletionService.getStatus(code);
    if (!status) throw new NotFoundException('Deletion request not found');
    return status;
  }
  @Post('/agent')
  async createAgent(@Body() body: { text: string; apiKey: string }) {
    if (
      !body.apiKey ||
      !process.env.AGENT_API_KEY ||
      body.apiKey !== process.env.AGENT_API_KEY
    ) {
      return;
    }
    return this._agentGraphInsertService.newPost(body.text);
  }

  @Get(`/posts/:id`)
  async getPreview(@Param('id') id: string) {
    return (await this._postsService.getPostsRecursively(id, true)).map(
      ({ childrenPost, ...p }) => ({
        ...p,
        ...(p.integration
          ? {
              integration: {
                id: p.integration.id,
                name: p.integration.name,
                picture: p.integration.picture,
                providerIdentifier: p.integration.providerIdentifier,
                profile: p.integration.profile,
              },
            }
          : {}),
      })
    );
  }

  @Get(`/posts/:id/comments`)
  async getComments(@Param('id') postId: string) {
    return { comments: await this._postsService.getComments(postId) };
  }

  @Post('/t')
  async trackEvent(
    @Res() res: Response,
    @Req() req: Request,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
    @Body()
    body: { fbclid?: string; tt: TrackEnum; additional: Record<string, any> }
  ) {
    const uniqueId = req?.cookies?.track || makeId(10);
    const fbclid = req?.cookies?.fbclid || body.fbclid;
    await this._trackService.track(
      uniqueId,
      ip,
      userAgent,
      body.tt,
      body.additional,
      fbclid
    );
    if (!req.cookies.track) {
      res.cookie('track', uniqueId, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
            }
          : {}),
        sameSite: 'none',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    if (body.fbclid && !req.cookies.fbclid) {
      res.cookie('fbclid', body.fbclid, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!process.env.NOT_SECURED
          ? {
              secure: true,
              httpOnly: true,
            }
          : {}),
        sameSite: 'none',
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });
    }

    res.status(200).json({
      track: uniqueId,
    });
  }

  @Post('/modify-subscription')
  async modifySubscription(@Body('params') params: string) {
    try {
      const load = AuthService.verifyJWT(params) as {
        orgId: string;
        billing: 'FREE' | 'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE';
      };

      if (!load || !load.orgId || !load.billing || !pricing[load.billing]) {
        return { success: false };
      }

      await this._subscriptionService.modifySubscriptionByOrg(
        load.orgId,
        load.billing
      );

      return { success: true };
    } catch (err) {
      return { success: false };
    }
  }

  @Get('/stream')
  async streamFile(
    @Query() query: OnlyURL,
    @Res() res: Response,
    @Req() req: Request
  ) {
    const { url } = query;
    if (!url.endsWith('mp4')) {
      return res.status(400).send('Invalid video URL');
    }

    const ac = new AbortController();
    const onClose = () => ac.abort();
    req.on('aborted', onClose);
    res.on('close', onClose);

    // Manually follow redirects so every hop is re-validated against
    // the SSRF blocklist (see GHSA-34w8-5j2v-h6ww). `fetch` defaults to
    // `redirect: 'follow'`, which bypasses the DTO-level URL check.
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let r: globalThis.Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isSafePublicHttpsUrl(currentUrl))) {
        return res.status(400).send('Blocked URL');
      }

      r = await fetch(currentUrl, {
        signal: ac.signal,
        redirect: 'manual',
        // @ts-ignore — undici option, not in lib.dom fetch types
        dispatcher: ssrfSafeDispatcher,
      });

      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get('location');
        if (!location) {
          return res.status(502).send('Redirect without Location');
        }
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return res.status(400).send('Invalid redirect target');
        }
        continue;
      }

      break;
    }

    if (!r) {
      return res.status(502).send('No upstream response');
    }

    if (r.status >= 300 && r.status < 400) {
      return res.status(508).send('Too many redirects');
    }

    if (!r.ok && r.status !== 206) {
      res.status(r.status);
      throw new Error(`Upstream error: ${r.statusText}`);
    }

    const type = r.headers.get('content-type') ?? 'application/octet-stream';
    res.setHeader('Content-Type', type);

    const contentRange = r.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const len = r.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const acceptRanges = r.headers.get('accept-ranges') ?? 'bytes';
    res.setHeader('Accept-Ranges', acceptRanges);

    if (r.status === 206) res.status(206); // Partial Content for range responses

    try {
      await pump(Readable.fromWeb(r.body as any), res);
    } catch (error) {
      const reason =
        error instanceof Error && error.message
          ? error.message
          : 'The upstream media stream ended unexpectedly.';
      console.error({
        event: 'public_media_proxy_stream_failed',
        code: 'media_stream_interrupted',
        reason,
      });
      if (!res.headersSent) {
        return res.status(502).send('Media stream interrupted');
      }
      res.destroy(error instanceof Error ? error : new Error(reason));
    }
  }
}
