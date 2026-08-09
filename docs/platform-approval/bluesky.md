# Bluesky

**Purpose**: publish posts (text, images, one video per post) to the user's own
Bluesky account.

## App creation
**None.** Bluesky/atproto requires no developer app, no client id, no review.
Users authenticate with their handle + an **app password** they create in their
own Bluesky settings (Settings → Privacy and Security → App Passwords).

## Connection fields (from code — user-supplied, not env)
```
service     — PDS URL, default https://bsky.social (self-hosted PDS supported)
identifier  — the user's handle or email
password    — an app password (never the main account password)
```
Note from code: accounts with two-factor authentication enabled can't connect
(surfaced in the UI tooltip) — app-password login limitation.

## Redirect URI(s)
None — no OAuth redirect; login is credential-based against the PDS.

## Env vars to set
```
(none required)
DISABLE_SSRF_PROTECTION=  # leave unset; only for trusted private-network PDS
```
The server validates user-supplied PDS URLs against SSRF (public HTTPS only)
unless this flag is set — keep protection ON in production.

## Review prerequisites
None. Works immediately.

## Truthful use-case / user guidance text
> Connect Bluesky with an app password — create one in Bluesky's settings and
> paste it here; Publishly never sees your main password. Posts you schedule are
> published to your own account at the time you choose.

## Data handling
- Stored: DID/handle/avatar, the app password + session (encrypted at rest —
  treat exactly like an OAuth token), post URIs for release URLs.
- Deletion: disconnect removes stored credentials; users can additionally revoke
  the app password in Bluesky settings at any time (document this — it's the
  user's kill switch).

## Common failure causes (no review, but real-world issues)
- User pastes their main password with 2FA on → login fails; UI copy must steer
  to app passwords.
- Video posts: one video max per post (enforced in code's checkValidity);
  Bluesky's video service processes async — the pending flow handles it.
- Custom PDS URLs that resolve to private IPs are rejected by SSRF protection.

## First canary (can run today — no credentials needed from any platform)
1. Create a test Bluesky account + app password.
2. Connect it; schedule one text post 5 minutes out → verify the permalink.
3. Schedule one image post and one video post → verify both; video exercises
   the pending/finalize pipeline end-to-end.
