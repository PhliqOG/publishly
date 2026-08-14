'use strict';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;

class PublishlyNodeError extends Error {
  constructor(code, reason, failureClass = 'data_problem') {
    super(`${code}: ${reason}`);
    this.name = 'PublishlyNodeError';
    this.code = code;
    this.reason = reason;
    this.failureClass = failureClass;
  }
}

function normalizeBaseUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new PublishlyNodeError(
      'invalid_base_url',
      'Backend URL must be an absolute HTTP or HTTPS URL.'
    );
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new PublishlyNodeError(
      'invalid_base_url',
      'Backend URL must use HTTP or HTTPS.'
    );
  }
  return raw.replace(/\/+$/, '');
}

function parseJsonObject(value, fieldName = 'Post body') {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new PublishlyNodeError(
        'invalid_json_body',
        `${fieldName} must contain valid JSON.`
      );
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PublishlyNodeError(
      'invalid_post_body',
      `${fieldName} must be a JSON object.`
    );
  }
  return { ...parsed };
}

function requireIdempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) {
    throw new PublishlyNodeError(
      'invalid_idempotency_key',
      'Idempotency key is required and must be 8-200 characters using letters, numbers, dot, underscore, colon, or hyphen.'
    );
  }
  return value;
}

function headerValue(headers, name) {
  if (!headers) return undefined;
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase()
  );
  return key ? headers[key] : undefined;
}

async function publishlyApiRequest(
  context,
  { method, path, body, qs, headers, fullResponse = false }
) {
  const credentials = await context.getCredentials('publishlyApi');
  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  const apiKey =
    typeof credentials.apiKey === 'string' ? credentials.apiKey.trim() : '';
  if (!apiKey) {
    throw new PublishlyNodeError(
      'missing_api_key',
      'A scoped Publishly API key is required.',
      'user_action_needed'
    );
  }
  const options = {
    method,
    url: `${baseUrl}/public/v1${path}`,
    headers: {
      Accept: 'application/json',
      Authorization: apiKey,
      ...(headers || {}),
    },
    json: true,
    returnFullResponse: fullResponse,
  };
  if (body !== undefined) options.body = body;
  if (qs && Object.keys(qs).length) options.qs = qs;
  return context.helpers.httpRequest(options);
}

module.exports = {
  PublishlyNodeError,
  headerValue,
  normalizeBaseUrl,
  parseJsonObject,
  publishlyApiRequest,
  requireIdempotencyKey,
};
