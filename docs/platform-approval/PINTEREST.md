# Pinterest production access runbook

Last verified: 2026-08-10. `APP_ORIGIN` is the public HTTPS `FRONTEND_URL`.
Trial or Standard access is granted by Pinterest, not by this repository.

## Account, scopes, and callback

Use a verified Pinterest business account to administer the app, accept the
Developer Terms, and request Trial access. Configure this exact redirect URI;
Pinterest requires an exact match and does not allow it to bounce through a
second redirect:

```text
APP_ORIGIN/integrations/social/pinterest
```

```dotenv
PINTEREST_CLIENT_ID=<app ID>
PINTEREST_CLIENT_SECRET=<app secret>
FRONTEND_URL=https://app.example.com
```

Current adapter scopes:

- `boards:read`
- `pins:read`, `pins:write`
- `user_accounts:read`

These identify the consenting account, list/select its existing boards, create
the user-requested Pin, and reconcile results. `boards:write`, secret-board,
advertising, catalogs, and audience scopes are not requested. The adapter does
not consume a Pinterest webhook.

## Setup and access upgrade

1. Complete public privacy, terms, contact, and deletion pages on the final
   domain.
2. Connect the app from the business account, submit a specific scheduling use
   case for Trial access, and wait for the external review.
3. After approval, add the exact redirect, store the credentials, deploy, and
   exercise OAuth with an owner-controlled account. A temporary product token
   can help diagnose API calls but is not a customer OAuth substitute.
4. Test board discovery and compliant fresh image/video Pin creation. Pinterest
   states that Trial-created Pins/boards are visible only to their creator, so
   do not treat that visibility as a production canary.
5. Request Standard access before serving customers. Submit the live OAuth and
   Pin-creation screencast requested by Pinterest, plus the accurate app and
   privacy details.

Suggested description:

> Publishly lets a Pinterest user authorize their own account, select one of
> their boards, and schedule original media as a Pin. The user sees the selected
> account, board, media, title/description, and schedule before a durable worker
> creates the Pin. Publishly stores encrypted OAuth tokens, never collects
> Pinterest passwords/session cookies, and supports disconnect and data
> deletion.

The Standard-access video should show the complete OAuth flow, the exact consent
scopes, board selection, an original-media Pin created through the live API, the
resulting Pin, and disconnect. Use a dedicated reviewer workspace/account.

Common denials: inaccessible or inaccurate privacy policy; vague description;
missing OAuth in the video; session-cookie/login collection; wireframe rather
than a live integration; redirect mismatch/secondary redirect; or asking for
Standard before demonstrating Trial access. Never describe Trial-only creator
visibility as a public production post.

Sources:

- [Connect and register a Pinterest app](https://developers.pinterest.com/docs/getting-started/connect-app/)
- [Pinterest OAuth and scopes](https://developers.pinterest.com/docs/getting-started/set-up-authentication-and-authorization/)
- [Trial and Standard access tiers/review](https://developers.pinterest.com/docs/key-concepts/access-tiers/)
- [Create boards and Pins](https://developers.pinterest.com/docs/work-with-organic-content-and-users/create-boards-and-pins/)
