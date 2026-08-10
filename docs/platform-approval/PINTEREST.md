# Pinterest

**Purpose**: create Pins (image/video) on the user's own boards; read the
user's boards and account for the picker and analytics.

## App creation
- Portal: https://developers.pinterest.com → create app.
- Pinterest grants **trial access** first (limited rate/feature caps) and
  **standard access** after review — verify the current tiering on the portal.

## Exact scopes (from code)
```
boards:read
boards:write
pins:read
pins:write
user_accounts:read
```

## Redirect URI(s) to whitelist
```
{FRONTEND_URL}/integrations/social/pinterest
```

## Env vars to set
```
PINTEREST_CLIENT_ID=
PINTEREST_CLIENT_SECRET=
```

## Review prerequisites (standard access)
- Working demo of connect → choose board → schedule Pin → Pin appears.
- Privacy policy + terms URLs; description of data use.
- Verify current standard-access form requirements on the portal.

## Truthful use-case text
> Publishly is a scheduling tool where users connect their own Pinterest
> account via OAuth, pick one of their own boards, and schedule Pins that
> Publishly creates through the official API at the scheduled time. Board and
> account read scopes power the board picker and the user's own analytics.

## Data handling
- Stored: account id/username/avatar, access+refresh tokens (encrypted at
  rest), board list for the picker, created Pin ids.
- Deletion: disconnect removes tokens; account deletion removes all data.

## Common rejection causes
- Trial-access apps exceeding caps instead of applying for standard access.
- Redirect URI mismatch (must be byte-exact, HTTPS in production).
- Spam-pattern concerns: describe user-authored content clearly.

## Post-approval canary
1. Connect the company test account; create a private test board.
2. Schedule one image Pin (vertical 2:3 image) → verify via the returned Pin URL.
3. Schedule one short MP4 Pin → Pinterest processes video async; the provider's
   pending/finalize flow handles it — confirm it reaches completed state.
