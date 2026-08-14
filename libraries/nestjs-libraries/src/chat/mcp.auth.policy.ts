import { checkAuth } from './auth.context';
import { getAuth, getScopes } from './async.storage';
import { McpToolError } from './mcp.tool.error';

export type McpRequiredScope =
  | 'posts:read'
  | 'posts:write'
  | 'integrations:read';

const MCP_SCOPE_EQUIVALENTS: Record<McpRequiredScope, string[]> = {
  'posts:read': ['posts:read', 'mcp:read'],
  'posts:write': ['posts:write', 'mcp:write'],
  'integrations:read': ['integrations:read', 'mcp:read'],
};

function requestContextOrganization(context: any) {
  const value = context?.requestContext?.get?.('organization');
  if (!value) return undefined;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function requireMcpOrganization(
  inputData: unknown,
  context: any,
  requiredScope: McpRequiredScope
) {
  checkAuth(inputData, context);
  const stored = getAuth<any>();
  const organization = stored || requestContextOrganization(context);
  if (!organization?.id) {
    throw new McpToolError(
      'mcp_authentication_required',
      'Authenticate the Publishly MCP connection before calling this tool.',
      'user_action_needed'
    );
  }

  const scopes = getScopes();
  const isMcpRequest = Boolean(context?.mcp) || Boolean(stored);
  if (
    isMcpRequest &&
    (!scopes ||
      (!scopes.includes('*') &&
        !MCP_SCOPE_EQUIVALENTS[requiredScope].some((scope) =>
          scopes.includes(scope)
        )))
  ) {
    throw new McpToolError(
      'mcp_scope_required',
      `This tool requires ${requiredScope} (or the corresponding MCP OAuth scope).`,
      'user_action_needed'
    );
  }
  return organization;
}
