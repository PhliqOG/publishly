# Facebook Pages (Meta)

**Purpose**: publish posts/media to Facebook Pages the user manages, with page
insights for analytics.

## App creation
- Portal: https://developers.facebook.com → Create App. Verify the current app
  type/use-case picker on the portal — choose the option that provides
  **Facebook Login for Business** and Pages permissions (historically "Business"
  type).
- The same Meta app can also host Instagram (Facebook login) — see
  `instagram.md`; Threads uses its own use case (`threads.md`).

## Exact scopes (from code — request Advanced Access for each)
```
pages_show_list
business_management
pages_manage_posts
pages_manage_engagement
pages_read_engagement
read_insights
```

## Redirect URI(s) to whitelist (Facebook Login → Valid OAuth Redirect URIs)
```
{FRONTEND_URL}/integrations/social/facebook
```
Production `FRONTEND_URL` must be HTTPS (Meta rejects non-HTTPS redirect URIs).

## Env vars to set
```
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

## Review prerequisites
- **Business Verification** on the Meta Business account — required for
  Advanced Access to pages_* permissions. Start this first; it is the long pole.
- Privacy Policy URL + Data Deletion instructions URL set in App Settings → Basic.
- App icon, category, and a working app URL.
- Screencast for App Review showing: user logs into Publishly → connects a
  Facebook Page via OAuth → composes a post → schedules → the post appears on
  the Page, plus the analytics screen reading insights. One recording covers all
  requested permissions if each is visibly exercised.
- App Review submission with per-permission usage descriptions (use the text below).

## Truthful use-case text
> Publishly is a social-media scheduling tool. Users connect Facebook Pages they
> manage via Facebook Login and grant Publishly permission to publish the posts
> they compose, at the time they schedule. read_insights and
> pages_read_engagement power the user's own analytics dashboard for their own
> Pages. Publishly never posts without an explicit user-created schedule and
> never accesses Pages the user does not manage.

## Data handling
- Data stored: page access tokens (encrypted at rest), page id/name/avatar,
  post ids and metrics the user's dashboard displays.
- Meta requires a Data Deletion Callback URL **or** instructions URL: use the
  instructions page (Settings → delete connection removes tokens; account
  deletion removes all data). Automated deauthorize callback endpoint is not
  implemented in code today — do not claim it in the form.

## Common rejection causes
- Screencast doesn't visibly exercise a requested permission → it gets denied.
- Missing/broken privacy policy or data deletion URL.
- Requesting business_management without showing why (it is needed here for the
  page-listing flow — show the page picker in the screencast).
- App in dev mode with no test user path for the reviewer — provide a test login.

## Post-approval canary
1. Connect a company-owned test Page (not a customer's).
2. Schedule one text post 5 minutes out; confirm the Temporal workflow publishes
   it and the release URL opens on facebook.com.
3. Confirm analytics for that Page load without errors.
4. Only then enable the provider for customers.
