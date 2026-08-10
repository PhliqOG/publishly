# TikTok

**Purpose**: publish videos/photo posts to the user's own TikTok account via the
official Content Posting API; read the user's own profile/stats.

## App creation
- Portal: https://developers.tiktok.com → register app, add **Login Kit** and
  **Content Posting API** products. Portal flow changes frequently — verify there.

## Exact scopes (from code)
```
video.list
user.info.basic
video.publish
video.upload
user.info.profile
user.info.stats
```

## Redirect URI(s) to whitelist
```
{FRONTEND_URL}/integrations/social/tiktok
```
Dev note (from code): non-HTTPS `FRONTEND_URL` is wrapped as
`https://redirectmeto.com/{FRONTEND_URL}/integrations/social/tiktok` — dev only.
TikTok requires HTTPS redirect URIs in production.

## Env vars to set
```
TIKTOK_CLIENT_ID=
TIKTOK_CLIENT_SECRET=
```
(Code reads these names; the portal calls them "Client key"/"Client secret".)

## Review prerequisites
- **Content Posting API audit**: until your app passes it, published content is
  restricted (posts limited to private/self-visible on the creator's account —
  verify current unaudited limitations on the portal). Submit the audit with a
  demo video of connect → schedule → publish.
- App review also verifies your terms/privacy URLs and app description.
- The code's checkValidity enforces TikTok media rules client-side (video
  formats, photo modes) — the demo should show a normal MP4 publish.

## Truthful use-case text
> Publishly is a social-media scheduler. TikTok creators connect their own
> account via TikTok Login and schedule videos or photo posts that Publishly
> uploads through the Content Posting API at the scheduled time, honoring the
> creator's chosen privacy level, disclosure settings, and interaction toggles.
> user.info/stats scopes power the creator's own profile display and analytics.

## Data handling
- Stored: open_id/union_id, display name/avatar, access+refresh tokens
  (encrypted at rest), published video ids, displayed stats.
- Deletion: removing the connection deletes tokens; account deletion removes all
  stored data. Document this at your data-deletion instructions URL.

## Common rejection causes
- Audit demo missing the disclosure/branded-content toggles or privacy-level
  selection that the API contract requires the UI to honor (Publishly's TikTok
  settings component exposes these — show them).
- Non-HTTPS redirect URI.
- Description implying reposting third-party content without rights.

## Post-approval canary
1. Connect the company test TikTok account.
2. Schedule one short MP4 (public visibility) → verify it appears on the
   profile via the returned release URL / app.
3. Before audit approval, expect the canary post to be self-only visibility —
   that still validates the pipeline end-to-end.
