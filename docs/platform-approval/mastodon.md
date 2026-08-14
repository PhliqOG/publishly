# Mastodon per-instance production setup

Last verified: 2026-08-11. Mastodon is federated: there is no central developer
portal, global app review, or operator-owned app secret.

## What Publishly does

The user enters the HTTPS origin of the Mastodon server hosting their account.
Publishly validates that origin against SSRF, calls the server's public
`POST /api/v1/apps` endpoint, and receives a client id/secret scoped to that
instance. Those client credentials, the instance origin, and the user's OAuth
token are encrypted with the connection. The authorization flow then uses:

```text
APP_ORIGIN/integrations/social/mastodon
```

No `MASTODON_URL`, `MASTODON_CLIENT_ID`, or `MASTODON_CLIENT_SECRET` production
environment variables are used. A fallback to `mastodon.social` exists only for
legacy rows created by the former single-instance implementation.

## Exact scopes

```text
profile
write:statuses
write:media
```

`profile` verifies and labels the consenting account. `write:statuses` creates
the user's scheduled status, and `write:media` uploads user-selected media. No
read-all-accounts, follow, notification, admin, or moderation scope is requested.

## Same-day canary

1. Leave SSRF protection enabled and deploy the final HTTPS callback.
2. Create owner-controlled test accounts on two public Mastodon instances.
3. Connect each by entering its own instance origin. Confirm each instance shows
   a newly registered Publishly authorization with only the three scopes above.
4. Publish a text status and an image with alt text on each instance. Confirm
   each permalink independently and check the per-connection receipt.
5. Disconnect both and revoke the app from each instance's Authorized apps page.

## Common failures

- The user enters a profile URL instead of the instance origin.
- The instance is private, resolves to an internal address, blocks dynamic app
  registration, or imposes local automation rules.
- The callback is not byte-identical or the deployment origin changed after
  registration.
- Instance media processing/rate limits differ; Publishly reports these per
  connection and must not generalize one server's limit to the network.

Official references: [Applications API](https://docs.joinmastodon.org/methods/apps/),
[OAuth authorization](https://docs.joinmastodon.org/client/authorized/), and
[granular scopes](https://docs.joinmastodon.org/api/oauth-scopes/).
