# Meta approval: Facebook, Instagram, and Threads

This runbook covers Publishly's four Meta OAuth providers. The product uses
official APIs only and does not claim Meta partnership or approval.

## Products and credentials

Create Business-use apps/use cases in the Meta developer portal and enable the
products that expose Facebook Login for Business, Pages API, Instagram Graph
API, Instagram API with Instagram Login, and Threads API. Meta's portal may
require separate apps/use cases for Instagram Login or Threads. Publishly keeps
their credentials separate so either layout works.

```dotenv
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
THREADS_APP_ID=
THREADS_APP_SECRET=
META_GRAPH_VERSION=v25.0
META_WEBHOOK_VERIFY_TOKEN=
```

Keep `META_GRAPH_VERSION=v25.0` for this reviewed release and run provider
canaries before a future version change. Facebook and Instagram provider calls
consume this single pin; the production verifier rejects drift.

## Exact requested permissions

Facebook Pages (`facebook`):

```text
pages_show_list
business_management
pages_manage_posts
pages_manage_engagement
pages_read_engagement
read_insights
```

Instagram Graph API through Facebook Login (`instagram`):

```text
instagram_basic
pages_show_list
pages_read_engagement
business_management
instagram_content_publish
instagram_manage_comments
instagram_manage_messages
instagram_manage_insights
pages_manage_metadata
```

Instagram API with Instagram Login (`instagram-standalone`):

```text
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_comments
instagram_business_manage_messages
instagram_business_manage_insights
```

Threads (`threads`):

```text
threads_basic
threads_content_publish
threads_manage_replies
threads_manage_insights
```

Request Advanced Access/app review only for permissions the submitted build
actually demonstrates. Do not request `threads_profile_discovery`; Publishly
does not request it.

## Exact URLs

Register these valid OAuth redirect URIs:

```text
https://publishlyapi.com/integrations/social/facebook
https://publishlyapi.com/integrations/social/instagram
https://publishlyapi.com/integrations/social/instagram-standalone
https://publishlyapi.com/integrations/social/threads
```

Configure Meta's data-deletion callback and public instructions/status page:

```text
Instagram webhook callback URL: https://publishlyapi.com/api/public/meta/webhooks/instagram
Data deletion callback URL: https://publishlyapi.com/api/public/meta/data-deletion
Data deletion instructions URL: https://publishlyapi.com/data-deletion
Privacy policy URL: https://publishlyapi.com/privacy
Terms URL: https://publishlyapi.com/terms
```

The callback verifies Meta's `signed_request` using HMAC-SHA256 against the
configured app secrets, stores only hashed identifiers, revokes matching local
connections, erases associated tenant content and analytics, and returns an
opaque confirmation URL. Replays are idempotent. The Instagram webhook verifies
Meta's challenge token and every POST's `X-Hub-Signature-256` against the
relevant app secret. Subscribe the Instagram app to `messages`. Publishly polls
the authorized Conversations API as its inbox source of truth; the signed
webhook is the low-latency notification path.

## Setup sequence

1. Deploy the final Publishly domain with HTTPS, privacy, terms, and deletion
   pages. Verify domain ownership and configure a monitored support email.
2. Create or verify the legal business and Meta Business Portfolio. Complete
   Business Verification before relying on permissions that require it.
3. Create the required app/use cases, add icons and truthful product details,
   and configure the credential pairs above.
4. Add all exact redirect URLs, app domains, privacy/terms URLs, and the signed
   data-deletion callback.
5. Add developers/testers and create a company-owned Facebook Page, an
   Instagram Professional account linked to that Page for the Facebook Login
   flow, a Professional account for Instagram Login, and a Threads profile.
6. In development mode, exercise login, token refresh, disconnect, publish,
   analytics, comment/reply operations, and customer-initiated Instagram
   conversations. Prove replies become unavailable after the 24-hour window.
7. Request the required features/Advanced Access and submit Business
   Verification/app review with a per-permission explanation and screencast.
8. After approval, switch the app live only after a second company-account
   canary and log review.

## Truthful use-case description

> Publishly is a social-media management application. A customer explicitly
> connects a Facebook Page, Instagram Professional account, or Threads profile
> they manage. Publishly publishes only content the customer creates and
> schedules, retrieves analytics for those connected resources, and retrieves
> or replies to comments and customer-initiated Instagram messages only where
> the authorized official API permits it. Instagram DM replies are limited to
> Meta's response window; Publishly does not send unsolicited messages.
> Publishly does not sell platform data, profile unrelated users, or post to an
> account that the customer has not connected.

## Screencast checklist

- Show the deployed Publishly domain and signed-in reviewer workspace.
- Connect the relevant test Page/profile and show Meta's consent screen.
- Show the Page/account picker so `pages_show_list` and
  `business_management` are visibly justified.
- Compose supported media, choose only supported destination controls, schedule
  it, and show the durable job changing to published.
- Open the returned platform permalink.
- For requested insight/comment/message permissions, open analytics and the
  supported inbox. From a second reviewer-owned account, initiate an Instagram
  DM and reply inside Publishly while the 24-hour window is visibly open.
- Disconnect the account, then show `/data-deletion` and a completed test of the
  signed callback in the app's review/development tooling.
- Make a separate short recording when a Meta product form does not accept a
  shared recording.

## Reviewer account instructions

Provide a non-production Publishly reviewer login through the protected review
form. Pre-create one workspace with a draft and license-safe media. Give the Meta
reviewer/test user the required Page role and ensure the Instagram account is
Professional and linked to that Page for the Facebook Login path. Avoid a test
account that requires an unavailable employee's 2FA step. State the exact menu
path: Integrations -> select provider -> connect; Composer -> choose test
destination -> schedule; Analytics/Inbox -> select the same destination.

## Privacy and data handling requirements

The public policy must identify the controller, contact method, data categories,
purposes, processors, retention, security, deletion and export rights, and any
cross-border handling that actually applies. It must explain that provider
tokens are encrypted, customer data is tenant-isolated, analytics snapshots are
retained according to plan/configuration, and disconnect/account deletion
removes local credentials and stored data. Do not promise deletion of posts that
already exist on Meta; those remain controlled on the destination platform.

## Common rejection causes

- The reviewer account lacks Page roles or the Instagram account is personal or
  not linked to the demonstrated Page.
- A requested permission is not visibly exercised and narrated.
- Redirect, privacy, terms, or data-deletion URLs are missing, non-HTTPS, or do
  not match the submitted app.
- The deletion callback is configured with a different app secret.
- The use case implies mass posting, unrelated-user profiling, data resale, or
  platform partnership.
- Login works for a developer but the supplied reviewer path is incomplete.
- Messaging is demonstrated with an app-admin account only, the webhook is not
  subscribed to `messages`, or the recording attempts an unsolicited or
  out-of-window message that Meta correctly rejects.

## Post-approval canary

Use company-owned test destinations. Publish one low-risk item to Facebook,
Instagram, Instagram Login, and Threads separately. Verify the permalink,
analytics/comment behavior actually granted, one customer-initiated DM reply,
webhook signature delivery, token refresh, disconnect, and one signed deletion
callback. Stop on any permission or ambiguous publish error.

Official references: [Meta Instagram API workspace](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [Meta Facebook API workspace](https://www.postman.com/meta/facebook/overview).
