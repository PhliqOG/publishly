export function publicApiUrl(
  path: string,
  configuredOrigin = process.env.NEXT_PUBLIC_BACKEND_URL
) {
  const origin = (configuredOrigin?.trim() || '/api').replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}
