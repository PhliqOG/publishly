# Public API

Base URL: `<backend>/public/v1`. Also served through the app domain when the
reverse proxy forwards `/api` → backend.

## Authentication

Send the key in the `Authorization` header (no `Bearer` prefix):

```
Authorization: pub_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- **Scoped keys (`pub_…`)** — create under Settings → API Keys (org admins).
  Shown once; stored hashed; revocable. This is the recommended and
  scope-enforced path.
- Legacy organization keys and OAuth-app tokens (`pos_…`) also authenticate
  for backward compatibility; legacy keys have no scopes (full access) and are
  deprecated.
- When billing is enabled (`STRIPE_SECRET_KEY` set), an active subscription is
  required — otherwise requests return 401 `No subscription found`.

## Scopes

| Scope | Grants |
| --- | --- |
| `posts:read` | GET posts, find-slot, groups |
| `posts:write` | create/update/delete posts |
| `media:write` | uploads |
| `integrations:read` | list channels, provider info, integration settings |
| `integrations:write` | delete a channel |
| `notifications:read` | notifications feed |
| `video:write` | video generation endpoints |
| `*` | everything, **including any route not listed below** |

Deny-by-default: a route not in the scope map requires `*`, so narrowly scoped
keys never gain access to endpoints added later. Insufficient scope → 403
`API key lacks the required scope "…"`.

## Rate limits

Per organization, per hour, per bucket (`posts` = POST /posts; `read` = GETs;
`write` = other mutations): `API_LIMIT` each (deployment-configured, default
30–90). Exceeding → 429.

## Endpoints

| Method | Path | Scope | Notes |
| --- | --- | --- | --- |
| POST | `/upload` | media:write | multipart file upload → media object `{id, path}` |
| POST | `/upload-from-url` | media:write | server-side fetch (SSRF-guarded; `RESTRICT_UPLOAD_DOMAINS` may pin domains) |
| GET | `/posts?...` | posts:read | list; query params per `GetPostsDto` (week/customer filters) |
| POST | `/posts` | posts:write | create/schedule — body below |
| DELETE | `/posts/:id` | posts:write | delete one destination post |
| DELETE | `/posts/group/:group` | posts:write | delete the whole multi-network group |
| GET | `/find-slot/:id` | posts:read | next free slot for a channel |
| GET | `/groups` | posts:read | channel groups (sets) |
| GET | `/is-connected` | integrations:read | connectivity check |
| GET | `/integrations` | integrations:read | connected channels (ids used in create-post) |
| GET | `/social/:integration` | integrations:read | provider metadata |
| DELETE | `/integrations/:id` | integrations:write | disconnect a channel |
| GET | `/integration-settings/:id` | integrations:read | per-provider settings schema |
| GET | `/notifications` | notifications:read | in-app notifications |
| POST | `/generate-video`, `/video/function` | video:write | AI video pipeline (needs provider keys) |
| GET | `/posts/:id/missing` | * | provider backfill candidates |
| PUT | `/posts/:id/settings` · `/posts/:id/status` · `/posts/:id/release-id` | * | post maintenance |
| GET | `/analytics/:integration?date=` · `/analytics/post/:postId?date=` | * | platform-reported metrics |
| POST | `/integration-trigger/:id` | * | invoke a provider tool method |

(Scopes follow the middleware's pattern rules; the `*` rows are simply routes
outside the explicit map.)

## Create a post

```bash
curl -X POST "$BACKEND/public/v1/posts" \
  -H "Authorization: $PUBLISHLY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "schedule",
    "date": "2026-08-15T14:30:00.000Z",
    "shortLink": false,
    "tags": [],
    "posts": [
      {
        "integration": { "id": "<integration-id from /integrations>" },
        "value": [
          {
            "content": "Hello from the API",
            "image": [ { "id": "<media-id>", "path": "<media-path>" } ]
          }
        ],
        "settings": { "__type": "<providerIdentifier>" }
      }
    ]
  }'
```

`type`: `draft | schedule | now`. Additional `value[]` entries become a
thread/comment chain where the platform supports it. Per-provider settings
fields (e.g. YouTube title/visibility) go inside `settings` alongside
`__type`. Validation runs server-side with the same rules as the dashboard;
failures return a readable 400 naming the provider and problem.

## Bulk endpoints (cookie or key auth, org-scoped)

`POST /bulk/import` `{name, csv}` (header `date,content,integrations` — ids
pipe-separated) → `{id, totalRows, validRows, rows[]}` preview report ·
`GET /bulk/import` list · `GET /bulk/import/:id` status/progress ·
`POST /bulk/import/:id/commit` schedule all valid rows ·
`POST /bulk/posts/shift` `{ids, minutes}` · `POST /bulk/posts/delete` `{ids}`
(group ids). These are the same endpoints the dashboard uses; treat as stable.

## Errors

| Status | Meaning |
| --- | --- |
| 400 | validation (body names the provider + problem) |
| 401 | missing/invalid key, or no active subscription |
| 402 | plan limit reached (posts/channels quota) |
| 403 | key lacks the required scope |
| 404 | resource not in your organization |
| 429 | rate limit — retry after the hour window |
