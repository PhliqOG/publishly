# Mastodon

**Purpose**: publish statuses (text + media) to the user's account on a
Mastodon instance.

## App creation
- No central developer portal — register an application **on the instance** you
  point `MASTODON_URL` at (default in code/env: `https://mastodon.social`).
- Registration options: instance web UI (Settings → Development → New
  application) or the `POST /api/v1/apps` endpoint. No review process.
- The stock provider connects users of that one configured instance. (Postiz
  also ships a `mastodon.custom` provider variant for user-supplied instances;
  it is currently disabled in the integration list — enabling it is a product
  decision, not an approval matter.)

## Exact scopes (from code)
```
write:statuses
profile
write:media
```
Grant these when creating the app on the instance (the app-registration form's
scope checkboxes / scopes string).

## Redirect URI(s) to register on the instance app
```
{FRONTEND_URL}/integrations/social/mastodon
```

## Env vars to set
```
MASTODON_URL=            # default https://mastodon.social
MASTODON_CLIENT_ID=
MASTODON_CLIENT_SECRET=
```

## Review prerequisites
None — instance app registration is immediate. Mind the instance's local rules
(server covenant/ToS); automation that posts user-authored content on their own
account is normal client behavior.

## Truthful use-case text (for the app registration "website"/description)
> Publishly — a scheduling client that publishes users' own posts to their own
> account at the time they choose, via the standard Mastodon API.

## Data handling
- Stored: account id/handle/avatar, OAuth token (encrypted at rest), status ids
  for release URLs.
- Deletion: disconnect removes tokens; users can also revoke the app under
  Settings → Account → Authorized apps on their instance.

## Common failure causes
- `MASTODON_URL` mismatch: tokens are instance-specific; changing the env value
  breaks existing connections — pick the instance deliberately.
- Redirect URI not byte-identical to the registered one.
- Instance-level rate limits (300 req/5min typical default) — trivial for
  scheduling volumes.

## First canary (same-day, no external approval)
1. Create a test account on the target instance; register the app; set env vars.
2. Connect; schedule one 500-char text post → verify the permalink.
3. One image post → verify media renders with alt text.
