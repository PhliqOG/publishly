# Publishly webhooks

Publishly webhooks are the push form of the same durable delivery and
connection-health ledgers exposed by the API. A provider acceptance response is
never reported as posting success: success is `post.receipt` with
`data.stage=confirmed_live` after Publishly independently verifies the post on
the platform.

## Configure an endpoint

Create a webhook in Settings, or with a scoped API key:

```bash
curl -X POST "$API/public/v1/webhooks" \
  -H "Authorization: $PUBLISHLY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-events",
    "url": "https://automation.example.com/publishly",
    "integrations": []
  }'
```

The key needs `webhooks:write`. An empty `integrations` array subscribes to all
current and future connections in the workspace. Otherwise, provide up to 500
tenant-owned connection IDs as `{ "id": "..." }` entries. Destinations must
be public HTTPS URLs; redirects and resolved addresses are checked against
Publishly's SSRF policy at delivery time.

A create response is:

```json
{
  "id": "webhook-id",
  "signingSecret": "whsec_copy_this_value_now"
}
```

The signing secret is returned only on create or explicit rotation. It is never
present in `GET /public/v1/webhooks`. Store it in a secret manager. If it is
lost, rotate with `POST /public/v1/webhooks/:id/rotate-secret`; rotation takes
effect immediately and returns the new secret once. Delete a subscription with
`DELETE /public/v1/webhooks/:id`.

## Delivery contract

Publishly sends an HTTP `POST` with the exact JSON envelope as the request body
and these headers:

| Header | Meaning |
| --- | --- |
| `Content-Type` | `application/json` |
| `User-Agent` | `Publishly-Webhooks/1.0` |
| `X-Publishly-Event` | event type, such as `post.receipt` |
| `X-Publishly-Event-Id` | stable event ID used for deduplication |
| `X-Publishly-Timestamp` | Unix time in seconds used in the signature |
| `X-Publishly-Signature` | `t=<timestamp>,v1=<lowercase hex HMAC>` |

Return any `2xx` response within 10 seconds. Redirects are revalidated. A
timeout, network error, or non-2xx response is a failed attempt. Publishly tries
at most three times: immediately, approximately one second later, then
approximately five seconds later. All attempts are durable records.

Delivery is at least once. Store `X-Publishly-Event-Id` with a unique constraint
before applying side effects, and return `2xx` for an event already processed.
Do not deduplicate by post ID: one post has several lifecycle receipts and may
have several classified failure occurrences.

After all three attempts fail, Publishly marks that event's `webhookState` as
`FAILED`; it does not discard or relabel the event. Receipt and status API
responses continue to expose this state so webhook delivery cannot fail
silently. `NOT_CONFIGURED` means no matching endpoint existed.

## Verify every request

Signatures are HMAC-SHA256 over the UTF-8 bytes of:

```text
<X-Publishly-Timestamp>.<exact raw request body>
```

Use the endpoint's `whsec_...` value as the HMAC key. Compare the computed hex
digest to `v1` with a constant-time comparison. Reject a missing or malformed
header, an invalid signature, or a timestamp more than five minutes from your
server clock. Parse JSON only after verification; re-serializing parsed JSON
changes the signed bytes.

Node.js example:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyPublishlyWebhook(rawBody, headers, secret) {
  const timestamp = headers['x-publishly-timestamp'];
  const signature = headers['x-publishly-signature'];
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(signature || '');
  if (!match || match[1] !== timestamp) throw new Error('Invalid signature header');
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new Error('Stale webhook timestamp');
  }
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const received = Buffer.from(match[2], 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Invalid webhook signature');
  }
}
```

## Envelope

Every event uses the same CloudEvents-style fields:

```json
{
  "specversion": "1.0",
  "id": "stable-ledger-event-id",
  "type": "post.receipt",
  "time": "2026-08-10T13:00:00.000Z",
  "data": {}
}
```

- `specversion` is currently `1.0`.
- `id` is stable across delivery attempts and receiver replays.
- `type` exactly matches `X-Publishly-Event`.
- `time` is when the durable event occurred, not the delivery-attempt time.
- Optional data fields may be `null`. Consumers must ignore unknown fields.

## Post events

### `post.receipt`

One event is emitted for each per-destination lifecycle transition:
`queued -> uploading -> sent -> confirmed_live`, or `failed`.

```json
{
  "specversion": "1.0",
  "id": "post.receipt:stable-id",
  "type": "post.receipt",
  "time": "2026-08-10T13:00:00.000Z",
  "data": {
    "postId": "post-id",
    "postGroup": "multi-destination-group-id",
    "integrationId": "connection-id",
    "provider": "instagram",
    "stage": "confirmed_live",
    "attempt": 1,
    "providerPostId": "provider-resource-id",
    "providerUrl": "https://www.instagram.com/p/example/",
    "confirmationMethod": "instagram_media_read",
    "evidence": {},
    "failureId": null
  }
}
```

Stage meanings:

| Stage | Meaning |
| --- | --- |
| `queued` | durable per-account work exists |
| `uploading` | Publishly started the provider mutation attempt |
| `sent` | the provider accepted the mutation; this is not success |
| `confirmed_live` | an independent provider read proved the post exists |
| `failed` | a classified failure occurred; inspect `failureId` and `post.failure` |

`failed` can be nonterminal when the matching failure has `willRetry=true`.
Only `confirmed_live` consumes successful-post quota.

### `post.failure`

Every failure occurrence has a machine-readable class and code plus a non-empty
human reason:

```json
{
  "specversion": "1.0",
  "id": "post.failure:stable-id",
  "type": "post.failure",
  "time": "2026-08-10T13:00:03.000Z",
  "data": {
    "postId": "post-id",
    "postGroup": "multi-destination-group-id",
    "integrationId": "connection-id",
    "provider": "instagram",
    "attempt": 1,
    "willRetry": true,
    "failure": {
      "class": "recoverable",
      "code": "rate_limited",
      "reason": "Instagram rate-limited this connection until 2026-08-10T13:05:00.000Z."
    }
  }
}
```

The failure classes are:

- `recoverable`: Publishly queues a bounded retry. Do not create another post.
- `user_action_needed`: reconnect, restore permissions, or change account state.
- `data_problem`: correct content, media, or provider settings before resubmitting
  with a new idempotency key.

`willRetry` is the authoritative retry flag. An ambiguous provider mutation is
classified (commonly `outcome_unknown`) and is not blindly replayed.

## Connection, token, and platform-truth events

All health events contain `integrationId`, provider, severity, code, and a
non-empty reason. Token events may include `daysRemaining`; connection events
may include `consecutiveErrors`; platform events include
`platformTruthState`.

```json
{
  "specversion": "1.0",
  "id": "connection.health:stable-id",
  "type": "token.expiring",
  "time": "2026-08-10T12:00:00.000Z",
  "data": {
    "integrationId": "connection-id",
    "provider": "facebook",
    "severity": "warning",
    "code": "token_expiring",
    "reason": "The facebook token expires in 10 day(s). Reconnect or refresh it before expiry.",
    "daysRemaining": 10,
    "consecutiveErrors": null
  }
}
```

| Event | When it fires |
| --- | --- |
| `token.expiring` | token crosses the 30, 14, 7, 3, or 1 day warning threshold |
| `token.expired` | known token expiry is reached |
| `token.refreshed` | provider refresh succeeds |
| `connection.at_risk` | a connection-level failure first degrades health |
| `connection.reconnect_required` | auth, permission, or account state requires action |
| `connection.stale` | no provider contact has succeeded for 14 days |
| `connection.dead` | repeated connection failures or 30 days without provider contact |
| `connection.recovered` | refresh or confirmed-live evidence restores health |
| `platform.ready` | platform truth becomes publish-capable |
| `platform.limitation` | a material limitation exists, including TikTok `SELF_ONLY` |
| `platform.invalid` | deterministic platform prerequisites are invalid |
| `platform.truth_unknown` | provider truth could not be established safely |

## Receiver checklist

1. Preserve the raw request bytes.
2. Verify timestamp and HMAC before JSON parsing.
3. Insert the event ID idempotently before side effects.
4. Route on `type`, then on `data.stage` or `data.failure.code`.
5. Return `2xx` only after durable acceptance into your own queue or database.
6. Alert on signature failures and repeated receiver errors.
7. Reconcile uncertain receiver downtime with `GET /posts/:id/receipts` and
   `GET /fleet-health`; never infer success from a missing webhook.

The complete public API and scope table is in [API.md](./API.md).
