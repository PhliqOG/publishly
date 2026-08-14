# LinkedIn production access runbook

Last verified: 2026-08-10. LinkedIn Marketing API versions sunset on a rolling
schedule; verify the version headers in the adapter immediately before launch.
`APP_ORIGIN` is the public HTTPS `FRONTEND_URL`.

## Products, callbacks, and secrets

Create a LinkedIn Developer application associated with the operator's real
LinkedIn Page. Add **Sign In with LinkedIn using OpenID Connect** and the
publishing products/access granted for the use case. Member posting and Page
posting have separate callbacks:

```text
APP_ORIGIN/integrations/social/linkedin
APP_ORIGIN/integrations/social/linkedin-page
```

```dotenv
LINKEDIN_CLIENT_ID=<client ID>
LINKEDIN_CLIENT_SECRET=<client secret>
FRONTEND_URL=https://app.example.com
```

No LinkedIn webhook is consumed by the current adapter. Do not configure a
lead-generation, ads, or messaging product unless separately implemented.

## Current scopes

Member connection:

- `openid`, `profile` — identify the consenting member using OIDC.
- `w_member_social` — create the post the member explicitly scheduled.

Organization/Page connection:

- `openid`, `profile`
- `rw_organization_admin` — discover Pages the member is authorized to manage.
- `w_organization_social` — create/manage Page posts.
- `r_organization_social` — retrieve Page posts/social activity supported by
  the approved product.

Publishly intentionally does not request deprecated `r_basicprofile` or closed
`r_member_social`. Member-post analytics/comments must remain unavailable unless
LinkedIn grants and the product implements an appropriate current permission.

## Access sequence

1. Complete the Publishly privacy, terms, contact, deletion, and security pages
   on the final domain.
2. Create the app, associate/verify the operator Page, add both exact HTTPS
   redirect URLs, and add OIDC.
3. Enable self-service member sharing if available for the app. Apply for
   Community Management API Development access for organization management,
   using the supported social-management use case.
4. Store credentials, deploy, connect an owner-controlled member and Page, and
   verify the authenticated member has an allowed Page role.
5. Test text, one image, and one video only where the adapter capability registry
   exposes them. Confirm organization discovery and disconnect.
6. For production Page use, request the appropriate Standard tier and provide
   the required application form and screen recording. LinkedIn reviews the
   developer, app, use case, privacy/security posture, and demonstrated flow.

Suggested description:

> Publishly is a social content scheduling service. A LinkedIn member grants
> OAuth access and may publish to their own member feed or select an organization
> they are authorized to administer. Publishly stores encrypted tokens, executes
> only user-created schedules, displays per-destination status, and supports
> disconnect/deletion. It does not collect LinkedIn credentials, scrape member
> data, send unsolicited messages, or access Pages without an authorized Page
> role.

The screencast should show both callbacks as applicable: full OAuth consent,
member identity, Page selection/role, composer, scheduled publish, LinkedIn
result, failure handling, disconnect, and legal/deletion pages. Use a dedicated
reviewer workspace and test member/Page. Do not use customer credentials.

Common rejection causes: redirect mismatch; requesting scopes not assigned to
the app; vague use case; missing accessible privacy policy; a demo that does not
show OAuth and live LinkedIn output; missing Page-admin role; use of LinkedIn in
the product/app name or unlicensed logos; requesting closed member-read access;
or calling a sunset Marketing API version.

Sources:

- [LinkedIn 3-legged OAuth flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)
- [LinkedIn Posts API permissions](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api)
- [Community Management application review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)
- [Increasing LinkedIn API access](https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access)
