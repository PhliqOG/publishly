# X (Twitter)

**Purpose**: publish posts/threads/media (and long-form articles where the
account tier supports them) to the user's own X account.

## App creation
- Portal: https://developer.x.com → developer account → project + app.
- **API access tier is a paid decision**: write access for third-party scheduling
  realistically requires a paid tier (Basic or above). Free-tier write limits and
  current pricing change — verify on the portal before purchase. This is an
  operator budget decision, not a code requirement.

## Auth model (from code)
- OAuth **1.0a** user context via `twitter-api-v2` (`generateAuthLink` with
  `authAccessType: 'write'`). There is no OAuth2 scope list — the code's
  `scopes = []` is correct; permissions come from the app's access level.
- Set the app permissions to **Read and write** on the portal.

## Callback URI(s) to whitelist
```
{X_URL or FRONTEND_URL}/integrations/social/x
```
`X_URL` (optional env) overrides the callback origin; otherwise `FRONTEND_URL`.

## Env vars to set
```
X_API_KEY=          (app "API Key" / consumer key)
X_API_SECRET=       (app "API Key Secret" / consumer secret)
X_URL=              (optional callback origin override)
DISABLE_X_ANALYTICS= (optional; set to disable the analytics tab)
STRIP_LINKS_FROM_X_POSTS= (optional content policy toggle)
```

## Review prerequisites
- No formal scope review like Meta; access is gated by tier purchase and the
  developer policy. Fill the use-case questionnaire truthfully at signup.
- Keep the developer account in good standing; automation rules prohibit
  spammy/duplicative posting — Publishly schedules user-authored content, which
  complies.

## Truthful use-case text
> Publishly is a scheduling tool where users connect their own X account via
> OAuth and schedule their own posts, which Publishly publishes at the chosen
> time using the official API. No engagement automation, no mass actions, no
> reading of other users' data beyond rendering the user's own account info.

## Data handling
- Stored: user id/handle/avatar, OAuth1 token+secret (encrypted at rest), post
  ids for release URLs and analytics display.
- Deletion: disconnecting removes tokens; account deletion removes all data.

## Common rejection/suspension causes
- Posting identical content across many accounts (platform spam rule) — not a
  Publishly feature, but multi-account users should vary content; surface this
  in docs.
- Exceeding tier rate/volume caps (code caps bursts via per-user pacing:
  X allows ~300 posts/3h per user — the provider notes this).

## Post-approval canary
1. Connect the company test X account.
2. Schedule one text post → verify the permalink.
3. Schedule one image post → verify media renders.
4. Watch for 429s in the errors log; confirm the tier's caps match expectations.
