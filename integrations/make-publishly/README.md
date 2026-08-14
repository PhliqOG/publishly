# Publishly custom app for Make

This directory is the source bundle for the official Publishly Make custom app.
Its component files mirror the Make Apps editor: Base, one basic connection,
four action modules, one attached dedicated webhook, and one instant trigger.

Create a `Publishly` custom app in the Make developer area, then copy each
named JSON block into its matching component/tab. `app.json` is the component
index used for review and automated contract checks. The source deliberately
contains no workspace credential or production hostname.

This is the official source bundle; the repository does not claim that it has
completed Make catalog review or is publicly listed.

## Connection and scopes

The connection accepts the Publishly backend origin (without a trailing slash)
and a hashed/scoped `pub_` key. Use these scopes:

- Publish a post now / Schedule a post: `posts:write`
- Get delivery receipts: `posts:read`
- Get fleet health: `integrations:read`
- Watch delivery and health events: `webhooks:write`

The Base component maps every HTTP failure to an explicit Make error. It treats
400 responses as data failures, 401/403 as credential failures, 429 as rate
limits, and 5xx as connection failures. It never maps a non-2xx response to an
empty successful bundle.

## Idempotency

Both mutation modules require an idempotency key and send it in
`Idempotency-Key`. Generate one stable key from the upstream business event and
reuse the same value if Make retries the bundle. Do not generate a new key in an
error handler for the same intent.

## Instant events

Creating the instant trigger automatically calls `POST /public/v1/webhooks` and
stores both the remote ID and one-time signing secret in the dedicated webhook
record. Removing it calls `DELETE /public/v1/webhooks/:id`. The incoming
webhook component checks the HMAC, five-minute timestamp tolerance, event ID,
and event type before returning `202`; invalid deliveries receive `401` with a
machine-readable code and reason.

Publishly webhooks are at least once. Add idempotent scenario handling keyed by
the event `id` before irreversible downstream actions. See
`docs/DISTRIBUTION.md` and `docs/WEBHOOKS.md` for release status and the
complete event contract.
