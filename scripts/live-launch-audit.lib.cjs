'use strict';

const dns = require('node:dns').promises;
const tls = require('node:tls');
const { URL } = require('node:url');

const REQUIRED_PUBLIC_ROUTES = Object.freeze([
  { path: '/', kind: 'page' },
  { path: '/auth', kind: 'page' },
  { path: '/privacy', kind: 'legal' },
  { path: '/terms', kind: 'legal' },
  { path: '/acceptable-use', kind: 'legal' },
  { path: '/data-deletion', kind: 'legal' },
  { path: '/security', kind: 'page' },
  { path: '/status', kind: 'page' },
  { path: '/contact', kind: 'legal' },
  { path: '/source', kind: 'legal' },
  { path: '/platform-review', kind: 'legal' },
  { path: '/robots.txt', kind: 'asset' },
  { path: '/sitemap.xml', kind: 'asset' },
  { path: '/api/health', kind: 'health' },
  { path: '/api/public/status', kind: 'status' },
]);

const PUBLIC_PLACEHOLDER_PATTERNS = Object.freeze([
  /Publishly operator \(local configuration\)/i,
  /Configure NEXT_PUBLIC_[A-Z0-9_]+/i,
  /published at launch/i,
  /\bYOUR_DOMAIN\b/i,
  /\bCHANGE_ME[A-Z0-9_-]*\b/i,
  /your-real-domain/i,
  /draft template/i,
]);

const TEMPLATE_VALUE_PATTERN =
  /(?:change[_-]?me|replace[_-]?me|your[_-](?:org|domain|value)|publish\.example\.com|(?:^|[.@/])example\.com(?:$|[:/]))/i;

function normalizeOrigin(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('A public production origin is required.');
  const withScheme = raw.includes('://') ? raw : `https://${raw}`;
  const parsed = new URL(withScheme);
  if (parsed.protocol !== 'https:') {
    throw new Error('The public production origin must use HTTPS.');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'The public production origin must not include credentials, a port, a path, a query, or a fragment.'
    );
  }
  return parsed.origin;
}

function containsPublicPlaceholder(body) {
  return PUBLIC_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(String(body)));
}

function isTemplateValue(value) {
  return !String(value || '').trim() || TEMPLATE_VALUE_PATTERN.test(String(value));
}

function redactNetworkError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/([?&](?:hub\.verify_token|token|key|secret)=)[^&\s]+/gi, '$1<redacted>')
    .slice(0, 300);
}

function addCheck(checks, issues, input) {
  const check = {
    id: input.id,
    status: input.status,
    evidence: input.evidence,
  };
  checks.push(check);
  if (input.status === 'fail') {
    issues.push({ code: input.code, reason: input.reason });
  }
  return check;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectTls(hostname, timeoutMs = 15_000) {
  return await new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: true,
      },
      () => {
        try {
          const certificate = socket.getPeerCertificate();
          const validTo = new Date(certificate.valid_to);
          resolve({
            authorized: socket.authorized,
            validTo: validTo.toISOString(),
            daysRemaining: Math.floor((validTo.getTime() - Date.now()) / 86_400_000),
          });
        } catch (error) {
          reject(error);
        } finally {
          socket.end();
        }
      }
    );
    socket.setTimeout(timeoutMs, () => {
      socket.destroy(new Error('TLS inspection timed out.'));
    });
    socket.once('error', reject);
  });
}

async function inspectDns(hostname) {
  const [ipv4, ipv6, cname] = await Promise.allSettled([
    dns.resolve4(hostname),
    dns.resolve6(hostname),
    dns.resolveCname(hostname),
  ]);
  const values = (result) => (result.status === 'fulfilled' ? result.value : []);
  return {
    ipv4Count: values(ipv4).length,
    ipv6Count: values(ipv6).length,
    cnameCount: values(cname).length,
  };
}

function headerPolicyIssues(headers) {
  const missing = [];
  if (headers.get('x-content-type-options')?.toLowerCase() !== 'nosniff') {
    missing.push('X-Content-Type-Options=nosniff');
  }
  if (headers.get('x-frame-options')?.toLowerCase() !== 'deny') {
    missing.push('X-Frame-Options=DENY');
  }
  if (!headers.get('referrer-policy')) missing.push('Referrer-Policy');
  if (!headers.get('strict-transport-security')) missing.push('Strict-Transport-Security');
  const csp = headers.get('content-security-policy') || '';
  if (!/frame-ancestors\s+'none'/i.test(csp)) {
    missing.push("Content-Security-Policy frame-ancestors 'none'");
  }
  return missing;
}

function validateHealthBody(body) {
  try {
    const parsed = JSON.parse(body);
    return (
      parsed?.status === 'ok' &&
      parsed?.checks?.database === true &&
      parsed?.checks?.redis === true
    );
  } catch {
    return false;
  }
}

function validateStatusBody(body) {
  try {
    const parsed = JSON.parse(body);
    return Boolean(parsed && typeof parsed === 'object');
  } catch {
    return false;
  }
}

async function auditLiveLaunch({ origin, env = {}, manifest }) {
  const normalizedOrigin = normalizeOrigin(origin);
  const hostname = new URL(normalizedOrigin).hostname;
  const checks = [];
  const issues = [];

  try {
    const dnsEvidence = await inspectDns(hostname);
    const resolved =
      dnsEvidence.ipv4Count + dnsEvidence.ipv6Count + dnsEvidence.cnameCount > 0;
    addCheck(checks, issues, {
      id: 'dns.public-origin',
      status: resolved ? 'pass' : 'fail',
      evidence: dnsEvidence,
      code: 'public_dns_unresolved',
      reason: 'The production hostname did not return an A, AAAA, or CNAME answer.',
    });
  } catch (error) {
    addCheck(checks, issues, {
      id: 'dns.public-origin',
      status: 'fail',
      evidence: { error: redactNetworkError(error) },
      code: 'public_dns_check_failed',
      reason: 'The production hostname DNS check failed.',
    });
  }

  try {
    const tlsEvidence = await inspectTls(hostname);
    const healthy = tlsEvidence.authorized && tlsEvidence.daysRemaining >= 14;
    addCheck(checks, issues, {
      id: 'tls.public-origin',
      status: healthy ? 'pass' : 'fail',
      evidence: tlsEvidence,
      code: 'public_tls_invalid',
      reason: 'The production certificate is untrusted or expires in fewer than 14 days.',
    });
  } catch (error) {
    addCheck(checks, issues, {
      id: 'tls.public-origin',
      status: 'fail',
      evidence: { error: redactNetworkError(error) },
      code: 'public_tls_check_failed',
      reason: 'The production TLS handshake failed.',
    });
  }

  try {
    const response = await fetchWithTimeout(`http://${hostname}/`, {
      redirect: 'manual',
    });
    const location = response.headers.get('location') || '';
    const redirectsToHttps =
      [301, 302, 307, 308].includes(response.status) &&
      location.toLowerCase().startsWith(`https://${hostname.toLowerCase()}`);
    addCheck(checks, issues, {
      id: 'http.redirect-to-https',
      status: redirectsToHttps ? 'pass' : 'fail',
      evidence: { status: response.status, redirectsToHttps },
      code: 'http_not_redirected_to_https',
      reason: 'Plain HTTP does not redirect to the canonical HTTPS origin.',
    });
  } catch (error) {
    addCheck(checks, issues, {
      id: 'http.redirect-to-https',
      status: 'fail',
      evidence: { error: redactNetworkError(error) },
      code: 'http_redirect_check_failed',
      reason: 'The HTTP-to-HTTPS redirect check failed.',
    });
  }

  let homeResponse;
  for (const route of REQUIRED_PUBLIC_ROUTES) {
    const id = `route${route.path.replace(/[^A-Za-z0-9]+/g, '.') || '.home'}`;
    try {
      const response = await fetchWithTimeout(`${normalizedOrigin}${route.path}`, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Publishly-Launch-Audit/1.0' },
      });
      const body = await response.text();
      if (route.path === '/') homeResponse = response;
      const noClientFailure = !/Application error: a client-side exception/i.test(body);
      const noPlaceholder = route.kind !== 'legal' || !containsPublicPlaceholder(body);
      const semanticBody =
        route.kind === 'health'
          ? validateHealthBody(body)
          : route.kind === 'status'
          ? validateStatusBody(body)
          : body.length > 0;
      const passed =
        response.status === 200 && noClientFailure && noPlaceholder && semanticBody;
      addCheck(checks, issues, {
        id,
        status: passed ? 'pass' : 'fail',
        evidence: {
          path: route.path,
          status: response.status,
          noClientFailure,
          noPlaceholder,
          semanticBody,
        },
        code: route.kind === 'legal' && !noPlaceholder
          ? 'public_launch_placeholder_present'
          : 'public_route_not_ready',
        reason:
          route.kind === 'legal' && !noPlaceholder
            ? `${route.path} still renders launch-placeholder content.`
            : `${route.path} is not returning its expected public production response.`,
      });
    } catch (error) {
      addCheck(checks, issues, {
        id,
        status: 'fail',
        evidence: { path: route.path, error: redactNetworkError(error) },
        code: 'public_route_request_failed',
        reason: `${route.path} could not be reached from the launch audit.`,
      });
    }
  }

  if (homeResponse) {
    const missingHeaders = headerPolicyIssues(homeResponse.headers);
    addCheck(checks, issues, {
      id: 'headers.public-origin',
      status: missingHeaders.length ? 'fail' : 'pass',
      evidence: { missingHeaders },
      code: 'public_security_headers_incomplete',
      reason: 'The public origin is missing one or more baseline browser security headers.',
    });
  }

  const launchProviderIds = new Set(
    String(env.PUBLISHLY_REQUIRED_PROVIDERS || 'instagram,tiktok')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  const callbackPaths = [];
  for (const provider of manifest?.providers || []) {
    if (!launchProviderIds.has(provider.id)) continue;
    if (provider.callback) callbackPaths.push(provider.callback);
    callbackPaths.push(...(provider.additionalCallbacks || []));
  }
  for (const callbackPath of [...new Set(callbackPaths)]) {
    try {
      const response = await fetchWithTimeout(`${normalizedOrigin}${callbackPath}`);
      const body = await response.text();
      const passed =
        response.status === 200 &&
        !/Application error: a client-side exception/i.test(body);
      addCheck(checks, issues, {
        id: `callback${callbackPath.replace(/[^A-Za-z0-9]+/g, '.')}`,
        status: passed ? 'pass' : 'fail',
        evidence: { path: callbackPath, status: response.status },
        code: 'oauth_callback_page_not_ready',
        reason: `${callbackPath} is not a healthy public OAuth callback page.`,
      });
    } catch (error) {
      addCheck(checks, issues, {
        id: `callback${callbackPath.replace(/[^A-Za-z0-9]+/g, '.')}`,
        status: 'fail',
        evidence: { path: callbackPath, error: redactNetworkError(error) },
        code: 'oauth_callback_page_unreachable',
        reason: `${callbackPath} could not be reached.`,
      });
    }
  }

  try {
    const response = await fetchWithTimeout(
      `${normalizedOrigin}/api/public/meta/webhooks/instagram`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${'0'.repeat(64)}`,
        },
        body: JSON.stringify({ object: 'instagram', entry: [] }),
      }
    );
    addCheck(checks, issues, {
      id: 'meta.webhook-rejects-invalid-signature',
      status: response.status === 401 ? 'pass' : 'fail',
      evidence: { status: response.status },
      code: 'meta_webhook_signature_not_enforced',
      reason: 'The live Meta webhook did not reject a forged signature with HTTP 401.',
    });
  } catch (error) {
    addCheck(checks, issues, {
      id: 'meta.webhook-rejects-invalid-signature',
      status: 'fail',
      evidence: { error: redactNetworkError(error) },
      code: 'meta_webhook_signature_probe_failed',
      reason: 'The live Meta webhook signature probe failed.',
    });
  }

  const verifyToken = String(env.META_WEBHOOK_VERIFY_TOKEN || '');
  if (verifyToken.length >= 32 && !isTemplateValue(verifyToken)) {
    const challenge = `publishly-launch-audit-${Date.now()}`;
    try {
      const url = new URL('/api/public/meta/webhooks/instagram', normalizedOrigin);
      url.searchParams.set('hub.mode', 'subscribe');
      url.searchParams.set('hub.verify_token', verifyToken);
      url.searchParams.set('hub.challenge', challenge);
      const response = await fetchWithTimeout(url);
      const body = await response.text();
      const passed = response.status === 200 && body.replace(/^"|"$/g, '') === challenge;
      addCheck(checks, issues, {
        id: 'meta.webhook-verification-challenge',
        status: passed ? 'pass' : 'fail',
        evidence: { status: response.status, challengeEchoed: passed },
        code: 'meta_webhook_challenge_mismatch',
        reason: 'The live Meta webhook does not use the verification token from the audited production environment.',
      });
    } catch (error) {
      addCheck(checks, issues, {
        id: 'meta.webhook-verification-challenge',
        status: 'fail',
        evidence: { error: redactNetworkError(error) },
        code: 'meta_webhook_challenge_failed',
        reason: 'The live Meta webhook verification challenge failed.',
      });
    }
  } else {
    addCheck(checks, issues, {
      id: 'meta.webhook-verification-challenge',
      status: 'skip',
      evidence: { reason: 'A production verification token is not configured.' },
    });
  }

  const mediaUrl = String(env.S3_PUBLIC_URL || env.CLOUDFLARE_BUCKET_URL || '').trim();
  if (mediaUrl && !isTemplateValue(mediaUrl)) {
    try {
      const parsed = new URL(mediaUrl);
      const response = await fetchWithTimeout(parsed.origin, {
        method: 'GET',
        redirect: 'manual',
      });
      const reachable = [200, 204, 403, 404].includes(response.status);
      addCheck(checks, issues, {
        id: 'media.public-origin',
        status: parsed.protocol === 'https:' && reachable ? 'pass' : 'fail',
        evidence: { hostname: parsed.hostname, status: response.status },
        code: 'media_origin_not_ready',
        reason: 'The configured public media origin is not a reachable HTTPS origin.',
      });
    } catch (error) {
      addCheck(checks, issues, {
        id: 'media.public-origin',
        status: 'fail',
        evidence: { error: redactNetworkError(error) },
        code: 'media_origin_check_failed',
        reason: 'The configured public media origin check failed.',
      });
    }
  } else {
    addCheck(checks, issues, {
      id: 'media.public-origin',
      status: 'skip',
      evidence: { reason: 'No non-template media URL is configured.' },
    });
  }

  const sourceUrl = String(env.NEXT_PUBLIC_SOURCE_URL || '').trim();
  if (sourceUrl && !isTemplateValue(sourceUrl)) {
    try {
      const response = await fetchWithTimeout(sourceUrl, { redirect: 'follow' });
      addCheck(checks, issues, {
        id: 'source.public-offer',
        status: response.status === 200 ? 'pass' : 'fail',
        evidence: { status: response.status },
        code: 'source_offer_unreachable',
        reason: 'The configured public source offer is not reachable with HTTP 200.',
      });
    } catch (error) {
      addCheck(checks, issues, {
        id: 'source.public-offer',
        status: 'fail',
        evidence: { error: redactNetworkError(error) },
        code: 'source_offer_check_failed',
        reason: 'The configured public source offer check failed.',
      });
    }
  } else {
    addCheck(checks, issues, {
      id: 'source.public-offer',
      status: 'skip',
      evidence: { reason: 'No non-template public source URL is configured.' },
    });
  }

  const passCount = checks.filter((check) => check.status === 'pass').length;
  const failCount = checks.filter((check) => check.status === 'fail').length;
  const skipCount = checks.filter((check) => check.status === 'skip').length;
  return {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    origin: normalizedOrigin,
    passed: issues.length === 0,
    summary: { pass: passCount, fail: failCount, skip: skipCount },
    checks,
    issues,
  };
}

module.exports = {
  PUBLIC_PLACEHOLDER_PATTERNS,
  REQUIRED_PUBLIC_ROUTES,
  auditLiveLaunch,
  containsPublicPlaceholder,
  headerPolicyIssues,
  isTemplateValue,
  normalizeOrigin,
  redactNetworkError,
  validateHealthBody,
  validateStatusBody,
};
