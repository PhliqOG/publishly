# Platform integrations

Publishly uses provider-authorized APIs and OAuth/app-password flows. It does
not use proxy rotation, private mobile APIs, credential impersonation, CAPTCHA
bypass, device fingerprinting, or account-security bypasses. Availability in
the UI means the adapter is implemented; production access still depends on the
operator's developer app, provider review, account type, region, and API plan.

## Canonical URLs

For `FRONTEND_URL=https://app.example.com` and the reference `/api` reverse
proxy:

- OAuth redirect: `https://app.example.com/integrations/social/<identifier>`;
- backend health: `https://app.example.com/api/health`;
- Meta data-deletion callback:
  `https://app.example.com/api/public/meta/data-deletion`;
- data-deletion instructions/status: `https://app.example.com/data-deletion`.

Register redirects exactly—scheme, hostname, path, and trailing slash behavior
must match. Production OAuth must use HTTPS.

## Core provider matrix

| Identifier             | Auth/API                                    | Server credentials                               | Implemented capability notes                                                                                                                 |
| ---------------------- | ------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `facebook`             | Facebook Login + Graph API                  | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`         | Page image/video/carousel/story, first comment, analytics, comment inbox/reply                                                               |
| `instagram`            | Instagram Graph API with Facebook Login     | Facebook pair                                    | Professional accounts linked to a Page; image/video/carousel/story/reel, cover, collaborators, first comment, analytics, comment inbox/reply |
| `instagram-standalone` | Instagram API with Instagram Login          | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`       | Professional accounts; publish/cover/collaborators/first comment/analytics; no unified inbox adapter yet                                     |
| `threads`              | Threads API OAuth                           | `THREADS_APP_ID`, `THREADS_APP_SECRET`           | image/video/carousel, first comment, analytics; no unified inbox adapter yet                                                                 |
| `tiktok`               | Login Kit + Content Posting API             | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`       | video/photo/carousel/direct post and analytics; unaudited direct posts remain private; no comments adapter                                   |
| `youtube`              | Google OAuth + YouTube Data/Analytics APIs  | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`     | video/Shorts, title/description/tags, thumbnail, analytics; no comments inbox adapter                                                        |
| `x`                    | X three-legged OAuth 1.0a + X API           | `X_API_KEY`, `X_API_SECRET`                      | text/image/video/multi-image, threads/first comment, analytics when enabled; API access plan required                                        |
| `linkedin`             | OIDC + Share on LinkedIn                    | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`   | member text/image/video/multi-image/document, first comment; no member analytics/read feed                                                   |
| `linkedin-page`        | OIDC + Community Management APIs            | LinkedIn pair                                    | organization publishing/first comment/analytics; organization admin and approved product access required                                     |
| `pinterest`            | Pinterest API v5 OAuth                      | `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET` | board selection, image/video/multi-image Pin publishing and analytics                                                                        |
| `bluesky`              | AT Protocol app password                    | none                                             | text/image/video/thread/first comment; no provider analytics/inbox                                                                           |
| `mastodon`             | Dynamic OAuth app on user-selected instance | none                                             | text/image/video/thread/first comment; instance-specific limits, no aggregate analytics/inbox                                                |

“Scheduled publishing” in the capability registry means Publishly's durable
Temporal scheduler can invoke the provider at the selected time; it does not
claim that every provider offers a native schedule endpoint. Controls absent
from a provider's capability record must not be shown or accepted as supported.

## Requested scopes

The code currently requests:

- Facebook: `pages_show_list`, `business_management`, `pages_manage_posts`,
  `pages_manage_engagement`, `pages_read_engagement`, `read_insights`.
- Instagram via Facebook: `instagram_basic`, `pages_show_list`,
  `pages_read_engagement`, `business_management`,
  `instagram_content_publish`, `instagram_manage_comments`,
  `instagram_manage_insights`.
- Instagram Login: `instagram_business_basic`,
  `instagram_business_content_publish`,
  `instagram_business_manage_comments`,
  `instagram_business_manage_insights`.
- Threads: `threads_basic`, `threads_content_publish`,
  `threads_manage_replies`, `threads_manage_insights`.
- TikTok: `video.list`, `user.info.basic`, `video.publish`, `video.upload`,
  `user.info.profile`, `user.info.stats`.
- YouTube: `userinfo.profile`, `youtube.readonly`, `youtube.upload`,
  `yt-analytics.readonly`.
- LinkedIn member: `openid`, `profile`, `w_member_social`.
- LinkedIn page: `openid`, `profile`, `rw_organization_admin`,
  `w_organization_social`, `r_organization_social`.
- Pinterest: `boards:read`, `pins:read`, `pins:write`,
  `user_accounts:read`.
- X uses OAuth 1.0a app read/write permissions rather than OAuth2 scopes.

These lists are code truth, not a promise that a portal has granted them.
Request only the matching product/use case and re-run a connection canary after
any provider API version or scope change.

YouTube access tokens are refreshed on their provider-supplied expiry even for
dormant connections. An authoritative Google `invalid_grant` records and
notifies the revocation before transactionally purging Google-derived profile,
analytics, inbox, external identifier/URL, and receipt-evidence data. Transient
network, rate-limit, and 5xx failures never trigger destructive erasure.

## Platform-truth preflight

Publishly treats platform capability as changing runtime state, not as a fact
proved once during OAuth. The safe projection is refreshed after connection or
token refresh, during compose, and every six hours for existing connections.
Transitions produce durable signed webhooks; a failed projection write fails
the refresh instead of reporting a false success.

For TikTok, `POST /v2/post/publish/creator_info/query/` is authoritative for
privacy choices, disabled interaction features, and the creator-specific video
duration ceiling. The composer exposes only those choices. When TikTok returns
exactly `SELF_ONLY`, Publishly records `LIMITED / SELF_ONLY / UNAUDITED` with
code `tiktok_self_only_unaudited`, displays a private-only warning in compose
and fleet health, and blocks public intent. An operator may still intentionally
choose `SELF_ONLY`; upload-to-inbox remains distinct from direct posting.

For `instagram` (Facebook Login), Publishly re-reads the selected Facebook Page
and Instagram nodes. The Page's `instagram_business_account.id` must match the
selected Instagram ID, and the account must report `BUSINESS` or `CREATOR`.
Stories additionally require `BUSINESS`. Before save, tenant-owned upload
metadata is checked for attachment count, JPEG-convertible image size/aspect,
MP4 video size/width/duration, Story shape, and Trial-Reel shape. Missing,
cross-tenant, pending, or path-mismatched media fails at compose time with a
machine code and reason. This Page requirement does not apply to
`instagram-standalone`.

## Official references

- Meta's official Instagram collection documents Professional-account limits,
  Page linking, content publishing, and its required permissions:
  <https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api>
- TikTok Content Posting API and audit rules:
  <https://developers.tiktok.com/products/content-posting-api> and
  <https://developers.tiktok.com/doc/content-sharing-guidelines>
- YouTube server-side OAuth:
  <https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps>
- LinkedIn member sharing and current Posts API:
  <https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin>
  and
  <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-06>
- Pinterest authorization:
  <https://developer.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/>
- X OAuth 1.0a authorization:
  <https://docs.x.com/fundamentals/authentication/oauth-1-0a/authorizing-a-request>

## Preserved upstream providers

The provider manager also preserves useful upstream adapters such as Reddit,
Google Business Profile, Discord, Slack, Telegram, Twitch, WordPress, Medium,
Dev.to, Hashnode, Nostr, Lemmy, Tumblr, and others. Discovery returns their
configuration and capability state. They are not part of the initial approval
promise; validate their official access terms and canary each before exposing it
commercially. Cookie/extension-based Skool connection is intentionally not
registered.

## Approval status

No approval or partnership is asserted by this repository. See the canonical
[platform approval package](platform-approval/README.md). The application is
credential-independent: absent groups disable only that provider, allowing the
rest of Publishly to build, test, and run.
