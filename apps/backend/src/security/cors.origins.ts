function canonicalWwwOrigin(origin: string | undefined) {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    if (url.hostname.startsWith('www.')) return undefined;
    url.hostname = `www.${url.hostname}`;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function trustedFrontendOrigins(
  frontendUrl: string | undefined,
  mainUrl: string | undefined
) {
  return Array.from(
    new Set(
      [
        frontendUrl,
        canonicalWwwOrigin(frontendUrl),
        'http://localhost:6274',
        mainUrl,
      ].filter((origin): origin is string => Boolean(origin))
    )
  );
}
