# YouTube (Google)

**Purpose**: upload scheduled videos (incl. thumbnails) to the user's own
channel; read the user's own channel analytics.

## App creation
- Portal: https://console.cloud.google.com → project → enable **YouTube Data
  API v3** (and YouTube Analytics API for the analytics scope) → OAuth consent
  screen (External) → OAuth client (Web application).

## Exact scopes (from code)
```
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
https://www.googleapis.com/auth/youtube
https://www.googleapis.com/auth/youtube.force-ssl
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtubepartner
https://www.googleapis.com/auth/yt-analytics.readonly
```
⚠ `youtubepartner` is a *restricted partner scope* intended for YouTube content
owners (CMS partners). It is unusual for a scheduler and may block or complicate
Google's OAuth verification for a general app. Flagged for an operator decision:
consider removing it from `youtube.provider.ts` before submitting for
verification unless a concrete feature needs it. The other youtube.* scopes are
"sensitive/restricted" and already require verification + possibly a security
assessment — verify current policy in the Google verification docs.

## Redirect URI(s) to whitelist (OAuth client → Authorized redirect URIs)
```
{FRONTEND_URL}/integrations/social/youtube
```

## Env vars to set
```
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
```

## Review prerequisites
- OAuth consent screen fully filled (app name, support email, domains, privacy
  policy + terms URLs) and **domain verification** for the app domain.
- OAuth verification submission for sensitive/restricted scopes: in-app demo
  video showing each scope's use (upload flow, analytics screen).
- Until verified: app works for up to 100 test users with an "unverified app"
  warning — sufficient for canaries.

## Truthful use-case text
> Publishly is a social-media scheduling tool. Users connect their own YouTube
> channel with Google OAuth and schedule videos that Publishly uploads to their
> channel at the scheduled time, with the title, description, and thumbnail they
> set. yt-analytics.readonly powers the user's own channel analytics dashboard.
> Publishly accesses only channels the user explicitly connects.

## Data handling
- Stored: channel id/name/avatar, OAuth refresh+access tokens (encrypted at
  rest), uploaded video ids, displayed analytics.
- Google requires compliance with the Google API Services User Data Policy
  (Limited Use) — the privacy policy must state it.
- Deletion: disconnecting removes tokens; account deletion removes all data.

## Common rejection causes
- Requesting scopes the demo doesn't show being used (youtubepartner is the
  likely offender here — see warning above).
- Privacy policy not on a verified domain, or not mentioning Limited Use.
- Consent screen branding mismatch with the app.

## Post-approval canary
1. Add your Google account as a test user; connect the company test channel.
2. Schedule one short unlisted video with thumbnail → verify on studio.youtube.com
   (the pending/finalize flow sets thumbnails — confirm it completed).
3. Load the analytics screen; confirm token refresh works the next day.
