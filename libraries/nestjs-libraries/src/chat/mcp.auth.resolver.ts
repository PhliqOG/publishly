import { ApiKeysService } from '@gitroom/nestjs-libraries/database/prisma/api-keys/api-keys.service';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

export type ResolvedMcpCredential = {
  organization: any;
  scopes: string[];
  kind: 'oauth' | 'api_key' | 'legacy';
};

export async function resolveMcpCredential(
  token: string,
  dependencies: {
    oauthService: OAuthService;
    apiKeysService: ApiKeysService;
    organizationService: OrganizationService;
  }
): Promise<ResolvedMcpCredential | null> {
  if (token.startsWith('pos_')) {
    const authorization = await dependencies.oauthService.getOrgByOAuthToken(
      token
    );
    return authorization
      ? {
          organization: authorization.organization,
          scopes: ['mcp:read', 'mcp:write'],
          kind: 'oauth',
        }
      : null;
  }
  if (token.startsWith('pub_')) {
    const validated = await dependencies.apiKeysService.validateKey(token);
    return validated
      ? {
          organization: validated.organization,
          scopes: validated.scopes,
          kind: 'api_key',
        }
      : null;
  }
  if (process.env.ALLOW_LEGACY_API_KEYS !== 'true') return null;
  const organization = await dependencies.organizationService.getOrgByApiKey(
    token
  );
  return organization
    ? { organization, scopes: ['*'], kind: 'legacy' }
    : null;
}
