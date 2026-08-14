# Publishly approval and production launch playbook

Last researched and reconciled with the deployed code contract: 2026-08-14.

This is the operator checklist for taking Publishly from a verified build to a
public service with provider access. It is designed to maximize the quality and
consistency of each submission. No process can guarantee approval: Meta,
TikTok, Google, LinkedIn, Pinterest, and X make independent decisions and can
change their portals or policies. Re-open every official source linked below on
the day you submit.

The canonical machine-readable contract is
`data/provider-approval-manifest.json`. The public reviewer version is
`https://YOUR_DOMAIN/platform-review`. Run `pnpm verify:providers` before every
submission; if it fails, do not record or submit evidence.

## 1. What is already implemented

- The public website and product use the same ten featured network names.
- OAuth callbacks, exact scopes, permission purposes, review paths, and official
  references live in one verified manifest.
- OAuth authorization requests use 256-bit URL-safe state, bind the saved state
  to the expected provider, and atomically consume it exactly once on callback.
  TikTok's web token exchange intentionally omits the mobile/desktop-only PKCE
  verifier parameter.
- `/privacy`, `/terms`, `/acceptable-use`, `/data-deletion`, `/security`,
  `/status`, `/contact`, and `/platform-review` render without login.
- Meta Graph calls use one `META_GRAPH_VERSION=v25.0` pin.
- Pinterest no longer requests unused `boards:write`; YouTube no longer requests
  broad `youtube.force-ssl`.
- TikTok fetches current creator information when its compose screen opens,
  shows the creator, exposes only returned privacy options with no default,
  enforces capability flags, defaults interactions/disclosure off, requires
  the Music Usage Confirmation declaration, and uses URL pull for production
  server-hosted media.
- YouTube disconnect calls Google's revocation endpoint before local provider
  data deletion. A temporary revocation failure is classified and returned as
  retryable instead of falsely reporting deletion.
- Dormant YouTube connections are refreshed at each provider-supplied token
  expiry. An authoritative Google `invalid_grant` is recorded/notified and
  automatically purges Google-derived data; transient failures do not erase an
  account.
- Bluesky asks for a dedicated revocable App Password and never asks a user to
  disable 2FA. Mastodon dynamically registers an app on each selected instance.
- Production preflight fails on placeholder legal identity, inconsistent URLs,
  unverified TikTok media origin, wrong Meta version, missing launch-provider
  credentials, unsafe flags, or incomplete infrastructure/billing configuration.

## 2. Operator-owned values required before any submission

Do not invent these values and do not submit with template text. Put truthful
values in `.env.production` and the relevant portal:

```dotenv
PUBLISHLY_DOMAIN=app.your-real-domain.com
MAIN_URL=https://app.your-real-domain.com
FRONTEND_URL=https://app.your-real-domain.com
NEXT_PUBLIC_BACKEND_URL=https://app.your-real-domain.com/api
NEXT_PUBLIC_BRAND_NAME=Publishly
NEXT_PUBLIC_SUPPORT_EMAIL=support@your-real-domain.com
NEXT_PUBLIC_PRIVACY_EMAIL=privacy@your-real-domain.com
NEXT_PUBLIC_LEGAL_ENTITY_NAME=Your exact registered entity
NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS=Your complete legal postal address
NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE=YYYY-MM-DD
NEXT_PUBLIC_GOVERNING_LAW=State or country, country
NEXT_PUBLIC_SOURCE_URL=https://public-source-host/exact-deployed-source
META_GRAPH_VERSION=v25.0
```

The entity name, address, domain, app name, icon, support address, privacy
contact, and portal business records must agree. Small inconsistencies create
avoidable manual-review questions.

Also prepare:

1. A real business email on the verified domain, not a disposable mailbox.
2. Search Console/domain ownership in the same Google account that owns or edits
   the Google Cloud production project.
3. A stable HTTPS media origin such as `https://media.your-real-domain.com`.
4. A complete Publishly icon (square, high resolution) and wordmark with no
   platform logo or implied partnership.
5. Owner-controlled test profiles, Pages, channels, boards, and organizations.
   Never give a reviewer a customer's account.
6. A dedicated reviewer workspace with the smallest role needed to complete the
   demonstrated flow and clean, non-sensitive test media.
7. A screen recorder capable of sharp 1080p or higher video, readable browser
   URL bar, readable consent text, and narration.
8. A private credential handoff text file for each provider portal. Never put
   passwords, client secrets, or reviewer credentials in this repository or a
   public video description.

## 3. Universal no-submit gate

Complete every line before submitting to a provider:

- [ ] Final production domain resolves over HTTPS with no certificate warning.
- [ ] Homepage is public and explains the real multi-brand/multi-client product;
      it is not a login-only shell.
- [ ] `/privacy`, `/terms`, `/data-deletion`, `/security`, `/contact`, `/status`,
      and `/platform-review` return HTTP 200 without authentication.
- [ ] Legal pages display the real entity, address, effective date, support and
      privacy contacts; no `CHANGE_ME`, example domain, local placeholder, or
      “draft template” text is present.
- [ ] Privacy page describes each requested data type and purpose, retention,
      sharing, security, revocation, deletion, and Google Limited Use.
- [ ] App name, icon, domain, privacy URL, terms URL, and described use case are
      identical across the website and portal.
- [ ] Only permissions in `data/provider-approval-manifest.json` are requested.
- [ ] Every requested permission is exercised in the live production build and
      is visible in the provider-specific recording.
- [ ] Reviewer login works in a clean/incognito browser with no employee VPN.
- [ ] Test account has the correct role, no pending security challenge, and no
      real customer data.
- [ ] A test post reaches `confirmed_live`, its live URL opens, and disconnect
      removes/revokes authorization.
- [ ] A controlled failure displays a non-empty reason/code (for example invalid
      media or creator-disabled interaction); the reviewer never sees a spinner
      or red state with no explanation.
- [ ] `pnpm verify:providers` passes.
- [ ] `pnpm verify:production` passes against the exact production env file.
- [ ] The launch audit runs with `--process-env` inside the deployed `frontend`
      container and passes against `https://publishlyapi.com` after DNS
      cutover. This proves the actual deployed environment and domain still
      match the reviewed source/environment contract.
- [ ] `verify-public-signup.cjs` passes inside the deployed `frontend`
      container. It must verify HTTP 200, the secure HTTP-only session cookie,
      committed persistence, and successful cleanup of its disposable account.

Save evidence under a private structure such as:

```text
review-evidence/2026-08-11/<provider>/
  01-public-site.png
  02-consent.png
  03-feature.mp4
  04-live-result.png
  05-disconnect.png
  submission-fields.txt
  reviewer-credentials.txt   # private secret manager only, never Git
```

Record only the relevant browser window. Close personal tabs, notifications,
password managers, cloud consoles containing secrets, and unrelated apps.

## 4. Reusable portal description

Use this as a base, then add the provider-specific purpose below:

> Publishly is a social publishing and scheduling service for agencies,
> multi-brand and multi-location operators, and creator teams. A user connects
> only accounts they own or are authorized to manage through the platform's
> official authorization flow. The user selects the destination, reviews the
> content and platform-specific settings, and explicitly creates or schedules
> the post. Publishly records per-destination delivery stages, independently
> confirms that a post exists on-platform, explains every failure, and supports
> disconnect and data deletion. Publishly does not collect platform passwords,
> scrape the platform, automate engagement, or access unapproved accounts.

Do not call Publishly an internal upload tool, bot network, mass-account tool,
account farm, engagement automation service, or platform partner.

## 5. Recommended order

The initial Publishly production gate uses
`PUBLISHLY_REQUIRED_PROVIDERS=instagram,tiktok`. This matches the first launch
objective and prevents unapproved networks from being treated as launch-ready.
The code and public capability documentation may retain later-stage adapters,
but add another provider to the required set only after its credentials,
review, revocation flow, and end-to-end canary are complete.

1. Deploy the public production shell and complete the universal gate.
2. Prove Bluesky and Mastodon (no central approval) end to end.
3. Configure Google OAuth in Testing and LinkedIn member sharing.
4. Configure Meta development roles/testers and TikTok Sandbox/unaudited mode.
5. Obtain Pinterest Trial access.
6. Configure and fund X developer access.
7. Record all evidence from the same production release.
8. Submit Google OAuth verification, Meta permissions, TikTok production/audit,
   Pinterest Standard, and finally LinkedIn Community Management Standard only
   after its live Page flow is flawless.

The LinkedIn Standard submission is intentionally late: LinkedIn states that a
rejected Community Management application cannot simply reapply; a new app is
required. Do not spend that attempt on a partial demo.

## 6. Meta: Facebook Pages, Instagram, and Threads

Official starting points: [Meta App Review](https://developers.facebook.com/docs/app-review/),
[submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide),
[business verification](https://developers.facebook.com/docs/development/release/business-verification),
and [Graph API versioning](https://developers.facebook.com/docs/graph-api/changelog/versions).

### Portal configuration

Use the final origin in every field:

```text
Website:              APP_ORIGIN
Privacy:              APP_ORIGIN/privacy
Terms:                APP_ORIGIN/terms
Deletion instructions:APP_ORIGIN/data-deletion
Deletion callback:    APP_ORIGIN/api/public/meta/data-deletion
Facebook callback:    APP_ORIGIN/integrations/social/facebook
Instagram callback:   APP_ORIGIN/integrations/social/instagram
Instagram Login:      APP_ORIGIN/integrations/social/instagram-standalone
Instagram webhook:    APP_ORIGIN/api/public/meta/webhooks/instagram
Threads callback:     APP_ORIGIN/integrations/social/threads
```

Facebook permissions:

```text
pages_show_list
business_management
pages_manage_posts
pages_manage_engagement
pages_read_engagement
read_insights
```

Instagram through Facebook Login permissions:

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

Instagram Login permissions (submit with the separate Instagram Login app/use
case when that connection option is enabled):

```text
instagram_business_basic
instagram_business_content_publish
instagram_business_manage_comments
instagram_business_manage_messages
instagram_business_manage_insights
```

Threads permissions:

```text
threads_basic
threads_content_publish
threads_manage_replies
threads_manage_insights
```

`business_management` is justified by Publishly's target user: agencies and
multi-brand operators must discover business-owned and client Pages they are
authorized to manage. The recording must show that selection; otherwise remove
the permission before submission.

### Business and app preparation

1. Complete developer/business verification for the real legal entity.
2. Ensure the submitting account is an app admin and has the appropriate Page,
   Business Portfolio, Instagram, and Threads test roles.
3. Use a professional Instagram Business or Creator account linked to a
   Facebook Page for the Facebook Login flow. Story publishing requires a
   Business account; Publishly surfaces that restriction at compose time.
4. Add development-role/tester accounts and accept every pending invitation.
5. Configure the signed Meta data-deletion callback and test it with the app
   secret. Confirm the returned status URL is public and contains no user id.
6. Set a unique 32+ character `META_WEBHOOK_VERIFY_TOKEN`, configure the
   Instagram webhook callback, subscribe to `messages`, and prove signed
   delivery. Never log message bodies from the webhook.
7. Keep `META_GRAPH_VERSION=v25.0` in the reviewed release.
8. In the security-review notes, state that the callback rejects weak,
   replayed, expired, or cross-provider OAuth state before linking an account.

### Evidence recording (one focused recording per permission group)

1. Show the public website/legal pages and the browser URL.
2. Sign in to the reviewer workspace and start Connect.
3. Show the complete Meta consent screen and requested permissions.
4. Facebook: choose a Page, including the business/client Page selector; create
   a small Page post; show queued/uploading/sent/confirmed_live and the live
   permalink; show a comment read/reply; show Page/post insights.
5. Instagram: select the linked professional account; show compose-time account
   and media preflight; publish one image or Reel; open receipt/permalink; show
   comments and insights. From a second reviewer-owned profile, initiate a
   direct message; show it in Publishly and reply inside the 24-hour response
   window. Demonstrate Story only if requesting/reviewing it.
6. Threads: publish/confirm one thread, show reply management and insights.
7. Disconnect and show stored access removed. Separately demonstrate the signed
   deletion callback/status flow.

In each permission explanation, name the exact on-screen action and timestamp
where the reviewer sees it. Do not submit one vague paragraph for all scopes.

### Common Meta rejection traps

- Reviewer cannot reach the feature because test credentials, role invitation,
  2FA, or Page/Business assignment is missing.
- Permission explanation describes future use rather than the visible build.
- `business_management` requested but business/client Page selection is absent.
- Instagram consumer account or missing Facebook Page link.
- Privacy/deletion URLs redirect to login or disagree with portal identity.
- Recording hides the consent screen, URL, final live post, or data deletion.
- App is left in development mode or advanced access is not actually granted.

### Secrets after approval

```dotenv
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
META_WEBHOOK_VERIFY_TOKEN=...
THREADS_APP_ID=...
THREADS_APP_SECRET=...
META_GRAPH_VERSION=v25.0
```

If the separate Instagram Login product is launched later, also supply
`INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` and follow the dedicated adapter
runbook. It is not required for the featured Instagram-through-Facebook path.

## 7. TikTok Login, Display API, and Content Posting audit

Official sources: [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/),
[App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines?enter_method=left_navigation),
and [Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide).

### Understand the pre-audit limitation

An unaudited Direct Post client is limited to `SELF_ONLY` posts, a small active
user population (normally five users in 24 hours), and creator posting caps.
The connected account may also be forced private. This is expected sandbox
behavior, not proof that public posting works. Publishly exposes the exact
SELF_ONLY state in API/UI and never marks it as a public success.

### Portal configuration

Enable Login Kit, Display API, and Content Posting API (Direct Post and upload
to TikTok). Configure:

```text
Web/Desktop URL:       APP_ORIGIN
Redirect URI:          APP_ORIGIN/integrations/social/tiktok
Privacy:               APP_ORIGIN/privacy
Terms:                 APP_ORIGIN/terms
Deletion:              APP_ORIGIN/data-deletion
Support:               APP_ORIGIN/contact
Verified media prefix: exact HTTPS S3/R2 public prefix used by Publishly
```

Request exactly:

```text
video.list
user.info.basic
video.publish
video.upload
user.info.profile
user.info.stats
```

### Before recording

1. Use a custom Publishly name and icon matching the live domain. Do not place a
   TikTok logo in the app icon or watermark exported media.
2. Use Sandbox for the first review setup and owner-controlled accounts.
3. Verify the website and production media URL prefix in TikTok URL properties.
   Set `TIKTOK_MEDIA_URL_PREFIX_VERIFIED=true` only after it succeeds.
4. Make the product available to the intended broad customer class. TikTok's
   audit guidance rejects a private/internal utility built for a few accounts.
5. Remove unused products/scopes. Be prepared to upload up to five concise demo
   videos; keep each below the portal's current size limit (50 MB at research
   time).
6. In the security-review notes, identify the integration as a web Login Kit
   flow: Publishly sends strong one-time state and keeps `client_secret` in the
   server-side token request; it does not send a mobile/desktop-only
   `code_verifier` without a matching web authorization challenge.

### Mandatory UI sequence to show

1. Open the TikTok compose page and visibly trigger the current
   `creator_info/query` request.
2. Show the creator nickname.
3. Show only privacy options returned by creator-info. The selector must start
   blank; do not preselect Public, Friends, or Self only.
4. Show comment/Duet/Stitch unchecked by default. Show creator-disabled controls
   greyed out. Do not display Duet/Stitch for a photo post.
5. Show editable text, selected media, and a clear preview with no Publishly or
   TikTok watermark burned into the asset.
6. Turn content disclosure on. Show that the user must select Your brand,
   Branded content, or both; show Promotional content versus Paid partnership;
   show branded content blocked with private visibility.
7. Show the unchecked declaration: “By posting, you agree to TikTok's Music
   Usage Confirmation.” Check it manually. No API or default may pre-consent.
8. Click publish only after explicit consent. Show processing/polling and the
   final receipt. Also show upload-to-inbox as a distinct non-live outcome.
9. Show account/post stats and post listing to justify the three read scopes.

Suggested TikTok-specific copy:

> Publishly is a user-directed social publishing service for agencies,
> multi-brand operators, and creator teams. The creator sees their current
> TikTok identity, TikTok-returned privacy/capability options, editable text,
> media preview, interaction and disclosure controls, and the required music
> declaration before explicitly sending. Publishly uses URL pull from its
> verified media domain, polls TikTok processing, and independently confirms
> delivery. It does not watermark content, automate engagement, or silently
> represent unaudited SELF_ONLY posts as public.

### Common TikTok rejection traps

- Generic app name/icon, different website identity, unverified media URL, or
  temporary/signed media URL outside the verified prefix.
- Internal-team-only use case, fewer than a meaningful customer audience, or a
  demo that looks like a developer upload utility.
- Privacy or interaction defaults, stale creator info, missing nickname,
  disabled options still selectable, or missing explicit consent.
- Commercial disclosure incomplete or branded/private combination allowed.
- Server-hosted video sent as FILE_UPLOAD instead of PULL_FROM_URL.
- Demo omits an approved product/scope or shows a watermark.

### Secret and canary

```dotenv
TIKTOK_CLIENT_ID=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_MEDIA_URL_PREFIX_VERIFIED=true
```

After audit approval, connect a fresh non-review account and publish one private
canary first, then one public canary only if creator-info actually returns
`PUBLIC_TO_EVERYONE`. Never infer approval solely from a portal label.

## 8. Google OAuth verification and YouTube quota

Official sources: [OAuth app verification](https://support.google.com/cloud/answer/13464321?hl=en),
[verification requirements](https://support.google.com/cloud/answer/13461325?hl=en),
[demo video requirements](https://support.google.com/cloud/answer/13463073?hl=en-GB),
[server-side OAuth](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps),
and [YouTube quota/compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits).

### Cloud configuration

1. Create separate development/test and production Google Cloud projects.
2. Enable YouTube Data API v3 and YouTube Analytics API in production.
3. Configure an External consent screen named Publishly with the real logo,
   homepage, privacy, terms, and authorized domain.
4. Verify domain ownership in Search Console using an owner/editor of the same
   project. Keep project owner/editor contact emails current.
5. Create a Web application OAuth client with exact redirect:
   `APP_ORIGIN/integrations/social/youtube`.
6. Request only:

```text
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/yt-analytics.readonly
```

### Scope justifications

- `userinfo.profile`: label the channel connection with the consenting user's
  profile identity.
- `youtube.upload`: upload only the video/title/metadata the user explicitly
  schedules.
- `youtube.readonly`: read the connected channel and uploaded video to verify it
  exists and provide the confirmed live URL.
- `yt-analytics.readonly`: show the channel owner's YouTube-reported performance
  inside their private workspace.

Do not request `youtube.force-ssl`, partner/CMS, comment, rating, Gmail, Drive,
or future-use scopes.

### Verification video

Use English UI and show the entire browser window:

1. Public homepage, privacy page (including Google Limited Use), data deletion,
   and Google third-party-access link.
2. Reviewer sign-in and Connect YouTube.
3. Exact Google consent screen with every requested scope visible.
4. Connected channel identity, upload composer, explicit schedule/publish, and
   the YouTube result.
5. Receipt changing to confirmed_live only after an independent YouTube read.
6. YouTube Analytics displayed in the private workspace.
7. Disconnect: show the request to `https://oauth2.googleapis.com/revoke`, local
   provider-data removal, and the app disappearing from Google permissions.
8. In a separate private test, revoke access from Google Account settings and
   verify that the next hourly refresh emits `connection.reconnect_required`,
   removes the connection from the active fleet, and purges provider-derived
   identifiers/analytics. Do not manufacture this response in the reviewer
   recording; use Google's real revocation control.

The Privacy Policy must state that use/transfer of Google data adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including Limited Use, and explain access, use, storage, sharing, retention,
revocation, and deletion. Publishly's public policy does so; confirm the final
operator details before recording.

### Quota

New projects normally receive 10,000 YouTube Data API units/day. Measure real
canary cost. If production demand exceeds it, complete the quota extension form
and compliance audit with honest current/forecast usage, architecture, user
controls, and stored-data behavior. Do not inflate customer counts.

### Rejection traps

- Homepage redirects to login, domain is not verified, privacy link differs
  between site and consent screen, or app name/logo mismatch.
- Video crops the URL/consent text, is not narrated, omits a scope, or shows a
  different project/client than the submission.
- Broad future-use scope, vague justification, or no visible feature for a
  scope.
- No easy disconnect, local-token-only deletion, or missing Google Limited Use
  disclosure/revocation link.

```dotenv
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
```

## 9. LinkedIn member and organization/Page access

Official sources: [Community Management app review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review?view=li-lms-2026-01),
[Community Management overview](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-02),
[self-serve Share on LinkedIn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin),
and [OAuth authorization code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

### App prerequisites

- Real legal organization and commercial use case.
- Business-domain email, legal name/address, public site/privacy, and verified
  domain.
- LinkedIn Page associated with the app; submitter able to complete Page super
  admin verification.
- Development tier first. Apply for Standard only after the Page integration is
  fully live and reviewable.

Callbacks:

```text
APP_ORIGIN/integrations/social/linkedin
APP_ORIGIN/integrations/social/linkedin-page
```

Member scopes: `openid profile w_member_social`.

Page scopes: `openid profile rw_organization_admin w_organization_social
r_organization_social`.

Do not request `r_member_social`; LinkedIn has closed it to new requests. Do not
promise personal-post analytics/comments that the current access does not expose.

### Record two separate journeys

Member recording: OAuth, member identity, compose, publish through
`w_member_social`, receipt, live post, disconnect.

Page recording: OAuth, authorized Page discovery/role, organization post,
confirmed result, displayed comments/social activity and organization analytics
that the approved APIs return, disconnect. LinkedIn asks for downloadable,
high-resolution, narrated evidence showing only relevant windows. Provide live
test credentials in the protected form.

Explicitly state which Community Management features are absent. A truthful
smaller scope is safer than implying full moderation/listening coverage.

### Do-not-submit warning

Do not request Standard if the live Page flow, test credentials, narration,
downloadable video, consent, final LinkedIn result, legal site, or stated use
case is incomplete. A rejected Community Management application cannot simply
reapply; LinkedIn requires a new app.

```dotenv
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
```

## 10. Pinterest Trial then Standard

Official sources: [Access tiers](https://developers.pinterest.com/docs/key-concepts/access-tiers/),
[connect an app](https://developers.pinterest.com/docs/getting-started/connect-app/),
and [OAuth setup](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/).

1. Use a Pinterest business account with verified email.
2. Submit the accurate scheduling use case for Trial access.
3. Configure exact redirect `APP_ORIGIN/integrations/social/pinterest`; do not
   bounce through a second redirect.
4. Request only `boards:read pins:read pins:write user_accounts:read`.
5. In Trial, prove OAuth, account identity, existing-board listing, original Pin
   creation, read/confirmation, analytics, and disconnect. Trial-created Pins
   and Boards are creator-only sandbox data; do not call them public.
6. Deploy the live integration, then request Standard with an accessible privacy
   policy, precise use case, test credentials, and a video showing authorization
   plus a real API action and resulting Pin.

Common denials: inaccessible/inaccurate privacy page, vague description, missing
OAuth or live action in the video, wireframe/mock rather than the live product,
secondary redirect, unused scopes, or applying for Standard before Trial proof.

```dotenv
PINTEREST_CLIENT_ID=...
PINTEREST_CLIENT_SECRET=...
```

## 11. X developer access

Official sources: [Developer Portal](https://docs.x.com/fundamentals/developer-portal),
[developer apps](https://docs.x.com/fundamentals/developer-apps), and
[create post](https://docs.x.com/x-api/posts/create-post).

X currently uses self-service pay-per-use credits rather than an app-review tier
like LinkedIn. Create the production project/app, accept the agreement, set user
authentication to Read and write (not Direct Messages), and configure exact
OAuth 1.0a callback `APP_ORIGIN/integrations/social/x`. Use separate apps for
development/staging/production, fund credits, and configure a spend cap/alert.

Connect an owner-controlled account, publish one text and one supported media
canary, confirm the post URL, and disconnect. The post source label will reflect
the app name/site. X tokens have no stated fixed expiry but may be revoked or
suspended; fleet health must continue to treat authentication errors as action
needed.

```dotenv
X_API_KEY=...
X_API_SECRET=...
```

## 12. Bluesky and Mastodon (no central approval)

Bluesky has no operator app secret. The user creates a dedicated App Password in
Settings - Privacy and Security - App Passwords. Keep 2FA enabled, never request
the main password, publish a canary, then prove the App Password can be revoked.
See [Bluesky's user FAQ](https://bsky.social/about/blog/5-19-2023-user-faq) and
[API getting started](https://docs.bsky.app/docs/get-started).

Mastodon has no global secret or review. The user supplies a public instance
origin; Publishly registers a scoped client with `POST /api/v1/apps`, authorizes
`profile write:statuses write:media`, and stores the per-instance details
encrypted. Test at least two instances because policies and limits vary. See
[Mastodon Applications API](https://docs.joinmastodon.org/methods/apps/).

## 13. Secret mapping and production handoff

After the provider portals grant the applicable access, add only the following
provider secrets to the already completed production environment:

| Network              | Production secret values                         |
| -------------------- | ------------------------------------------------ |
| Facebook + Instagram | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`         |
| TikTok               | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`       |
| YouTube              | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`     |
| X                    | `X_API_KEY`, `X_API_SECRET`                      |
| Threads              | `THREADS_APP_ID`, `THREADS_APP_SECRET`           |
| LinkedIn             | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`   |
| Pinterest            | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` |
| Bluesky              | none; per-user App Password at connection time   |
| Mastodon             | none; per-instance dynamic registration          |

Never paste secrets into build logs, screenshots, tickets, source control, or a
review explanation. Put them in the production secret manager/environment.

## 14. Deploy after secrets are attached

From the repository root on the production host:

```powershell
pnpm install --frozen-lockfile
pnpm verify:providers
pnpm verify:production
docker compose --env-file .env.production -f deploy/compose.production.yaml config --quiet
docker compose --env-file .env.production -f deploy/compose.production.yaml build --pull
docker compose --env-file .env.production -f deploy/compose.production.yaml up -d
docker compose --env-file .env.production -f deploy/compose.production.yaml \
  exec -T frontend node scripts/audit-live-launch.cjs \
  --process-env --origin https://publishlyapi.com
docker compose --env-file .env.production -f deploy/compose.production.yaml \
  exec -T frontend node scripts/verify-public-signup.cjs \
  --origin https://publishlyapi.com
docker compose --env-file .env.production -f deploy/compose.production.yaml ps
```

The `migrate` service must finish successfully before applications become
healthy. Backend provider discovery and orchestrator workflow-bundle loading
can take several minutes on a cold host. The production health policy allows up
to ten minutes but Caddy will not expose traffic until the strict probes pass;
do not treat a merely `running` container as ready. Confirm:

```text
GET https://YOUR_DOMAIN/
GET https://YOUR_DOMAIN/privacy
GET https://YOUR_DOMAIN/platform-review
GET https://YOUR_DOMAIN/status
GET https://YOUR_DOMAIN/api/health
```

Then run one low-volume canary per provider in this order: connect, refresh
platform truth, compose/preflight, publish, receipt through confirmed_live,
webhook receipt, analytics/read capability where approved, disconnect/revoke.
Use one destination at a time until all ten pass.

## 15. Final go-live decision

Go live only when all of the following are true:

- Production/provider verifiers, unit/integration suites, typechecks, lint,
  builds, Prisma validation, and migration status pass on the exact release.
- Public legal/reviewer/status routes are reachable from an external network.
- Platform portals show the required production access; do not equate saved
  credentials, development/test access, or TikTok SELF_ONLY with approval.
- Every advertised Connect button is configured and has a successful canary.
- Webhook signing/retries, backups/restore test, monitoring, mail delivery,
  Stripe live mode, DNS/TLS, and incident contacts are operational.
- Reviewer and test credentials have been removed or rotated after review where
  appropriate.
- The public site claims only capabilities actually approved and live. If one
  provider remains restricted, surface that limitation rather than silently
  marketing it as fully public.

Keep the evidence bundle, portal decision, approved scopes, app/version IDs,
submission date, and canary receipt in the private release record. Re-run this
playbook whenever a scope, callback, product feature, legal entity, domain, or
major provider API version changes.
