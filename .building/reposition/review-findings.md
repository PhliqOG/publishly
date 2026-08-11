# Adversarial review — Publishly repositioning (commit d040e80b)

Reviewer: adversarial marketing/claims review, 2026-08-10.
Method: loaded `data/public-product-facts.json`, `data/claim-provenance.json`,
`.building/reposition/codebase-reality.md`, `marketing.config.ts`; curled all 69
rendered marketing routes off `http://127.0.0.1:4200` (39 sitemap routes + 20
`/docs/errors/[code]` + 10 `/platforms/[network]`); parsed every JSON-LD block,
every internal `href`, every `<h1>`/`<table>`/`<img>`/`aria-hidden` node;
cross-checked every `$` figure and account count against the provenance file;
verified load-bearing claims against the backend source.

**Counts: 7 BLOCKER · 7 MAJOR · 12 MINOR**

Nothing found at these dimensions (verified clean, stated for the record):
- No fabricated customers, testimonials, logos, uptime %, certifications, review
  scores, or `aggregateRating` anywhere. `/about` explicitly disclaims them.
- No `autopilot` / `mass account` / `bot network` / `account farm` / `faceless`
  framing in any rendered page.
- No live success-rate widget or status page presented as Publishly's own (the
  only "status page" mentions correctly attribute one to Upload-Post).
- No "billed on successful posts only" / per-post metering claim. `/pricing`
  answers "Do failed posts count against my plan?" honestly and names the gap.
- No advance token-expiry warning claimed as shipping; `/reliability` renders
  "Coming, not shipped yet: expiry warnings days ahead of token death."
- No analytics claimed for Bluesky, Mastodon, or personal LinkedIn — `/platforms`
  says "8 of the 10", and each platform page names its own gap.
- Every FAQPage JSON-LD Q&A is rendered on its page (verified programmatically).
  No hidden text, cloaking, `display:none` copy, or LLM-directed instructions.
- Every competitor `$` figure and account count matches `claim-provenance.json`
  exactly. Comparison tables use the permitted "Not published" phrasing.
  Arithmetic verified: 599 + 70×8.99 = 1228.30; 100×10 = 1,000; 30×10 = 300;
  3×10 = 30; 29/99/299 × 10 = 290/990/2,990. Failure-code counts 7+7+6 = 20
  match `POST_FAILURE_CATALOG` exactly.
- Tables are properly marked up (`<caption>`, `<th scope>`); no images without
  `alt`; no empty headings; one `<h1>` per page except `/data-deletion` (below).

---

## BLOCKER

### B1 — 22 marketing routes 307-redirect logged-out visitors and crawlers to `/auth`

**File:** `apps/frontend/src/app/proxy.ts:108-131` (the `marketingPaths` array)

**Offending text:**
```ts
const marketingPaths = [
  '/', '/features', '/publishing', '/calendar', '/product/analytics',
  '/engagement', '/api-docs', '/agencies', '/pricing', '/about', '/contact',
  '/security', '/terms', '/privacy', '/data-deletion', '/acceptable-use',
  '/source',
];
```

**Why it's wrong:** every route added by the repositioning is missing from this
allowlist, so the fall-through at line 135 (`if (!nextUrl.pathname.startsWith('/auth') && !authCookie)`)
redirects them to `/auth`. Measured, logged-out: **40 of the 75 internal hrefs
on the site return 307 → `/auth`**, and 22 of the 39 URLs in `sitemap.xml` are
unreachable to Googlebot. Verbatim results:

```
307 /reliability          307 /compare            307 /compare/ayrshare
307 /compare/buffer       307 /compare/metricool  307 /compare/upload-post
307 /compare/hootsuite    307 /methodology/api-comparisons
307 /for-agencies         307 /for-multi-brand    307 /for-creator-networks
307 /for-developers       307 /integrations       307 /integrations/mcp
307 /integrations/n8n     307 /integrations/make  307 /resources
307 /resources/best-social-posting-apis-2026
307 /resources/best-ayrshare-alternatives-2026
307 /resources/best-flat-pricing-posting-apis
307 /changelog            307 /docs/errors        307 /platforms
+ all 20 /docs/errors/[code] and all 10 /platforms/[network] children
```
(`/agencies → /for-agencies` is the one intentional redirect and is correct.)

The entire repositioning — the reliability page, every comparison, every resource
article, the whole docs-as-citation corpus — is invisible to visitors and answer
engines. This is the single highest-impact defect on the site.

**Recommended fix:** replace the array with a prefix match covering every
marketing route, e.g.

```ts
const MARKETING_PREFIXES = [
  '/features', '/publishing', '/calendar', '/product/', '/engagement',
  '/api-docs', '/agencies', '/for-', '/pricing', '/reliability', '/about',
  '/contact', '/security', '/terms', '/privacy', '/data-deletion',
  '/acceptable-use', '/source', '/compare', '/methodology/', '/integrations',
  '/resources', '/changelog', '/docs/', '/platforms',
];
const isMarketing =
  nextUrl.pathname === '/' ||
  MARKETING_PREFIXES.some((p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(p + '/') || nextUrl.pathname.startsWith(p));
if (isMarketing && (!authCookie || nextUrl.pathname !== '/')) return topResponse;
```
Keep the existing `/integrations/social/` early-return above it so the OAuth
callback path is untouched. Add a test that asserts every path in
`apps/frontend/src/app/sitemap.ts` returns 200 without an auth cookie.

---

### B2 — `/features` claims the sweeper recovers posts after a token refresh; it explicitly excludes them

**File:** `apps/frontend/src/app/(marketing)/features/page.tsx:82-83`
(also `apps/frontend/src/app/(marketing)/reliability/page.tsx:507-508`)

**Offending text:**
> **The sweeper** — "Every hour, a sweeper re-queues anything that missed its
> slot — after downtime, an API outage **or a token refresh**. Missed doesn't
> mean lost."

> "If a slot is missed — a deploy, a restart, a bad hour — the sweeper re-queues
> it within the hour. **Nothing quietly expires off the calendar.**"

**Why it's wrong:** `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts:37-49`:

```ts
searchForMissingThreeHoursPosts() {
  return this._post.model.post.findMany({
    where: {
      integration: { refreshNeeded: false, inBetweenSteps: false, disabled: false, deletedAt: null },
      publishDate: { gte: dayjs.utc().subtract(2, 'day').toDate(), lt: dayjs.utc().toDate() },
      state: 'QUEUE', ...
```

The sweeper **excludes** every integration with `refreshNeeded: true` — which is
precisely the token-refresh case — and the window is only **2 days**. Worse,
`post.workflow.v1.0.6.ts:156-173` marks a post firing on such a channel terminal
`ERROR` ("Refresh channel needed"), which leaves `state='QUEUE'` and is never
re-queued after the user reconnects. This is the exact contradiction
`codebase-reality.md` §Contradictions item 1 flagged in `marketing.config.ts`;
it was moved into `features/page.tsx` rather than corrected. It sits under the
page's own promise "Everything on this page ships in the product today."

**Recommended text (features:83):**
> "Every hour, a sweeper re-queues healthy channels' posts that missed their slot
> in the last two days — after a deploy, a restart or an API outage. Posts on a
> channel that needs reconnecting are held with a reason instead, so nothing is
> retried into a dead connection."

**Recommended text (reliability:508):**
> "If a slot is missed — a deploy, a restart, a bad hour — the sweeper re-queues
> it within the hour, for any channel that's still healthy and any slot from the
> last two days."

---

### B3 — `/features` and `/publishing` claim a per-network delivery status view the calendar does not have

**File:** `apps/frontend/src/app/(marketing)/features/page.tsx:85-88` and
`apps/frontend/src/app/(marketing)/publishing/page.tsx:46`

**Offending text:**
> **Honest status** — "The calendar shows what actually happened, per network —
> delivered, retrying or failed, with the platform's own error."

> "Honest per-network status"

**Why it's wrong:** `apps/frontend/src/components/launches/calendar.tsx:1044-1066`
is the whole of the calendar's status surface:

```tsx
state === 'ERROR' && 'rounded-[10px] ring-2 ring-red-500'
...
data-tooltip-content={post.error || 'An error occurred while publishing this post'}
```

There is a red ring and a raw `post.error` tooltip — nothing else. `RETRYING` is
a `PublishingJob` state that never reaches the calendar; `providerUrl`,
`attempts`, `failureCategory`, `failureCode` and the publishing-job endpoints are
consumed only by the admin console (`admin-operations.component.tsx`) and the
public API. "delivered, retrying or failed, per network" describes a UI that
does not exist. `codebase-reality.md` §Contradictions item 2 called this out
against `marketing.config.ts` ("exactly what happened, per network"); the word
"exactly" was softened to "actually" but the substance was not fixed.

**Recommended text (features:87):** replace with a claim the calendar supports —
> "**Failures you can see** — a failed post is ringed on the calendar with the
> platform's own error on hover, plus an in-app alert and an email. The full
> per-destination state history, live URL and attempt count are on the delivery
> receipt: `GET /public/v1/posts/:id/status`."

**Recommended text (publishing:46):** `'Honest failure reporting'` (and adjust the
supporting bullet the same way).

---

### B4 — `/integrations/mcp` and `/for-developers` document a scoped-API-key MCP flow that does not work and a scope enforcement that does not exist

**File:** `apps/frontend/src/app/(marketing)/integrations/mcp/page.tsx:22`, `:90`, `:147`;
`apps/frontend/src/app/(marketing)/for-developers/page.tsx:236`

**Offending text:**
- `:22` — "In your Publishly settings, issue an API key with only the scopes your
  assistant needs — posts read/write is enough for scheduling. The key is shown
  once and hashed at rest."
- `:90` — "An assistant can't do anything your API key wasn't scoped to do."
- `:147` — "No. MCP calls authenticate with your API key and **inherit its
  scopes**. Revoke the key and the assistant's access ends with it."
- for-developers `:236` — "An MCP-capable assistant can schedule and manage posts
  **under your API key's scopes**."

**Why it's wrong:** `libraries/nestjs-libraries/src/chat/start.mcp.ts:25-31`:

```ts
const resolveAuth = async (token: string) => {
  if (token.startsWith('pos_')) { ... return authorization.organization; }
  return organizationService.getOrgByApiKey(token);
};
```

`getOrgByApiKey` (`organization.repository.ts:58-72`) matches the **legacy
plaintext `Organization.apiKey` column**. The scoped keys the page tells the user
to create are `pub_`-prefixed, stored hashed in the `ApiKey` table
(`api-keys.service.ts`), and will therefore never resolve — the documented setup
step returns 401. And nothing on any MCP path calls
`ApiKeysService.scopeAllows(...)`; scope enforcement exists **only** in
`apps/backend/src/services/auth/public.auth.middleware.ts:94`, which the MCP
routes bypass entirely. `/mcp/:id` (start.mcp.ts:195-208) additionally accepts the
legacy org key **in the URL path**. Two separate false statements: a broken setup
instruction and a security guarantee that isn't enforced.

**Recommended fix:** either wire MCP through `ApiKeysService.validateKey` +
`scopeAllows` (preferred — the copy then becomes true), or correct the page:
- `:22` → "Connect your assistant with OAuth (the `/mcp-oauth` endpoint) — the
  authorization runs against your Publishly account."
- `:90` → "An assistant acts inside the workspace you authorized it against."
- `:147` → "MCP access is authorized per workspace and can be revoked from your
  settings. Per-scope limits on MCP tools are in development — today scopes
  constrain the REST API only."
- for-developers `:236` → "An MCP-capable assistant can schedule and manage posts
  in the workspace you authorize it against."

---

### B5 — "The Free plan includes real API access" is contradicted by the auth middleware

**Files:**
- `apps/frontend/src/app/(marketing)/pricing/page.tsx:48-49` (FAQ)
- `apps/frontend/src/app/(marketing)/for-developers/page.tsx:64-65` (FAQ), `:283-286`, `:299-301`
- `apps/frontend/src/app/(marketing)/for-creator-networks/page.tsx:67`
- `apps/frontend/src/components/marketing/pricing-cards.tsx` (Free card "API access")
- comparison tables: "API-first — Yes, public API on every plan"

**Offending text:**
> "The Free plan isn't a locked demo — it includes API access: 50 posts a month
> across 5 connected accounts, no credit card required. Build against the real
> endpoints before you pay for anything."

**Why it's wrong:** `apps/backend/src/services/auth/public.auth.middleware.ts:85-90`:

```ts
const org = validated.organization;
if (!!process.env.STRIPE_SECRET_KEY && !org.subscription) {
  res.status(HttpStatus.UNAUTHORIZED).json({ msg: 'No subscription found' });
  return;
}
```

A FREE organization never has a `Subscription` row —
`subscription.repository.ts:138-185` (`createOrUpdateSubscription`) only ever
writes one for `'STANDARD' | 'TEAM' | 'PRO' | 'ULTIMATE'`, driven by Stripe
webhooks. So in any deployment with `STRIPE_SECRET_KEY` set (i.e. the hosted
product this site sells), **every** public-API call from a Free account returns
401 "No subscription found". The later tier check at `:135-144` — which correctly
lets `pricing.FREE.public_api === true` through — is unreachable for Free users.

**Recommended fix (preferred — code):** change the gate to only bar orgs whose
resolved tier lacks `public_api`, deleting the `!org.subscription` short-circuit:
```ts
const tier = org.subscription?.subscriptionTier || 'FREE';
if (!!process.env.STRIPE_SECRET_KEY && !pricing[tier]?.public_api) { ...402... }
```
**If the gate is intentional,** every claim above must change to "API access
starts on the Starter plan ($29/mo)" and the Free pricing card must drop
"API access", and `data/public-product-facts.json` `pricing.tiers[FREE].api_access`
must flip to `false` (the `public-facts.spec.ts` bridge will then force
`pricing.ts` in line).

---

### B6 — `/compare/buffer` asserts an unverified negative about a competitor

**File:** `apps/frontend/src/app/(marketing)/compare/buffer/page.tsx:213-216`

**Offending text:**
> "At 100 channels the published math is $1,000 a month — and **Buffer doesn't
> fire a webhook when a post fails.** Publishly does: signed, with the reason and
> the retry already attached."

**Why it's wrong:** `data/claim-provenance.json` contains exactly one Buffer
claim (`buffer-30-channels`), covering pricing only. Nothing about Buffer's
webhook behaviour was ever verified. The comparison table nine rows above on the
same page correctly says "Not published", and
`/methodology/api-comparisons` publicly commits to "does the vendor **publish**
that it tells you". This sentence breaks the site's own stated rule and is the
one line on the site that could draw a competitor complaint.

**Recommended text:**
> "At 100 channels the published math is $1,000 a month — and Buffer doesn't
> publish a failure-webhook capability. Publishly does: signed, with the reason
> and the retry already attached."

---

### B7 — `/data-deletion` server-renders an empty page (no `<h1>`, no content, no nav, default title)

**File:** `apps/frontend/src/app/(marketing)/data-deletion/page.tsx:124-130`

**Offending code:**
```tsx
export default function DataDeletionPage() {
  return (
    <Suspense fallback={null}>
      <DataDeletionContent />
    </Suspense>
  );
}
```

**Why it's wrong:** `DataDeletionContent` is a `'use client'` component that calls
`useSearchParams()`. In the App Router that forces the enclosing Suspense
boundary to bail out of SSR — and the boundary wraps the *entire page*, with
`fallback={null}`. Measured: `/data-deletion` returns 16 KB of HTML containing
only `Skip to content`; `grep "Delete connected-platform data"` → 0 matches; it
is the only route on the site with **zero `<h1>` elements**; and because the file
is a client component it exports no `metadata`, so its `<title>` falls back to
the site default `"Publishly — social media posting API with unlimited accounts"`.

This is the URL submitted to Meta as the Data Deletion Callback / instructions
URL. A reviewer (or any crawler, or any user with JS blocked) sees a blank page.

**Recommended fix:** make `page.tsx` a server component that renders the static
instructions, `<h1>`, and its own `export const metadata`, and wrap only the
small code-status widget in `<Suspense>` with a real fallback:
```tsx
export const metadata: Metadata = {
  title: 'Delete your data',
  description: 'How to delete connected-platform data from Publishly, and how to check a Meta de-authorization request.',
};
export default function DataDeletionPage() {
  return (<><MarketingNav /><main id="mk-main">
    <h1 className="mk-h2">Delete connected-platform data</h1>
    <Suspense fallback={<p>Checking your deletion request…</p>}><DeletionStatus /></Suspense>
    {/* static instructions rendered outside Suspense */}
  </main><MarketingFooter /></>);
}
```

---

## MAJOR

### M1 — Three pages make a blanket "official OAuth" claim across all 10 networks; Bluesky uses an app password

**Files:**
- `apps/frontend/src/app/(marketing)/page.tsx:48`
- `apps/frontend/src/app/(marketing)/for-agencies/page.tsx:62`
- `apps/frontend/src/app/(marketing)/for-multi-brand/page.tsx:64`

**Offending text:**
- home — "Connect each account once through its platform's official OAuth flow, then POST to /public/v1/posts…"
- for-agencies — "Give each client its own workspace, connect their channels through official OAuth…"
- for-multi-brand — "Connect each brand's channels through the platforms' official OAuth flows…"

**Why it's wrong:** `data/public-product-facts.json` → `security.oauth_only` is
explicit: *"EXCEPTION (verified 2026-08-10 in bluesky.provider.ts customFields):
Bluesky offers no third-party OAuth for posting apps… **Never write blanket
'OAuth only / no passwords' copy.**"* `/security` and `/platforms/bluesky` get
this right ("Nine of the ten featured networks…"); these three FAQ answers
contradict them. All three are also emitted into `FAQPage` JSON-LD, so answer
engines will quote the inaccurate version.

**Recommended text:** in all three, replace "official OAuth flow(s)" with
"the platform's own authorization flow" (and, on home, append: "— official OAuth
on nine of the ten featured networks; Bluesky uses a revocable app password you
generate in Bluesky itself").

### M2 — "No credit card needed. 7-day trial on every plan." — Stripe Checkout collects a card, and Free has no trial

**Files:** `apps/frontend/src/app/(marketing)/page.tsx:119` and `:410-411`;
`reliability/page.tsx:602-603`; `for-agencies/page.tsx:290`;
`for-creator-networks/page.tsx:304`; `for-multi-brand/page.tsx:230`;
`components/marketing/product-page.tsx:339`

**Offending text:** "No credit card needed. 7-day trial on every plan."

**Why it's wrong:** the trial is a Stripe Checkout subscription session
(`libraries/nestjs-libraries/src/services/stripe.service.ts:472-482` and `:533-543`):
```ts
subscription_data: { ...(allowTrial ? { trial_period_days: 7 } : {}), ... }
```
`payment_method_collection` is never set anywhere in the repo, so it defaults to
`'always'` — **a card is required to start the trial.** Separately, "on every
plan" is false twice over: FREE has no trial (`pricing-cards.tsx:86` renders
"Start free" for it), and `Organization.allowTrial` defaults `false`
(`schema.prisma:20`) and is flipped to `false` permanently once a subscription
exists (`subscription.repository.ts:188-196`) — it is once per organization.

**Recommended text:** "Free forever plan — no credit card. 7-day trial on every
paid plan." (If a genuinely card-free trial is wanted, set
`payment_method_collection: 'if_required'` on both Checkout sessions and keep the
current wording.)

### M3 — "the same surface the dashboard itself calls internally, not a stripped-down subset"

**Files:** `apps/frontend/src/app/(marketing)/for-developers/page.tsx:50-51`;
`features/page.tsx:110`; `apps/frontend/src/app/(marketing)/page.tsx:374`

**Offending text:**
- "**One base path** — Every call goes through REST /public/v1 — the same surface
  the dashboard itself calls internally, not a stripped-down subset."
- "Everything the app does, your scripts can do." (×2)

**Why it's wrong:** the public API is one controller —
`apps/backend/src/public-api/routes/v1/public.integrations.controller.ts` — with
**25** route decorators. The dashboard API (`apps/backend/src/api/routes/*.ts`)
has **210**. Media library, team/roles, billing, settings, agents, inbox,
autopost, third-party, webhooks management and audit logs have no public
equivalent. It is by definition a subset.

**Recommended text:**
- for-developers:51 → "**One base path** — every call goes through REST
  `/public/v1`: posts, media upload, integrations, analytics and per-post delivery
  status, on one versioned surface."
- features:110 / home:374 → "Scheduling, media, integrations and analytics — all
  scriptable with the same scoped keys."

### M4 — `/security` heading says "4 commitments." above 5 rendered items

**File:** `apps/frontend/src/app/(marketing)/security/page.tsx:82-84`

**Offending text:** `<h2 id="sec-commitments" className="mk-h2">4 commitments.</h2>`

**Why it's wrong:** the `<dl>` immediately below maps `MARKETING.security`, which
has **5** entries (`marketing.config.ts:108-129`: tokens encrypted, platform front
door, API keys, audit trail, client isolation). The page renders five. A visible
miscount on the page whose whole thesis is "descriptions of how the system works
today" is self-refuting, and LLM extractors will read the number.

**Recommended fix:** derive it — `{MARKETING.security.length} commitments.` — so
it can never drift again.

### M5 — "the per-profile tools bill over $1,200 a month" is not in the provenance file and is true of only one competitor

**File:** `apps/frontend/src/app/(marketing)/for-agencies/page.tsx:74` and `:255`

**Offending text:** "At 100 profiles the per-profile tools bill over $1,200 a month."

**Why it's wrong:** `claim-provenance.json` supports exactly three per-account
figures at 100 accounts: Ayrshare **$1,228.30**, Buffer **$1,000**, Upload-Post
**$438** (the 225-profile tier). Only Ayrshare exceeds $1,200; the plural
generalisation asserts something no source backs. (`marketing.config.ts:65`
"bill four figures a month" has the same problem for Upload-Post but is at least
true of two of the three.)

**Recommended text:** "At 100 profiles, Ayrshare's published Business pricing
works out to $1,228.30 a month and Buffer's Team rate to $1,000."

### M6 — No `<link rel="canonical">` on any page, and the sitemap omits all 30 leaf pages

**Files:** `apps/frontend/src/app/(marketing)/layout.tsx:22-45` (no `alternates`),
every `page.tsx` `metadata` export; `apps/frontend/src/app/sitemap.ts:12-66`

**Why it's wrong:** grep for `canonical|alternates` across
`apps/frontend/src/app` and `components/marketing` returns **zero** matches
outside code comments. Meanwhile `proxy.ts:56-60` rewrites logged-out `/analytics`
onto the `/product/analytics` page, producing the same content at two URLs
(mitigated only by `robots.ts` disallowing `/analytics`), and `/agencies` 307s to
`/for-agencies`. Separately, `sitemap.ts` lists the `/docs/errors` and `/platforms`
hubs but none of their children — the **20 `/docs/errors/[code]` pages and 10
`/platforms/[network]` pages**, i.e. the entire docs-as-citation corpus the
repositioning is built around, are absent from the sitemap.

**Recommended fix:** add `alternates: { canonical: '<path>' }` to every page's
`metadata` (and `metadataBase` already exists in the layout, so relative paths
work). In `sitemap.ts`, generate the leaves:
```ts
...Object.keys(POST_FAILURE_CATALOG).map((c) => [`/docs/errors/${c}`, 0.5] as [string, number]),
...Object.keys(PLATFORM_SPECS).map((p) => [`/platforms/${p}`, 0.6] as [string, number]),
```

### M7 — Internal operator TODOs render as public copy; `/contact` exposes no working contact channel

**Files:** `apps/frontend/src/app/(marketing)/contact/page.tsx:33-52`;
`source/page.tsx:47-48`; `data-deletion/page.tsx:110-112`

**Offending text (rendered today, because `NEXT_PUBLIC_SUPPORT_EMAIL` is unset):**
- `/contact` — "**Operator action required: set NEXT_PUBLIC_SUPPORT_EMAIL before
  launch so this page exposes a working support channel.**"
- `/source` — "(Operators: set NEXT_PUBLIC_SOURCE_URL to link a public mirror directly.)"
- `/data-deletion` — "Need help? Contact **the support address published by the operator**."

**Why it's wrong:** these are build instructions addressed to the operator,
rendered to visitors. `/contact` — linked from the footer of all 69 pages, listed
in `sitemap.ts`, and cited by `/security` as the vulnerability-reporting route —
currently provides no way to make contact at all. The AGPL §13 source offer on
`/source` and the Meta data-deletion contact path have the same hole.

**Recommended fix:** set `NEXT_PUBLIC_SUPPORT_EMAIL` (and
`NEXT_PUBLIC_SOURCE_URL`) in the deploy env, and change the fallbacks from
operator-directed instructions to visitor-safe copy or a rendered mailto that is
never empty. Add these two vars to the go-live checklist as hard gates.

---

## MINOR

1. **Placeholder API host in the home hero terminal.**
   `apps/frontend/src/app/(marketing)/page.tsx` (ApiTerminal) renders
   `curl -X POST https://api.yourdomain.com/public/v1/posts`. Every other page
   uses `https://your-publishly-host/...`. Pick one placeholder convention; on the
   home hero, prefer the real production host once it exists.

2. **Upload-Post cost at 100 accounts is stated as a range that understates it.**
   `resources/best-social-posting-apis-2026/page.tsx` and `/compare` table:
   "Between $147–$438 (75/225-profile tiers)". Per provenance the tiers are
   2/5/25/75/225 profiles — 100 profiles exceeds the 75-profile tier, so the
   published price at 100 is **$438**. Recommend: "$438/mo — 100 profiles needs the
   225-profile tier."

3. **The growth-tax slider extrapolates an Ayrshare price below its verified point.**
   `components/marketing/growth-tax.tsx:20-23` renders `$599` for any n ≤ 30, but
   `claim-provenance.json` only verifies the Business plan at 100 profiles;
   Ayrshare publishes cheaper lower tiers. Honest as labelled ("Ayrshare —
   Business") but recommend clamping the slider's competitor cards to n ≥ 30, or
   adding "Business plan only — Ayrshare publishes cheaper tiers at low profile
   counts."

4. **Network count phrasing drifts.** `features/page.tsx:90` says "plus **20+**
   more publishing targets from the engine"; home and the diagram say "+24 more";
   the facts registry says `additional_count: 24`. Use "+24 more" everywhere.

5. **`aria-hidden="true"` on meaningful hero text.** `components/marketing/product-page.tsx:92`,
   `reliability/page.tsx:220`, `for-creator-networks/page.tsx:115` hide the "mono
   index" lists from assistive tech (on `/reliability` that is the page's section
   index: "The failure catalog / Delivery receipts / Failure webhooks / Safe
   retries / Token health"). Defensible as duplicated decoration, but the reliability
   one is a genuine wayfinding aid — recommend making it a real `<nav>` of anchor
   links instead of hidden spans.

6. **`/changelog` title double-suffixes.** `changelog/page.tsx:16` sets
   `title: 'Changelog — Publishly'` while `layout.tsx:26` applies
   `template: '%s — Publishly'`, rendering `<title>Changelog — Publishly — Publishly</title>`.
   Change to `title: 'Changelog'`.

7. **`localhost:4200` is baked into the sitemap, robots and every JSON-LD `@id`/`url`.**
   `marketing.config.ts:28-31` falls back to `http://localhost:4200` when neither
   `NEXT_PUBLIC_SITE_URL` nor `MAIN_URL` is set. Expected in dev; add both to the
   go-live env gate so the Organization/SoftwareApplication `@id`s resolve.

8. **The compliance-language guard has a hole.**
   `libraries/nestjs-libraries/src/database/prisma/subscriptions/public-facts.spec.ts:57-63`
   runs `facts.compliance_language.banned_regex` against **`marketing.config.ts` only**,
   but essentially all page copy now lives in `apps/frontend/src/app/(marketing)/**/page.tsx`.
   (I verified no violations exist today.) Widen the spec to glob every marketing
   `page.tsx` so a future edit can't slip an "autopilot"/"mass account" past CI.

9. **Provenance `pages` field points at a route that doesn't exist.**
   `data/claim-provenance.json` `bundle-social-entry.pages` = `["/compare/bundle-social"]`,
   but there is no such route; the bundle.social numbers actually render on
   `/resources/best-flat-pricing-posting-apis`. Correct the `pages` array.

10. **Unlabelled mock data in product replicas.** `/product/analytics` renders
    "Followers 12,480 +3.2% / Impressions 86,210 +11.4%" and `/engagement` renders
    invented commenter handles (`@maya_k`, `@sam.builds`, `@lena_v`). These read as
    real screenshots. Given the site's own honesty floor, add a visible
    "Illustrative — not customer data" caption to each replica block.

11. **`/privacy` and `/terms` render "Draft template — the operator must have
    counsel review and complete this document… before public launch."** Intentional
    pre-launch state, but both are in `sitemap.ts` and linked from every footer.
    Gate go-live on replacing them.

12. **`/agencies` uses a 307 (temporary) redirect to `/for-agencies`.** For a
    permanent alias, use `permanentRedirect()` (308) so link equity consolidates.
    File: `apps/frontend/src/app/(marketing)/agencies/page.tsx`.

---

## Appendix — verification notes

- **`post.failure` webhooks are real and fire on every failure path.**
  `publishing-failure.service.ts:98-125` builds the CloudEvent, and
  `PublishingFailureService.record` is reached from all four failure entry points:
  `posts.service.ts:851` (queue start failure), `:1268` (`changeState → FAILED`,
  which is what every `changeState(postId,'ERROR',…)` in
  `post.workflow.v1.0.6.ts:123-556` funnels into), `:1311`
  (`transitionPublishingJob` for `RETRYING`/`FAILED`), and `:1413`
  (`ensureClassifiedPublishingOutcomeV107`, the terminal-invariant wrapper added in
  `post.workflow.v1.0.7.ts:56-77`). `codebase-reality.md` row 2 ("ABSENT") is now
  **stale** — the pages do not overstate this. Signing, 3 attempts with 1s/5s
  backoff, the `WebhookDeliveryAttempt` ledger and the SSRF-safe dispatcher all
  match the copy on `/reliability`.
- **Failure catalog copy is generated, not written**: `/reliability`,
  `/docs/errors` and `/platforms/[network]` all import `POST_FAILURE_CATALOG`
  directly. 20 codes; 7 recoverable / 7 user_action_needed / 6 data_problem —
  the rendered counts are exact.
- **Pricing renders from `pricing.ts`**: FREE 5/50/1 seat/1 ws/30-day/1 GB,
  Starter 29/2,000/90-day/25 GB, Growth 99/15,000/10 seats/5 ws/365-day/100 GB,
  Scale 299/100,000/50 seats/25 ws/730-day/500 GB — all match. JSON-LD `Offer`
  prices 0/29/99/299 match. Yearly 290/990/2,990 = 10×.
- **`test/integration/tenant.isolation.int.spec.ts` exists and runs against the
  live backend**, so `/security`'s "automated cross-tenant access tests that run
  against the real API" is supported.
- **`LICENSE` and `LICENSE-COMPLIANCE.md` both exist**, supporting `/source`.
- Static assets all 200: `/publishly-social.png`, `/publishly.svg`,
  `/apple-touch-icon.png`, `/publishly-wordmark.png`, `/site.webmanifest`.
- Unknown dynamic slugs correctly 404 (`/docs/errors/not_a_code`,
  `/platforms/orkut`, `/compare/nope`).
