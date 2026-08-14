export async function readAuthFailure(
  response: Pick<Response, 'status' | 'text'>,
  fallback: string
) {
  try {
    const reason = (await response.text()).trim();
    if (reason) return reason;
  } catch {
    // The fallback below is the visible reason when an unreadable response
    // body would otherwise leave the form with no explanation.
  }

  return `${fallback} (HTTP ${response.status}).`;
}

export function authNetworkFailure(action: 'sign in' | 'create your account') {
  return `Publishly could not ${action} because the API could not be reached. Check your connection and try again.`;
}
