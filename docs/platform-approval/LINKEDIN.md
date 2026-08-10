# LinkedIn (Member profiles + Company Pages)

**Purpose**: publish posts to the user's own member profile (`linkedin`
provider) and to organization Pages they administer (`linkedin-page` provider).
Both providers share one LinkedIn app and one credential pair.

## App creation
- Portal: https://developer.linkedin.com → create app (requires association with
  a real LinkedIn Company Page you control).
- Add products: **Sign In with LinkedIn using OpenID Connect** and **Share on
  LinkedIn** (member posting). Organization posting scopes are gated by the
  **Community Management API** (approval-based) — request it for Page posting.
  Product names/gates change; verify on the portal.

## Exact scopes (from code — both providers request the same list)
```
openid
profile
w_member_social
r_basicprofile
rw_organization_admin
w_organization_social
r_organization_social
```
Note: the org scopes (`rw_organization_admin`, `w_organization_social`,
`r_organization_social`) require the Community Management API approval;
`r_basicprofile` is granted via specific products. If approval for org scopes is
pending, member-profile posting can ship first by temporarily trimming the scope
list in `linkedin.provider.ts` — operator decision.

## Redirect URI(s) to whitelist
```
{FRONTEND_URL}/integrations/social/linkedin
{FRONTEND_URL}/integrations/social/linkedin-page
```

## Env vars to set
```
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

## Token behavior (from code)
- `oneTimeToken = true` + `refreshWait = true`: LinkedIn refresh tokens are
  single-use and rotate on refresh; the refresh workflow serializes refreshes to
  avoid racing. No operator action, but don't manually reuse tokens.

## Review prerequisites
- Community Management API access form: describe the Page-scheduling use case,
  with the company Page association and privacy policy URL in order.
- A demo (screenshots/video) of connect → schedule → published Page post
  strengthens the application.

## Truthful use-case text
> Publishly is a social-media scheduler. Members connect their own LinkedIn
> account via OAuth to schedule posts to their own profile; Page admins
> additionally select organizations they administer to schedule Page posts.
> Publishly publishes only user-composed content at user-chosen times and reads
> only the connected member/organization data needed to render the account
> picker and the user's own post analytics.

## Data handling
- Stored: member/org ids, names, avatars, access+refresh tokens (encrypted at
  rest), post URNs for release URLs.
- Deletion: disconnect removes tokens; account deletion removes all data.

## Common rejection causes
- App not associated with a legitimate Company Page.
- Requesting org scopes with a consumer-only use-case description.
- Privacy policy URL missing/404.

## Post-approval canary
1. Connect the company test member account → one text post → verify permalink.
2. Connect the company's own Page (via linkedin-page) → one Page post →
   verify on the Page feed.
3. Confirm a token refresh succeeds ~24h later (rotation is the fragile part).
