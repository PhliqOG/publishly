# Instagram — Graph API via Facebook Login (Business)

**Purpose**: publish feed posts/reels/carousels to Instagram *professional*
accounts linked to a Facebook Page; read the user's own insights; manage
comments on the user's own posts.

Constraint surfaced in-app (from code toolTip): "Instagram must be business and
connected to a Facebook page." Personal IG accounts cannot use this provider —
that's a platform rule, not a Publishly limitation. For IG accounts without a
Facebook Page, use the standalone provider (`instagram-standalone.md`).

## App creation
- Same Meta app as Facebook Pages (developers.facebook.com), with Instagram
  Graph API / Facebook Login for Business enabled. Verify current product
  naming on the portal — Meta renames these periodically.

## Exact scopes (from code)
```
instagram_basic
pages_show_list
pages_read_engagement
business_management
instagram_content_publish
instagram_manage_comments
instagram_manage_insights
```

## Redirect URI(s) to whitelist
```
{FRONTEND_URL}/integrations/social/instagram
```

## Env vars to set (shared with the Facebook provider)
```
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

## Review prerequisites
- Business Verification (same as Facebook Pages — one verification covers the app).
- App Review with Advanced Access for every scope above; per-permission
  screencast: connect IG business account (via its linked Page), publish a
  scheduled image post, show comments management, show insights screen.
- Privacy policy + data deletion instructions URLs.
- A test IG **professional** account linked to a test Page for the reviewer.

## Truthful use-case text
> Publishly lets users schedule and publish content to Instagram professional
> accounts they own, via the official Instagram Graph API. instagram_content_publish
> is used solely to publish the user's own scheduled posts; instagram_manage_comments
> lets the user read and reply to comments on their own posts from Publishly's
> inbox; instagram_manage_insights powers the user's own analytics view. No
> content or data from accounts the user does not manage is accessed.

## Data handling
- Stored: IG account id/username/avatar, page-scoped tokens (encrypted at rest),
  media ids, insight metrics for display.
- Data deletion: connection removal deletes tokens; account deletion removes all
  stored data. Use Meta's instructions-URL option (no automated callback endpoint
  in code yet — don't claim one).

## Common rejection causes
- Reviewer cannot reproduce because the test IG account isn't professional or
  isn't linked to a Page — set this up before submitting.
- Screencast shows publishing but not comments/insights while those scopes are
  requested.
- Content-publishing demo that looks like automation of third-party accounts.

## Post-approval canary
1. Connect a company-owned test IG professional account.
2. Schedule one image post (image ≥320px wide; provider converts formats as
   needed) 5 minutes out; verify the permalink on instagram.com.
3. Load analytics + comments for that account; verify no permission errors.
4. Note: IG enforces a rolling publish limit per account (Meta documents
   ~25 API posts/24h higher limits vary — verify current value); keep canary volume trivial.
