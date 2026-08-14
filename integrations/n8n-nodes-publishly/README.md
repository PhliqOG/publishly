# n8n nodes for Publishly

The official Publishly community package exposes idempotent publishing,
scheduling, delivery receipts, fleet health, and signed delivery/connection
events.

## Install

This repository contains the official package source; it does not claim that
the package is already listed in the hosted n8n catalog. Run `npm pack` in this
directory and install the reviewed tarball through the community/custom-node
process of a self-hosted n8n instance. Create a Publishly credential with the
backend origin and a scoped `pub_` API key.

Action scopes:

- Publish Now and Schedule Post: `posts:write`
- Get Delivery Receipts: `posts:read`
- Get Fleet Health: `integrations:read`
- Publishly Trigger activation/deactivation: `webhooks:write`

Use separate least-privilege credentials when a workflow does not need every
operation.

## Safe workflow retries

Publish Now and Schedule Post require an idempotency key. Generate it once for
the business event (for example, an order or campaign/location pair) and map the
same value on every workflow retry. The node sends the key unchanged and does
not perform its own POST retry. A completed replay returns the original result
with `idempotencyReplayed: true`.

The Post Body uses the public-v1 post shape. The node supplies `type` and `date`:

```json
{
  "shortLink": false,
  "tags": [],
  "posts": [
    {
      "integration": { "id": "connection-id" },
      "value": [{ "content": "Hello", "image": [] }],
      "settings": { "__type": "linkedin" }
    }
  ]
}
```

## Trigger security

Workflow activation registers the n8n production webhook URL with Publishly and
stores the returned one-time signing secret in node workflow data. Deactivation
deletes the remote subscription. Every incoming event is rejected unless its
timestamp, HMAC signature, event ID, and event type match. Event delivery is at
least once, so downstream side effects should also deduplicate on `id`.

See `docs/DISTRIBUTION.md`, `docs/API.md`, and `docs/WEBHOOKS.md` in the
Publishly repository for release status and the complete request/event
contracts.
