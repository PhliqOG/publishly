# Platform Approval Package — Publishly

One runbook per provider for creating the developer apps, whitelisting redirect
URIs, requesting the exact scopes the code uses, and passing platform review.
All scopes, env var names, and redirect URIs in these files are extracted
verbatim from `libraries/nestjs-libraries/src/integrations/social/*.provider.ts`
— they are what the running code actually requests. Platform *process* details
(review forms, tiers, timelines) change frequently; where marked, verify on the
portal before submitting.

`{FRONTEND_URL}` below = the deployed app origin (e.g. `https://app.yourdomain.com`).
It must be HTTPS in production. Several Meta/TikTok providers wrap non-HTTPS dev
URLs with `https://redirectmeto.com/…` — that is a dev convenience only; whitelist
the wrapped URL only for local development, never rely on it in production.

## Recommended sequence

1. **No-review providers first (same-day canaries):**
   - `bluesky.md` — no app, users connect with app passwords. Zero setup.
   - `mastodon.md` — register an app on your chosen instance(s). Minutes.
2. **Meta portal (one business, up to four products):** `facebook.md`,
   `instagram.md`, `threads.md`, `instagram-standalone.md`. Create the app(s) on
   developers.facebook.com, add products, complete Business Verification early —
   it gates Advanced Access for everything else and takes the longest.
3. **Google:** `youtube.md` — OAuth consent screen + verification for
   sensitive/restricted scopes.
4. **TikTok:** `tiktok.md` — app + Content Posting API audit (posts are
   private-only until audited).
5. **LinkedIn:** `linkedin.md` — products for member posting; organization
   scopes need Community Management approval.
6. **Pinterest:** `pinterest.md` — trial access first, standard access review after.
7. **X:** `x.md` — paid API tier decision required for write access.

## What every review needs from you (prepare once)

- Public privacy policy URL and terms URL (marketing site serves these).
- A data-deletion instructions page URL (Meta requires it; see Data handling
  sections). Publishly does not yet expose an automated deletion callback
  endpoint — use the instructions-URL option and treat the callback as roadmap.
- A screen recording of the connect → compose → schedule → publish flow per
  Meta/TikTok/LinkedIn review (record once against the test/dev app).
- The truthful use-case text included in each file — do not embellish it.

## Review-gating summary

| Provider | Works before review? | Review gates |
|---|---|---|
| Bluesky | Yes (fully) | none |
| Mastodon | Yes (per-instance app) | none |
| Facebook Pages | Dev-role users only | Advanced Access (all page scopes) + Business Verification |
| Instagram (FB login) | Dev-role users only | Advanced Access + Business Verification |
| Instagram (standalone) | Tester users only | App Review of instagram_business_* scopes |
| Threads | Tester users only | App Review of threads_* scopes |
| YouTube | 100 test users, warning screen | Google OAuth verification (restricted scopes) |
| TikTok | Private/self-only posts | Content Posting API audit |
| LinkedIn member | Yes with products enabled | org scopes need Community Management access |
| Pinterest | Trial-tier limits | Standard access review |
| X | Depends on paid tier | tier purchase (verify current pricing) |

First-canary rule for every provider: one post to a dedicated test account,
verify the permalink renders, then stop and review rate/error logs before
enabling customer traffic.
