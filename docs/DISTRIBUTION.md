# Distribution surfaces

Publishly exposes the same reliability contract through REST, signed webhooks,
n8n, Make, and MCP. Every write reaches the canonical post-creation service, so
provider preflight, tenant isolation, successful-post quota checks, and durable
idempotency do not vary by adapter.

Use the public backend origin for all examples below. Customer REST routes use
`<backend>/public/v1`; MCP uses `<backend>/mcp` or
`<backend>/mcp-oauth`.

## Shared guarantees

- Creation requires an 8-200 character `Idempotency-Key`. Generate one stable
  key per business intent and reuse the same key and body after a timeout. A
  retry can replay the original post IDs but cannot create a second post.
- Creation acceptance is not proof of delivery. Treat only a
  `confirmed_live` receipt as success.
- Failures expose `failureClass`, `code`, and a non-empty `reason`. Retry only
  `recoverable` failures; route `user_action_needed` to an operator and correct
  `data_problem` input before sending it again.
- Webhooks are signed and delivered at least once. Verify the signature against
  the exact raw bytes and deduplicate with `X-Publishly-Event-Id`.
- Scoped `pub_` keys are shown once, hashed at rest, and revocable. Give each
  automation only the scopes it uses.

The canonical REST contract is [API.md](./API.md). The complete event and
receiver contract is [WEBHOOKS.md](./WEBHOOKS.md).

## Scope matrix

| Capability | Required scope |
| --- | --- |
| Publish now or schedule | `posts:write` |
| Read delivery receipts | `posts:read` |
| Read fleet health | `integrations:read` |
| Register/remove an event trigger | `webhooks:write` |
| List event endpoints | `webhooks:read` |

## Official n8n node

The official community-node package source is in
`integrations/n8n-nodes-publishly`. It contains:

- `Publishly`: Publish Now, Schedule Post, Get Delivery Receipts, and Get Fleet
  Health operations;
- `Publishly Trigger`: attached webhook registration/removal plus signature,
  timestamp, event-ID, and envelope verification; and
- `Publishly API`: backend-origin and scoped-key credentials with secret-field
  masking.

The repository does not claim that the package is already published to npm or
listed in the hosted n8n community-node catalog. For self-hosted validation or
installation, package the reviewed source and install the resulting tarball in
the instance's community-node/custom-node environment:

```bash
cd integrations/n8n-nodes-publishly
npm pack
# Install the emitted n8n-nodes-publishly-1.0.0.tgz using your n8n deployment's
# normal community-node/custom-node process, then restart n8n.
```

Create one credential with a backend origin such as
`https://publishly.example.com` and a `pub_` key. Mutation operations require a
mapped idempotency key. The node deliberately does not retry `POST /posts` on
its own; Publishly's ledger decides whether a repeated request is a replay,
conflict, or safe first execution. Output items retain n8n paired-item metadata.

Activating Publishly Trigger registers its production webhook URL. Publishly
returns the signing secret once; the node stores it in node workflow data and
uses it to reject malformed, stale, or mismatched deliveries. Deactivation
deletes the remote endpoint. Downstream irreversible work must still deduplicate
on the CloudEvents-style envelope `id` because delivery is at least once.

Package-specific configuration is in
`integrations/n8n-nodes-publishly/README.md`.

## Official Make custom app

The official Make custom-app source bundle is in
`integrations/make-publishly`. It mirrors the Make Apps editor and contains:

- one masked connection for backend origin and scoped `pub_` key;
- Publish Now and Schedule Post mutation modules;
- Get Delivery Receipts and Get Fleet Health read modules; and
- an attached dedicated webhook plus Watch Events instant trigger.

Import/copy the reviewed JSON components into a Publishly custom app in Make's
developer area, following `app.json` as the component index. The repository
does not claim that the app has completed Make catalog review or is publicly
listed. No credential or production hostname is embedded in the bundle.

The base component maps non-2xx responses to explicit Make errors. It does not
turn an empty or failed response into a successful bundle. Mutation modules
forward `Idempotency-Key`; the dedicated webhook stores the one-time secret and
validates the HMAC, five-minute tolerance, signed event ID, and event type
before the instant trigger emits a bundle.

Component-by-component setup is in `integrations/make-publishly/README.md`.

## Built-in MCP server

Publishly exposes four reliability tools:

| Tool | Purpose | Scope |
| --- | --- | --- |
| `publish_post` | Publish now through canonical preflight and idempotency | `posts:write` or `mcp:write` |
| `schedule_post` | Schedule through canonical preflight, queueing, and idempotency | `posts:write` or `mcp:write` |
| `get_post_receipts` | Read lifecycle, retries, failure details, and receipts | `posts:read` or `mcp:read` |
| `get_fleet_health` | Read fleet colors, token health, queues, and success rates | `integrations:read` or `mcp:read` |

For a scoped API key, connect to `<backend>/mcp` and send:

```http
Authorization: Bearer pub_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Accept: application/json, text/event-stream
```

For an interactive client, connect to `<backend>/mcp-oauth`; its protected
resource and authorization-server metadata advertise `mcp:read` and
`mcp:write`. A valid `pos_` access token is resolved to the approved workspace.

Both mutation tools require `idempotencyKey` in the input. `schedule_post` also
requires a valid ISO 8601 `scheduledAt`. They return destination post IDs and
`idempotencyReplayed`; they never describe API acceptance as
`confirmed_live`. Read tools enforce tenant ownership in their repository
queries.

Tool failures are never blank: they serialize a stable `failureClass`, `code`,
and `reason`. Missing auth, insufficient scope, invalid idempotency, invalid
schedule timestamps, missing publishing jobs, provider validation failures,
and downstream outages all fail explicitly.

Legacy key-in-URL routes (`/mcp/:id`, `/sse/:id`, and `/message/:id`) return 404
unless `ALLOW_LEGACY_API_KEYS=true`. That flag exists only for time-boxed
migration. New clients must use bearer auth or OAuth and must never put a key in
a URL.

## Release checklist

Before publishing either marketplace artifact:

1. Run the repository unit, typecheck, and lint suites.
2. Run `npm pack --dry-run --json` in the n8n package and inspect the exact file
   list.
3. Install the n8n tarball into a disposable self-hosted instance and exercise
   activation, delivery, invalid HMAC, stale timestamp, replay, 429, and
   deactivation paths.
4. Import the Make components into a disposable custom app and exercise the
   same success and failure paths.
5. Confirm no production hostname, API key, signing secret, webhook payload, or
   customer identifier exists in either artifact.
6. Publish under Publishly-controlled accounts, then update product facts and
   marketing copy with the exact registry/catalog links. Until that happens,
   describe these as official source packages, not public marketplace listings.
