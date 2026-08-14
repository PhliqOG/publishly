import { createHash } from 'node:crypto';

const CAPABILITY_PATTERN = /^(pmg_[a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/;
const OPAQUE_PRIVATE_MEDIA_PATTERN =
  /^bulk-private:\/\/(bulk_asset_[a-f0-9]{32})\/video\.mp4$/;
const ADAPTER_PRIVATE_MEDIA_PATTERN =
  /^publishly-private:\/\/([A-Za-z0-9_-]{20,2048})\/video\.mp4$/;

export const PROVIDER_MEDIA_INTERNAL_HEADER =
  'x-publishly-private-media' as const;

export type ProviderMediaCapabilityParts = {
  grantId: string;
  secret: string;
};

export type ProviderMediaByteRange = { start: number; end: number } | null;

export function parseProviderMediaCapability(
  value: unknown
): ProviderMediaCapabilityParts | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const match = CAPABILITY_PATTERN.exec(value);
  return match ? { grantId: match[1], secret: match[2] } : null;
}

export function hashProviderMediaCapability(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function fingerprintProviderMediaCapability(value: unknown) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : String(value), 'utf8')
    .digest('hex')
    .slice(0, 12);
}

export function redactProviderMediaSecrets(value: unknown) {
  return String(value ?? '')
    .replace(
      /publishly-private:\/\/[A-Za-z0-9_-]{20,2048}\/video\.mp4/gi,
      'publishly-private://[redacted]/video.mp4'
    )
    .replace(
      /(\/provider-media\/)(?:pmg_[a-f0-9]{32}\.[A-Za-z0-9_-]{1,100})/gi,
      '$1[redacted]'
    )
    .replace(
      /("?(?:providerMediaUrl|provider_media_url|video_url|file_url)"?\s*[:=]\s*"?)(https?:\/\/[^\s"']*\/provider-media\/)[^\s"'&,}]+/gi,
      '$1$2[redacted]'
    );
}

export function opaqueBulkPrivateMediaPath(assetId: string) {
  if (!/^bulk_asset_[a-f0-9]{32}$/.test(assetId)) {
    throw new Error('Invalid Bulk Scheduler asset identity.');
  }
  return `bulk-private://${assetId}/video.mp4`;
}

export function parseOpaqueBulkPrivateMediaPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 100) return null;
  return OPAQUE_PRIVATE_MEDIA_PATTERN.exec(value)?.[1] || null;
}

export function privateAdapterMediaPath(url: string) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Private adapter media requires an HTTP capability URL.');
  }
  return `publishly-private://${Buffer.from(url, 'utf8').toString(
    'base64url'
  )}/video.mp4`;
}

export function providerMediaInternalToken(environment = process.env) {
  const token = String(environment.BULK_PRIVATE_INTERNAL_TOKEN || '').trim();
  if (token.length < 32 || /[\r\n]/.test(token)) {
    throw new Error(
      'BULK_PRIVATE_INTERNAL_TOKEN must contain at least 32 characters without line breaks.'
    );
  }
  return token;
}

export function parsePrivateAdapterMediaPath(
  value: unknown,
  environment = process.env
) {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const encoded = ADAPTER_PRIVATE_MEDIA_PATTERN.exec(value)?.[1];
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = new URL(decoded);
    const expectedBase = new URL(providerMediaBaseUrl(environment));
    const expectedPathPrefix = `${expectedBase.pathname.replace(/\/$/, '')}/provider-media/`;
    const mediaPath = parsed.pathname.slice(expectedPathPrefix.length);
    const capability = mediaPath.endsWith('/video.mp4')
      ? mediaPath.slice(0, -'/video.mp4'.length)
      : mediaPath;
    if (
      parsed.origin !== expectedBase.origin ||
      !parsed.pathname.startsWith(expectedPathPrefix) ||
      parsed.search ||
      parsed.hash ||
      !parseProviderMediaCapability(capability)
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function privateAdapterMediaRequest(
  value: string,
  environment = process.env
) {
  const url = parsePrivateAdapterMediaPath(value, environment);
  if (!url) return { url: value, headers: {} as Record<string, string> };
  return {
    url,
    headers: {
      [PROVIDER_MEDIA_INTERNAL_HEADER]: providerMediaInternalToken(environment),
    },
  };
}

export function parseProviderMediaRange(
  header: unknown,
  totalBytes: number,
  allowed: boolean
): ProviderMediaByteRange {
  if (header === undefined || header === null || header === '') return null;
  if (!allowed) throw new Error('provider_media_range_not_allowed');
  if (
    typeof header !== 'string' ||
    header.length > 100 ||
    header.includes(',') ||
    !Number.isSafeInteger(totalBytes) ||
    totalBytes < 1
  ) {
    throw new Error('provider_media_range_invalid');
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new Error('provider_media_range_invalid');
  }
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) {
      throw new Error('provider_media_range_invalid');
    }
    start = Math.max(0, totalBytes - suffix);
    end = totalBytes - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalBytes - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= totalBytes ||
    end < start
  ) {
    throw new Error('provider_media_range_unsatisfiable');
  }
  return { start, end: Math.min(end, totalBytes - 1) };
}

export function providerMediaBaseUrl(environment = process.env) {
  const raw =
    environment.PROVIDER_MEDIA_BASE_URL ||
    environment.NEXT_PUBLIC_BACKEND_URL ||
    '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PROVIDER_MEDIA_BASE_URL must be an absolute URL.');
  }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) {
    throw new Error('PROVIDER_MEDIA_BASE_URL must use HTTPS outside local development.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('PROVIDER_MEDIA_BASE_URL cannot contain credentials, query, or fragment.');
  }
  return url.toString().replace(/\/$/, '');
}

export function providerMediaUrl(capability: string, environment = process.env) {
  if (!parseProviderMediaCapability(capability)) {
    throw new Error('Cannot build a URL for an invalid provider media capability.');
  }
  // Keep an explicit video filename in the provider-facing URL. Existing
  // adapters infer media kind from the URL extension before issuing a fetch;
  // Content-Type alone arrives too late for that decision.
  return `${providerMediaBaseUrl(
    environment
  )}/provider-media/${capability}/video.mp4`;
}

export function safeProviderMediaFilename(value: unknown) {
  const leaf = String(value || 'publishly-video.mp4')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  const cleaned = String(leaf || 'publishly-video.mp4')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 160);
  const base = cleaned || 'publishly-video.mp4';
  return base.toLowerCase().endsWith('.mp4') ? base : `${base}.mp4`;
}
