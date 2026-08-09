# Instagram — API with Instagram Login (Standalone)

**Purpose**: publish to Instagram professional accounts **without** requiring a
linked Facebook Page — users log in with their Instagram credentials directly
(`enable_fb_login=0` in the authorize URL, from code).

## App creation
- Portal: https://developers.facebook.com → app with the **Instagram API with
  Instagram Login** product (Meta's standalone Instagram product — verify current
  naming on the portal).
- This is a *separate credential pair* from the Facebook-login Instagram
  provider; both can coexist in one Meta app or separate apps.

## Exact scopes (from code)
```
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_comments
instagram_business_manage_insights
```

## Redirect URI(s) to whitelist
```
{FRONTEND_URL}/integrations/social/instagram-standalone
```
Dev note (from code): if `FRONTEND_URL` is not HTTPS the app wraps the redirect
as `https://redirectmeto.com/{FRONTEND_URL}/integrations/social/instagram-standalone`
— whitelist the wrapped form only for local development.

## Env vars to set
```
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
```

## Token behavior (from code)
- `refreshCron = true`: Publishly's token-refresh workflow periodically refreshes
  the long-lived Instagram token before expiry. No operator action needed beyond
  correct credentials.

## Review prerequisites
- App Review for the four instagram_business_* scopes with a screencast of:
  Instagram login → publish scheduled post → comments view → insights view.
- Privacy policy + data deletion instructions URLs on the app.
- Instagram **tester** accounts work pre-review: add your test IG professional
  account as a tester on the portal to run canaries before approval.

## Truthful use-case text
> Publishly is a scheduling tool where Instagram professional account owners log
> in with Instagram, connect their own account, and schedule posts that Publishly
> publishes via the official API at the chosen time. Comment and insight scopes
> power the user's own inbox and analytics for their own account only.

## Data handling
- Stored: IG user id/username/avatar, long-lived token (encrypted at rest),
  media ids, displayed metrics.
- Deletion: removing the connection deletes tokens; account deletion removes all
  data. Use the data-deletion instructions URL option (no automated callback
  endpoint implemented — don't claim one).

## Common rejection causes
- Demo uses a personal (non-professional) IG account.
- Requesting comment/insight scopes without demonstrating those screens.
- Broken redirect: forgetting the exact `/integrations/social/instagram-standalone`
  path in the whitelist.

## Post-approval canary
1. Connect the company test IG professional account via Instagram login.
2. One scheduled image post → verify permalink; then one comment reply from the
   inbox; then load insights.
3. Watch the refresh workflow logs across the next days to confirm token refresh
   (refreshCron) succeeds before enabling customers.
