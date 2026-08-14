import { SocialProvider } from './social/social.integrations.interface';

export class ProviderConnectionRevocationError extends Error {
  readonly code = 'provider_revocation_failed';
  readonly retryable = true;

  constructor(reason: string) {
    super(reason);
    this.name = 'ProviderConnectionRevocationError';
  }
}

function revocationEvidence(error: unknown) {
  if (!error || (typeof error !== 'object' && typeof error !== 'string')) {
    return String(error || '');
  }
  if (typeof error === 'string') return error;

  const candidate = error as {
    message?: unknown;
    code?: unknown;
    error?: unknown;
    error_description?: unknown;
    response?: {
      data?: {
        error?: unknown;
        error_description?: unknown;
        message?: unknown;
      };
    };
  };
  return [
    candidate.message,
    candidate.code,
    candidate.error,
    candidate.error_description,
    candidate.response?.data?.error,
    candidate.response?.data?.error_description,
    candidate.response?.data?.message,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .slice(0, 4_000);
}

/**
 * External revocation is destructive, so this predicate is deliberately
 * narrow. Google `invalid_grant` during refresh is authoritative; transport
 * failures and generic 401/5xx responses are not proof that consent ended.
 */
export function isDefinitiveProviderRevocation(
  providerIdentifier: string,
  error: unknown
) {
  if (providerIdentifier !== 'youtube') return false;
  const evidence = revocationEvidence(error);
  return (
    /\binvalid_grant\b/i.test(evidence) ||
    /token (?:has been|was|is) (?:expired or )?revoked/i.test(evidence) ||
    /access (?:has been|was|is) revoked/i.test(evidence)
  );
}

export async function revokeProviderConnection(
  provider: SocialProvider,
  accessToken: string,
  refreshToken?: string
) {
  if (!provider.revokeConnection) return;
  try {
    await provider.revokeConnection(accessToken, refreshToken);
  } catch (error) {
    const providerReason =
      error instanceof Error && error.message
        ? error.message
        : 'The provider did not confirm authorization revocation.';
    throw new ProviderConnectionRevocationError(
      `${providerReason} The connection was not reported as deleted; retry disconnect.`
    );
  }
}
