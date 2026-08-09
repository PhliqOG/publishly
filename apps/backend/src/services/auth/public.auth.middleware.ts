import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import {
  ApiKeysService,
} from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';
import { setSentryUserContext } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';

// Coarse scope requirements per public API route. Matched in order; first hit
// wins. Routes not listed require the wildcard scope, so a narrowly scoped key
// can never reach endpoints added after it was minted.
const SCOPE_RULES: Array<{
  methods: string[];
  pattern: RegExp;
  scope: string;
}> = [
  { methods: ['POST'], pattern: /\/upload/, scope: 'media:write' },
  { methods: ['GET'], pattern: /\/posts|\/find-slot|\/groups/, scope: 'posts:read' },
  { methods: ['POST', 'PUT', 'DELETE'], pattern: /\/posts/, scope: 'posts:write' },
  { methods: ['DELETE'], pattern: /\/integrations/, scope: 'integrations:write' },
  {
    methods: ['GET'],
    pattern: /\/integrations|\/is-connected|\/social\/|\/integration-settings/,
    scope: 'integrations:read',
  },
  { methods: ['GET'], pattern: /\/notifications/, scope: 'notifications:read' },
  { methods: ['POST'], pattern: /\/generate-video|\/video\//, scope: 'video:write' },
];

export function requiredScopeFor(method: string, url: string): string {
  const rule = SCOPE_RULES.find(
    (r) => r.methods.includes(method) && r.pattern.test(url)
  );
  return rule?.scope || '*';
}

@Injectable()
export class PublicAuthMiddleware implements NestMiddleware {
  constructor(
    private _organizationService: OrganizationService,
    private _oauthService: OAuthService,
    private _apiKeysService: ApiKeysService
  ) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const auth = (req.headers.authorization ||
      req.headers.Authorization) as string;
    if (!auth) {
      res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'No API Key found' });
      return;
    }
    try {
      if (auth.startsWith('pos_')) {
        const authorization = await this._oauthService.getOrgByOAuthToken(auth);
        if (!authorization) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid OAuth token' });
          return;
        }

        const org = authorization.organization;
        if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        // @ts-ignore
        req.org = { ...org, users: [{ users: { role: 'ADMIN' } }] };
      } else if (auth.startsWith('pub_')) {
        // Publishly scoped keys: stored hashed, validated by hash lookup.
        const validated = await this._apiKeysService.validateKey(auth);
        if (!validated) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid or revoked API key' });
          return;
        }

        const org = validated.organization;
        if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        const needed = requiredScopeFor(req.method, req.originalUrl || req.url);
        if (!ApiKeysService.scopeAllows(validated.scopes, needed)) {
          res.status(HttpStatus.FORBIDDEN).json({
            msg: `API key lacks the required scope "${needed}"`,
          });
          return;
        }

        // @ts-ignore
        req.org = { ...org, users: [{ users: { role: 'ADMIN' } }] };
        // @ts-ignore
        req.apiKeyId = validated.keyId;
      } else {
        // Legacy organization key (reversible at-rest storage) - kept for
        // backward compatibility; new keys are issued as pub_ scoped keys.
        const org = await this._organizationService.getOrgByApiKey(auth);
        if (!org) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'Invalid API key' });
          return;
        }

        if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
          res
            .status(HttpStatus.UNAUTHORIZED)
            .json({ msg: 'No subscription found' });
          return;
        }

        // @ts-ignore
        req.org = { ...org, users: [{ users: { role: 'ADMIN' } }] };
      }
    } catch (err) {
      throw new HttpForbiddenException();
    }

    setSentryUserContext({
      // @ts-ignore
      orgId: req.org.id,
      // @ts-ignore
      paymentId: req.org.paymentId,
    });
    next();
  }
}
