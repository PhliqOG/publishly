# Threads (Meta)

**Purpose**: publish text/media posts and reply threads to the user's own
Threads profile; read the user's own post insights.

## App creation
- Portal: https://developers.facebook.com → app with the **Threads API** use
  case (Threads has its own product/use-case on the Meta portal — verify current
  naming).
- Credentials are Threads-specific (`THREADS_APP_ID`), not the Facebook app id.

## Exact scopes (from code)
```
threads_basic
threads_content_publish
threads_manage_replies
threads_manage_insights
```
(`threads_profile_discovery` is present but commented out in code — do not request it.)

## Redirect URI(s) to whitelist
```
{FRONTEND_URL}/integrations/social/threads
```
Dev note (from code): non-HTTPS `FRONTEND_URL` is wrapped as
`https://redirectmeto.com/{FRONTEND_URL}/integrations/social/threads` — dev only.

## Env vars to set
```
THREADS_APP_ID=
THREADS_APP_SECRET=
```

## Token behavior (from code)
- `refreshCron = true`: long-lived Threads tokens are refreshed automatically by
  the background refresh workflow.

## Review prerequisites
- App Review for the four threads_* scopes; screencast of connect → schedule →
  published thread → replies management → insights.
- Privacy policy + data deletion instructions URLs.
- Tester accounts can exercise the API pre-review — add your test Threads
  profile as a tester for canaries.

## Truthful use-case text
> Publishly lets users connect their own Threads profile via OAuth and schedule
> posts that are published through the official Threads API at the time they
> choose. Reply and insight permissions power the user's own reply management
> and analytics for their own posts. Publishly does not read or post to any
> profile the user has not connected.

## Data handling
- Stored: Threads user id/username/avatar, long-lived token (encrypted at
  rest), post ids, displayed metrics.
- Deletion: instructions-URL option (connection removal deletes tokens; account
  deletion removes all data). No automated deletion callback endpoint in code —
  don't claim one.

## Common rejection causes
- Screencast missing one of the requested permissions in action.
- Privacy/deletion URLs missing or 404.
- Use-case text implying mass-automation or posting to third-party profiles.

## Post-approval canary
1. Connect the company test Threads profile.
2. Schedule one 500-char-max text post → verify permalink on threads.net.
3. Post one reply via the app; load insights; check refresh workflow logs over
   the following days (refreshCron).
