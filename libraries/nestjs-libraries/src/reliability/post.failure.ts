import { redactProviderMediaSecrets } from '@gitroom/helpers/bulk-scheduler/provider-media.contract';

export const POST_FAILURE_CLASSES = [
  'recoverable',
  'user_action_needed',
  'data_problem',
] as const;

export type PostFailureClass = (typeof POST_FAILURE_CLASSES)[number];

type FailureDefinition = {
  failureClass: PostFailureClass;
  defaultReason: string;
};

export const POST_FAILURE_CATALOG = {
  queue_unavailable: {
    failureClass: 'recoverable',
    defaultReason:
      'Publishly could not place this post on the delivery queue. The post can be retried safely.',
  },
  rate_limited: {
    failureClass: 'recoverable',
    defaultReason:
      'The platform rate limit prevented this attempt. Publishly can retry the post safely after the limit resets.',
  },
  provider_unavailable: {
    failureClass: 'recoverable',
    defaultReason:
      'The platform is temporarily unavailable. Publishly can retry this post safely.',
  },
  network_error: {
    failureClass: 'recoverable',
    defaultReason:
      'Publishly could not reach the platform before sending the post. The post can be retried safely.',
  },
  status_check_failed: {
    failureClass: 'recoverable',
    defaultReason:
      'Publishly could not read the platform processing status. The read-only status check can be retried safely.',
  },
  token_refresh_required: {
    failureClass: 'recoverable',
    defaultReason:
      'The connection token needs an automatic refresh before Publishly can retry this post.',
  },
  reconnect_required: {
    failureClass: 'user_action_needed',
    defaultReason:
      'The social account connection is no longer authorized. Reconnect the account before retrying this post.',
  },
  permission_required: {
    failureClass: 'user_action_needed',
    defaultReason:
      'The connected account is missing a permission required to publish this post. Reconnect it with the required permissions.',
  },
  account_disabled: {
    failureClass: 'user_action_needed',
    defaultReason:
      'This social account connection is disabled. Enable or reconnect it before retrying the post.',
  },
  account_restricted: {
    failureClass: 'user_action_needed',
    defaultReason:
      'The platform has restricted this account from publishing. Review the account on the platform before retrying.',
  },
  provider_configuration_required: {
    failureClass: 'user_action_needed',
    defaultReason:
      'This platform is not fully configured in Publishly. An administrator must complete the provider configuration.',
  },
  subscription_required: {
    failureClass: 'user_action_needed',
    defaultReason:
      'This workspace needs an active publishing plan before the post can be delivered.',
  },
  outcome_unknown: {
    failureClass: 'user_action_needed',
    defaultReason:
      'The platform may have published this post, but Publishly could not confirm the outcome. Check the social account before retrying to avoid a duplicate post.',
  },
  invalid_media: {
    failureClass: 'data_problem',
    defaultReason:
      'The platform rejected the attached media. Correct the media format or specifications before retrying.',
  },
  invalid_caption: {
    failureClass: 'data_problem',
    defaultReason:
      'The platform rejected the post text. Correct the caption or content before retrying.',
  },
  content_too_long: {
    failureClass: 'data_problem',
    defaultReason:
      'The post text exceeds the platform limit. Shorten it before retrying.',
  },
  invalid_settings: {
    failureClass: 'data_problem',
    defaultReason:
      'One or more platform settings are invalid. Correct the post settings before retrying.',
  },
  unsupported_content: {
    failureClass: 'data_problem',
    defaultReason:
      'This platform does not support the requested post or media combination. Change the content before retrying.',
  },
  provider_rejected_content: {
    failureClass: 'data_problem',
    defaultReason:
      'The platform rejected this post. Review the content and platform requirements before retrying.',
  },
  internal_error: {
    failureClass: 'recoverable',
    defaultReason:
      'Publishly encountered an unexpected internal error before it could complete this post. The failure was recorded for a safe retry.',
  },
} as const satisfies Record<string, FailureDefinition>;

export type PostFailureCode = keyof typeof POST_FAILURE_CATALOG;

export type NormalizedPostFailure = {
  failureClass: PostFailureClass;
  code: PostFailureCode;
  reason: string;
  willRetry: boolean;
};

export type PostFailureInput = {
  error?: unknown;
  reason?: unknown;
  code?: string | null;
  legacyCategory?: string | null;
  willRetry?: boolean;
  mutationMayHaveSucceeded?: boolean;
};

const MAX_REASON_LENGTH = 2_000;
const UNHELPFUL_REASON = /^(?:unknown(?: error)?|an unknown error occurred|error|failed|failure|\{\}|\[object object\]|activity task failed)\.?$/i;

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

function isFailureCode(value: unknown): value is PostFailureCode {
  return (
    typeof value === 'string' && hasOwn(POST_FAILURE_CATALOG, value)
  );
}

function redact(value: string) {
  return redactProviderMediaSecrets(value)
    .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
    .replace(
      /((?:[?&]|\b)(?:access_token|refresh_token|client_secret|token)=)[^&#\s]+/gi,
      '$1[redacted]'
    )
    .replace(
      /("(?:access_token|refresh_token|client_secret|token)"\s*:\s*")[^"]+("?)/gi,
      '$1[redacted]$2'
    );
}

function cleanReason(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const cleaned = redact(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_REASON_LENGTH);
  return !cleaned || UNHELPFUL_REASON.test(cleaned) ? '' : cleaned;
}

type StructuredFailure = {
  failureClass?: unknown;
  failureCode?: unknown;
  code?: unknown;
  failureReason?: unknown;
  reason?: unknown;
  message?: unknown;
};

function findStructuredFailure(
  value: unknown,
  seen = new Set<object>(),
  depth = 0
): StructuredFailure | undefined {
  if (!value || typeof value !== 'object' || depth > 6) {
    return undefined;
  }
  if (seen.has(value)) {
    return undefined;
  }
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (
    isFailureCode(record.failureCode) ||
    isFailureCode(record.code) ||
    POST_FAILURE_CLASSES.includes(record.failureClass as PostFailureClass)
  ) {
    return record;
  }

  for (const key of ['failure', 'cause', 'details', 'originalError', 'error']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findStructuredFailure(item, seen, depth + 1);
        if (found) return found;
      }
      continue;
    }
    const found = findStructuredFailure(nested, seen, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function collectEvidence(
  value: unknown,
  output: string[],
  seen = new Set<object>(),
  depth = 0
) {
  if (value === null || value === undefined || depth > 6) return;
  if (typeof value === 'string' || typeof value === 'number') {
    output.push(String(value).slice(0, 4_000));
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  const record = value as Record<string, unknown>;
  for (const key of [
    'failureCode',
    'code',
    'type',
    'status',
    'statusCode',
    'failureCategory',
    'failureReason',
    'reason',
    'message',
    'json',
  ]) {
    collectEvidence(record[key], output, seen, depth + 1);
  }
  for (const key of ['failure', 'cause', 'details', 'originalError', 'error']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        collectEvidence(item, output, seen, depth + 1);
      }
    } else {
      collectEvidence(nested, output, seen, depth + 1);
    }
  }
}

function legacyCode(
  category: string | null | undefined,
  willRetry: boolean
): PostFailureCode | undefined {
  switch ((category || '').toLowerCase()) {
    case 'outcome_unknown':
      return 'outcome_unknown';
    case 'queue_unavailable':
      return 'queue_unavailable';
    case 'provider_transient':
      return 'provider_unavailable';
    case 'rate_limit':
      return 'rate_limited';
    case 'authentication':
      return willRetry ? 'token_refresh_required' : 'reconnect_required';
    case 'provider_validation':
      return 'provider_rejected_content';
    default:
      return undefined;
  }
}

function inferCode(
  evidence: string,
  input: PostFailureInput
): PostFailureCode {
  if (input.mutationMayHaveSucceeded) return 'outcome_unknown';
  if (/outcome.?unknown|could not confirm|couldn't confirm|may have (?:been )?published|avoid duplicates?/i.test(evidence)) {
    return 'outcome_unknown';
  }
  if (/timeout(?:failure)?|timed out/i.test(evidence)) {
    return 'outcome_unknown';
  }
  if (/queue.?unavailable|temporal.*(?:unavailable|start)|could not (?:place|queue)/i.test(evidence)) {
    return 'queue_unavailable';
  }
  if (/429|rate.?limit|too many requests|quota.*(?:reset|exceeded)/i.test(evidence)) {
    return 'rate_limited';
  }
  if (/refresh channel|refresh.?token|token refresh/i.test(evidence)) {
    return input.willRetry ? 'token_refresh_required' : 'reconnect_required';
  }
  if (/invalid.?grant|access.?token.?invalid|token.*(?:expired|invalid|revoked)|re.?auth|authentication failed|not logged in/i.test(evidence)) {
    return 'reconnect_required';
  }
  if (/permission|not enough scopes?|missing.*scopes?|scope.*(?:missing|unauthorized)|not authorized|forbidden|insufficient access/i.test(evidence)) {
    return 'permission_required';
  }
  if (/channel disabled|connection disabled|account disabled/i.test(evidence)) {
    return 'account_disabled';
  }
  if (/account.*(?:banned|restricted|suspended)|banned from posting|user is restricted/i.test(evidence)) {
    return 'account_restricted';
  }
  if (/provider.*not configured|missing.*(?:app id|app secret|credential)|configuration required/i.test(evidence)) {
    return 'provider_configuration_required';
  }
  if (/no active subscription|subscription required|publishing plan/i.test(evidence)) {
    return 'subscription_required';
  }
  if (/too long|maximum characters?|character limit|caption length/i.test(evidence)) {
    return 'content_too_long';
  }
  if (/media|video|image|carousel|resolution|aspect.?ratio|frame.?rate|duration|file.?format|thumbnail|attachment/i.test(evidence)) {
    return /unsupported|not support|only supports?|cannot have/i.test(evidence)
      ? 'unsupported_content'
      : 'invalid_media';
  }
  if (/privacy|setting|invalid params?|parameter|poll option/i.test(evidence)) {
    return 'invalid_settings';
  }
  if (/caption|post text|spam.*text|content.*(?:invalid|rejected)|empty content/i.test(evidence)) {
    return 'invalid_caption';
  }
  if (/unsupported|not supported|does not support/i.test(evidence)) {
    return 'unsupported_content';
  }
  if (/bad.?body|invalid|rejected|unprocessable|\b400\b|\b409\b|\b422\b/i.test(evidence)) {
    return 'provider_rejected_content';
  }
  if (/econn|enotfound|dns|network|socket|connection reset|fetch failed/i.test(evidence)) {
    return 'network_error';
  }
  if (/provider.?transient|temporar(?:y|ily)|service unavailable|\b50[0234]\b/i.test(evidence)) {
    return 'provider_unavailable';
  }
  if (/status check|polling status/i.test(evidence)) {
    return 'status_check_failed';
  }
  return 'internal_error';
}

function reasonFromError(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return reasonFromError(JSON.parse(trimmed));
      } catch {
        return cleanReason(trimmed);
      }
    }
    return cleanReason(trimmed);
  }
  if (!value || typeof value !== 'object') return '';

  const structured = findStructuredFailure(value);
  const structuredReason = cleanReason(
    structured?.failureReason || structured?.reason || structured?.message
  );
  if (structuredReason) return structuredReason;

  const record = value as Record<string, unknown>;
  const ownReason = cleanReason(
    record.failureReason || record.reason || record.message
  );
  if (ownReason) return ownReason;

  for (const key of ['cause', 'details', 'originalError', 'error']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const reason = reasonFromError(item);
        if (reason) return reason;
      }
    } else {
      const reason = reasonFromError(nested);
      if (reason) return reason;
    }
  }
  return '';
}

export function normalizePostFailure(
  input: PostFailureInput
): NormalizedPostFailure {
  const willRetry = !!input.willRetry;
  const structured = findStructuredFailure(input.error);
  const explicitCode = isFailureCode(input.code)
    ? input.code
    : isFailureCode(structured?.failureCode)
    ? structured.failureCode
    : isFailureCode(structured?.code)
    ? structured.code
    : undefined;

  const evidenceParts: string[] = [];
  collectEvidence(input.error, evidenceParts);
  collectEvidence(input.reason, evidenceParts);
  if (input.legacyCategory) evidenceParts.push(input.legacyCategory);
  const evidence = evidenceParts.join(' ').slice(0, 20_000);

  const code =
    explicitCode ||
    legacyCode(input.legacyCategory, willRetry) ||
    inferCode(evidence, input);
  const definition = POST_FAILURE_CATALOG[code];
  const reason =
    cleanReason(input.reason) ||
    cleanReason(structured?.failureReason) ||
    cleanReason(structured?.reason) ||
    reasonFromError(input.error) ||
    definition.defaultReason;

  return {
    failureClass: definition.failureClass,
    code,
    reason,
    willRetry,
  };
}

export function failureDetails(failure: NormalizedPostFailure) {
  return {
    failureClass: failure.failureClass,
    failureCode: failure.code,
    failureReason: failure.reason,
    willRetry: failure.willRetry,
  };
}
