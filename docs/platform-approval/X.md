# X API production setup runbook

Last verified: 2026-08-10. X pricing and endpoint availability are external and
can change; check the Developer Console before launch. Publishly currently uses
OAuth 1.0a user context for this provider, not OAuth 2.0.

## App configuration

Create an app in the X Developer Console, accept the current Developer
Agreement, describe the real scheduling/analytics use case, and configure user
authentication with **Read and write** permissions.

Callback URL:

```text
APP_ORIGIN/integrations/social/x
```

Website, privacy, terms, and deletion URLs should be `APP_ORIGIN`,
`APP_ORIGIN/privacy`, `APP_ORIGIN/terms`, and `APP_ORIGIN/data-deletion`.

```dotenv
X_API_KEY=<OAuth 1.0a API key>
X_API_SECRET=<OAuth 1.0a API key secret>
X_URL=https://app.example.com
# DISABLE_X_ANALYTICS=true  # set when the purchased access does not cover it
```

If `X_URL` is omitted, the adapter uses `FRONTEND_URL`. Do not set a bearer
token or owner access token as a substitute: each customer connection must
complete user authorization. The adapter does not consume an X webhook.

## Launch sequence

1. Create the developer account and app; store credentials immediately in the
   production secret manager.
2. Set Read and write app permissions and the exact callback. If permissions or
   callback change, regenerate/re-authorize test tokens as required by X.
3. Purchase API credits and configure a conservative spend limit/alert. Current
   X documentation describes pay-per-usage pricing; do not hardcode a plan or
   price into Publishly.
4. Deploy, connect an owner-controlled X test account, publish text, image, and
   video canaries only where the capability registry enables them, and verify
   post URLs plus duplicate resistance.
5. Enable analytics only after confirming the app's access and expected cost.
   Leave unavailable metrics visibly unavailable.

Suggested use-case text:

> Publishly lets an X user authorize their own account, compose and schedule
> posts, and review platform-returned status/analytics in a private workspace.
> A durable worker publishes only content the user selected and scheduled.
> Publishly does not collect X passwords, scrape X, automate engagement, or act
> on accounts that did not authorize the app.

Common failures are callback mismatch, read-only permission, stale credentials
after changing app permissions, zero credit balance/spend cap, attempting an
endpoint outside purchased access, or describing unsupported engagement
automation. X does not confer a partnership merely because an app has API
access; never make that claim.

Sources:

- [Get X API access](https://docs.x.com/x-api/getting-started/getting-access)
- [X developer applications](https://docs.x.com/fundamentals/developer-apps)
- [X Developer Console](https://docs.x.com/fundamentals/developer-portal)
- [Current X API pricing model](https://docs.x.com/x-api/getting-started/pricing)
