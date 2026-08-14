const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function configuredOrigins() {
  return [process.env.FRONTEND_URL, process.env.MAIN_URL]
    .filter(Boolean)
    .flatMap((value) => {
      try {
        return [new URL(value!).origin];
      } catch {
        return [];
      }
    });
}

export function isTrustedCookieRequest(input: {
  method: string;
  origin?: string;
  hasHeaderAuth: boolean;
  hasCookieAuth: boolean;
}) {
  if (
    SAFE_METHODS.has(input.method.toUpperCase()) ||
    input.hasHeaderAuth ||
    !input.hasCookieAuth
  ) {
    return true;
  }
  if (!input.origin) {
    return false;
  }
  try {
    return configuredOrigins().includes(new URL(input.origin).origin);
  } catch {
    return false;
  }
}

export function safeOAuthReturnUrl(
  value: string | undefined,
  options: { allowExternalHttps?: boolean } = {}
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return value;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  const mobileScheme = (process.env.MOBILE_APP_SCHEME || 'publishly')
    .split(':')[0]
    .toLowerCase();
  if (parsed.protocol.toLowerCase() === `${mobileScheme}:`) {
    return parsed.toString();
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return undefined;
  }
  if (options.allowExternalHttps && parsed.protocol === 'https:') {
    return parsed.toString();
  }
  return configuredOrigins().includes(parsed.origin)
    ? parsed.toString()
    : undefined;
}
