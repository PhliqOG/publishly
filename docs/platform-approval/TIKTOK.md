# TikTok production review runbook

Last verified against TikTok's official documentation: 2026-08-14. Portal
labels and requirements can change; recheck the linked sources immediately
before submission. Approval is external and is not represented as complete.

In this file, `APP_ORIGIN` means the public HTTPS value of `FRONTEND_URL`, for
example `https://publishlyapi.com`. It must not end with `/`.

## Products and credentials

Add Login Kit/authorization, Display API, and Content Posting API. Enable both
Direct Post and Upload-to-TikTok because Publishly exposes an explicit choice:
directly publish with the creator's selected settings, or send a draft to the
creator's TikTok inbox for final editing.

Set these only in the production secret manager:

```dotenv
TIKTOK_CLIENT_ID=<TikTok client key>
TIKTOK_CLIENT_SECRET=<TikTok client secret>
FRONTEND_URL=https://publishlyapi.com
TIKTOK_MEDIA_URL_PREFIX_VERIFIED=true
```

Publishly requests the scopes its current adapter enforces:

| Scope               | Truthful use in Publishly                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `user.info.basic`   | Identify the account selected by the consenting user and show its display name/avatar.                              |
| `user.info.profile` | Show the connected profile link and profile context.                                                                |
| `user.info.stats`   | Display platform-reported account totals; never estimate missing metrics.                                           |
| `video.list`        | Reconcile the user's own published videos and retrieve platform-reported post details.                              |
| `video.publish`     | Direct-post media only after the user selects TikTok, chooses publish settings, and schedules or confirms the post. |
| `video.upload`      | Send media to the user's TikTok inbox as a draft only when the user explicitly selects upload-without-posting.      |

Do not request Research API, direct-message, portability, advertising, or other
unimplemented scopes.

## URLs to configure

| Portal field                          | Production value                                             |
| ------------------------------------- | ------------------------------------------------------------ |
| Web/Desktop URL                       | `APP_ORIGIN`                                                 |
| Redirect URI                          | `APP_ORIGIN/integrations/social/tiktok`                      |
| Privacy policy                        | `APP_ORIGIN/privacy`                                         |
| Terms of service                      | `APP_ORIGIN/terms`                                           |
| Data deletion instructions            | `APP_ORIGIN/data-deletion`                                   |
| Support/contact                       | `APP_ORIGIN/contact`                                         |
| Content Posting upload/media property | The exact HTTPS domain or URL prefix serving Publishly media |

The adapter polls TikTok's post-status endpoint. It does not consume a TikTok
webhook, so no webhook URL is required for the current integration. Do not add
an unrelated webhook product merely to fill a portal field.

`SEND_TO_USER_INBOX` proves only that TikTok delivered an inbox notification;
it is not proof that a post is live. Publishly keeps the job unconfirmed until
TikTok returns `PUBLISH_COMPLETE`, and only that later response can create a
`confirmed_live` receipt. Do not state an inbox-draft expiry unless TikTok adds
one to its official documentation.

TikTok photo and production server-hosted video posting use `PULL_FROM_URL`;
verify ownership of the exact media domain or URL prefix. `FILE_UPLOAD` remains
only for local-device/development files. Set
`TIKTOK_MEDIA_URL_PREFIX_VERIFIED=true` only after portal verification; the
production preflight otherwise refuses a TikTok launch.

## Exact setup sequence

1. Deploy Publishly behind HTTPS on the final domain. Fill the operator,
   controller identity, jurisdiction, retention, subprocessors, and contact
   details in the legal templates before making them public.
2. Create or verify the TikTok for Developers owner account and complete any
   developer or business identity checks the portal requests.
3. Create a Web app named Publishly. Do not use TikTok branding in the app name
   or imply partnership. Upload
   `apps/frontend/public/publishly-app-icon-512.png` as the matching 512 x 512
   app icon.
4. Add the products above, enable Content Posting API Direct Post, and register
   the redirect and public URLs exactly as listed.
5. Verify ownership of the app and media URL properties. If S3/R2 uses a custom
   media hostname, verify that hostname rather than an unstable signed URL.
6. Request only the six scopes in the table and paste the client key/secret into
   the production secret manager.
7. Redeploy, confirm the provider-health UI marks TikTok configured, and connect
   an owner-controlled TikTok test account.
8. Open the TikTok composer and show its fresh creator-info request, creator
   nickname, no-default privacy selector, disabled creator-restricted controls,
   preview, disclosure choices, and unchecked Music Usage Confirmation. Test
   one direct video, one direct photo (if reviewed), and one upload-to-inbox
   flow. Confirm post-status reconciliation.
9. Record the screencast and submit the Production revision. TikTok currently
   accepts up to five demo videos, each no larger than 50 MB; the first-time
   recording must demonstrate the Sandbox integration on the same domain and
   UI being submitted. After Direct Post works, complete the Content Posting
   audit required to remove unaudited-client visibility restrictions.

## Suggested truthful review description

> Publishly is a multi-tenant social-media scheduling service. A user connects
> only their own TikTok account through TikTok OAuth. They choose TikTok for a
> post, upload media, review TikTok-specific controls and either schedule a
> Direct Post or explicitly send the media to their TikTok inbox as a draft.
> A durable server-side worker performs the requested action even when the
> browser is closed, polls TikTok for final status, and shows errors without
> fabricating success. Publishly does not collect TikTok passwords, scrape
> TikTok, automate engagement, or post without user authorization.

## Scope justifications

- `video.publish`: required for the user-facing Direct Post option shown in the
  composer. The screencast must show the final preview, creator settings, and
  explicit schedule/publish action.
- `video.upload`: required for the separate "upload without posting" option.
  The UI explains that the creator finishes editing/publishing in TikTok.
- `video.list`: used to reconcile the connected creator's own posts and display
  platform-returned details/status.
- Profile/stat scopes: used on the connection and analytics screens for the
  authorized account only. Remove `user.info.profile` or `user.info.stats` from
  both code and the review request if those screens are disabled at launch.

## Screencast checklist

- Use the production-looking Publishly build and final domain, with no debug
  panels or placeholder legal/contact text.
- Start logged out of TikTok, then show Connect account, the complete TikTok
  consent screen, every requested scope, and the redirect back to Publishly.
- Show the connected account name/avatar and the Disconnect control.
- Create a valid post, select TikTok, show only supported TikTok controls,
  choose a privacy option returned by creator-info, and schedule it.
- Show the Temporal-backed pending state, final published/failed state, and the
  resulting TikTok post. Do not edit the video to hide delays or consent.
- Separately show upload-to-inbox and the notice that the creator must finish in
  TikTok. If photos are requested, show a photo served from the verified media
  domain.
- Show account deletion/disconnection and the public privacy, terms, contact,
  and data-deletion pages.

## Reviewer test-account instructions

Create a dedicated Publishly reviewer user and workspace with no other customer
data. Provide the reviewer its Publishly credentials through the portal's
secure field, plus a TikTok test account if TikTok asks for one. Instructions:

1. Sign in to Publishly and open **Connections**.
2. Select **TikTok**, authorize the supplied TikTok account, and return to the
   workspace.
3. Open the composer, upload the supplied compliant test video, select TikTok,
   choose visible creator settings, and schedule it several minutes ahead.
4. Observe Scheduled → Processing → Published and open the result URL.
5. Repeat with **Upload without posting**, then confirm the TikTok inbox item.
6. Disconnect the account from Publishly settings. Confirm Publishly calls
   TikTok's OAuth v2 revoke endpoint before deleting the local connection and
   that the app no longer appears as active in TikTok's app permissions.

Before submitting, run the automated OAuth lifecycle tests. They must prove
that refresh preserves TikTok's returned (potentially rotated) refresh token,
rechecks the granted scopes, renews before the advertised expiry, and rejects
provider errors without recording an incomplete credential set.

Never place a production customer token or shared administrator credential in
review instructions.

## Common rejection causes

- The redirect URI, app domain, media URL prefix, or legal URLs are not verified
  or do not exactly match the submitted production app.
- The screencast omits OAuth consent, creator-info-driven controls, the final
  TikTok result, or a requested scope.
- The description says "auto-post" without showing user selection and consent,
  or suggests scraping, engagement automation, or unsupported partnership.
- Requested scopes are not visibly used, especially `video.upload`, profile, or
  stats scopes.
- Privacy/contact pages are templates, inaccessible, inconsistent with the app
  name, or do not explain deletion and token handling.
- Direct Post controls ignore the creator-info response or force a privacy
  value unavailable to the creator.
- Review is treated as sufficient for public visibility without completing the
  separate Content Posting audit. TikTok documents that unaudited Direct Post
  clients are restricted to private viewing.

## Sources

- [Create/configure an app and submit review](https://developers.tiktok.com/doc/getting-started-create-an-app)
- [Content Posting API: get started and audit restriction](https://developers.tiktok.com/doc/content-posting-api-get-started/)
- [Content Posting API overview](https://developers.tiktok.com/products/content-posting-api)
- [TikTok scope reference](https://developers.tiktok.com/doc/tiktok-api-scopes)
- [OAuth token refresh and revocation](https://developers.tiktok.com/doc/oauth-user-access-token-management)
- [Query creator info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- [Direct Post API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [Upload video without posting](https://developers.tiktok.com/doc/content-posting-api-reference-upload-video)
- [Photo post/upload API](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post/)
- [Get post status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- [Media transfer and URL ownership](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
