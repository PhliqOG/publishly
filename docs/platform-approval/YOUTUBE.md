# YouTube / Google OAuth production runbook

Last verified: 2026-08-10. `APP_ORIGIN` is the public HTTPS `FRONTEND_URL`.
Approval and quota increases are external; this document does not claim either.

## Configuration

Enable **YouTube Data API v3** and **YouTube Analytics API** in a dedicated
production Google Cloud project. Create an External OAuth consent screen and an
OAuth 2.0 Web application client.

```dotenv
YOUTUBE_CLIENT_ID=<OAuth web client ID>
YOUTUBE_CLIENT_SECRET=<OAuth web client secret>
FRONTEND_URL=https://app.example.com
```

Authorized redirect URI:

```text
APP_ORIGIN/integrations/social/youtube
```

Consent-screen URLs:

- Home: `APP_ORIGIN`
- Privacy: `APP_ORIGIN/privacy`
- Terms: `APP_ORIGIN/terms`
- Contact: `APP_ORIGIN/contact`
- Data deletion: `APP_ORIGIN/data-deletion`

No YouTube webhook is consumed by the current adapter; status is reconciled by
authorized API calls. YouTube user authorization does not use a service account.

## Scopes used by the adapter

- `https://www.googleapis.com/auth/userinfo.profile`
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

`youtube.upload` creates the user's requested video. `youtube.readonly` confirms
the video and reads channel context. `yt-analytics.readonly` displays
platform-returned analytics, and `userinfo.profile` labels the consenting
connection. Publishly does not manage YouTube comments or ratings and therefore
does not request broad `youtube.force-ssl` or `youtubepartner` scopes.

Every connected YouTube account runs the durable refresh workflow at the
access-token expiry. If Google returns an authoritative `invalid_grant`,
Publishly records and attempts the reconnect webhook/notification, then
transactionally purges the revoked credentials and Google-derived profile,
analytics, inbox, external IDs/URLs, and receipt evidence. A timeout, 429, or
5xx is not treated as proof of revocation and never triggers erasure.

## Setup and verification

1. Deploy the final HTTPS domain and verify the legal/contact pages with the
   production operator identity.
2. Create separate Google Cloud projects for non-production testing and
   production. Enable the two APIs in production.
3. Configure the OAuth brand as Publishly, add the exact scopes and authorized
   domains, and verify domain ownership in Search Console with a project
   owner/editor account.
4. Create the Web client, register the exact redirect URI, store the two secret
   values, and redeploy.
5. In Testing mode, add owner-controlled YouTube test users and prove connect,
   upload, refresh-token use, status, analytics, and disconnect. The disconnect
   must visibly call Google's revocation endpoint before local provider data is
   removed; force a temporary revocation failure once and show the classified
   retryable response rather than a false success.
6. Publish the consent screen to Production and select **Prepare for
   Verification**. Supply a narrow justification for every sensitive scope and
   an unlisted screencast URL.
7. Request quota only after measuring the canary. Explain actual daily upload
   volume; do not invent customer counts.

Suggested description:

> Publishly lets an authorized YouTube channel owner upload and schedule their
> own videos, then view status and YouTube-reported performance in a private
> workspace. Publishing runs server-side at the time the user selected. Users
> can disconnect the channel and delete stored authorization data. Publishly
> does not use service accounts, scrape YouTube, or access channels that did not
> grant OAuth consent.

The screencast should show the English consent screen with all scopes, connect,
channel identity, a compliant upload with title/privacy settings, the final
YouTube result, analytics, token revocation/disconnect, and privacy/deletion
pages. Use a dedicated reviewer workspace and an owner-controlled YouTube test
channel; never provide a customer account.

Common rejection causes: scope mismatch between code and consent screen,
unverified domains, inaccessible legal/support URLs, a video that omits the
OAuth grant or broad-scope feature, requesting partner scopes, using a test
project for production verification, or describing analytics the API does not
return.

Sources:

- [YouTube OAuth 2.0 authorization](https://developers.google.com/youtube/v3/guides/authentication)
- [OAuth for server-side web apps and YouTube scopes](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [Google OAuth verification requirements](https://support.google.com/cloud/answer/13464321)
- [Submit an OAuth app for verification](https://support.google.com/cloud/answer/13461325)
