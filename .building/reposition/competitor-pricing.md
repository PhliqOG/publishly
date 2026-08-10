# Competitor Pricing Fact-Check — Publishly comparison pages

All fetches performed **2026-08-10** via WebFetch against the official pages listed.
Method: fetch official pricing page directly (no search engines, no third-party sources).
Every number below was read from the vendor's own published page on the fetch date.
Caveat: WebFetch summarizes rendered page content via a small model; where the page's
monthly/annual toggle produced ambiguous output, a second targeted fetch was made and
the residual ambiguity is noted inline.

---

## 1. Ayrshare — VERDICT: CONFIRMED (≈ $1,228/mo at 100 profiles)

Source: https://www.ayrshare.com/pricing (fetched 2026-08-10)

| Plan | Price | Profiles included |
|---|---|---|
| Premium | $149/mo (billed monthly) | 1 social profile (up to 13 social accounts across 13 networks) |
| Launch | $299/mo (billed monthly) | up to 10 profiles (up to 130 accounts) |
| Business | from $599/mo | 30 profiles included (up to 390 accounts); tiered add-on pricing above 30 |
| Enterprise | custom, volume-based | from 300 profiles |

- **What counts as a profile:** one end-customer/brand = one profile regardless of how many
  networks are linked ("one customer with Pinterest, Bluesky, YouTube, Reddit, X, TikTok
  (and more!) still counts as one profile"). Independent locations/brands = separate profiles.
- **API access:** all plans include API access and documentation; unlimited team members on all plans.
- **Tiered per-profile pricing (Business, above the 30 included):**
  - profiles 31–100: $8.99/profile/mo (monthly billing) or $7.99 (annual)
  - profiles 101–500: $3.49/mo (monthly) or $2.99 (annual)
  - 500+: $2.49/mo (monthly) or $1.99 (annual)

**Arithmetic — 100 profiles, Business plan, monthly billing:**
```
Base (first 30 profiles):        $599.00
Profiles 31–100: 70 × $8.99  =   $629.30
TOTAL                        =  $1,228.30 / mo
```
Claim "≈ $1,228/mo at 100 profiles" → **CONFIRMED** ($1,228.30 exactly, monthly billing).
Annual-billing variant: 70 × $7.99 = $559.30 + $599 base = **$1,158.30/mo** (assumes the
$599 base is unchanged on annual billing — annual base price not separately shown).

- **Uptime/guarantee language on pricing page:** yes — "99.99% API uptime" stated across
  plans; "30 million API calls" daily capacity mentioned.
- **Unlimited profiles on any tier:** No. All tiers metered per profile; Enterprise is
  custom volume-based, not unlimited. (Team members are unlimited; profiles are not.)

---

## 2. Buffer — VERDICT: DIFFERENT (≈ $300/mo max at 30 channels, not $360)

Source: https://buffer.com/pricing (fetched 2026-08-10, two fetches)

| Plan | Per-channel price | Notes |
|---|---|---|
| Free | $0 | up to 3 channels, 10 scheduled posts/channel, 1 user, 1 API key (3,000 requests/mo), 30-day analytics history |
| Essentials | $5/mo per channel (annual: $60/yr per channel, "save 2 months") | unlimited channels, pay per channel |
| Team | $10/mo per channel (annual: $120/yr per channel, "save 2 months") | unlimited channels, pay per channel |

- Volume discount: "channels 1–10 are priced at the standard rate, and any channels above
  10 cost less per channel" — the discounted rate is **not published numerically** on the page.

**Arithmetic — 30 channels:**
```
Team:       30 × $10 = $300/mo   (upper bound; channels 11–30 discounted by an unpublished amount)
Essentials: 30 × $5  = $150/mo   (upper bound, same caveat)
```
Claim "≈ $360/mo at 30 channels" → **DIFFERENT**. The current page supports at most
**$300/mo** (Team, before the >10-channel volume discount), or **$150/mo** on Essentials.
$360 would require a $12/channel rate, which does not appear on the current page.
Ambiguity note: both fetches returned $5/$10 as the monthly figures while also carrying
"save 2 months" annual labels; if the $5/$10 figures are in fact the annual-billing display
and monthly billing is higher (Buffer has historically shown $6/$12 monthly), 30 Team
channels billed monthly would be $360 — but that rate was NOT visible on the fetched page,
so do not publish $360 without a manual browser check of the monthly/annual toggle.
**Safe publishable number: $300/mo (Team, 30 channels, published rate).**

- **Uptime/guarantee language on pricing page:** none found.
- **Unlimited channels on any tier:** channels are unlimited in count on paid plans but
  every channel is billed — no flat-price unlimited tier.

---

## 3. Hootsuite — VERDICT: pricing recorded; "complaints" portion UNVERIFIED (out of scope)

Source: https://www.hootsuite.com/plans (fetched 2026-08-10)

| Plan | Price | Social accounts | Users |
|---|---|---|---|
| Standard | $99/mo (billed annually) | 10 | 1+ seats |
| Professional | $199/mo (billed annually) — "Most popular" | Unlimited | 1+ seats |
| Advanced | $399/mo (billed annually) | Unlimited | 1+ seats |
| Enterprise | Custom | Unlimited | custom |

- Entry price: **$99/mo billed annually** (Standard, 10 social accounts). Monthly billing
  offered at higher rates (exact monthly-billing figures not shown in fetch output).
- Claim "price hikes + failed-post complaints": per instructions the complaints half was
  NOT verified; the historical-price-hike half was also not verifiable from the current
  page alone (it only shows today's prices) → mark that whole line **UNVERIFIED** on any
  published page, or rewrite to cite only the current $99 entry price.
- **Uptime/guarantee language on plans page:** none found.
- **Unlimited accounts on any tier:** yes — Professional ($199/mo annual) and above have
  unlimited social accounts. (Competitive note: this weakens any "Hootsuite caps accounts"
  angle; the cap only bites on the $99 Standard tier.)

---

## 4. bundle.social — VERDICT: CONFIRMED ($100/mo first paid tier)

Source: https://bundle.social/pricing (fetched 2026-08-10)

| Plan | Price | Posts/mo | Social accounts |
|---|---|---|---|
| FREE | $0/mo per organization | 20 | 3 |
| PRO | $100/mo per organization (14-day trial) | 10,000 | Unlimited |
| BUSINESS | $400/mo per organization — "Most popular" | 100,000 | Unlimited |
| CUSTOM | custom | custom | Unlimited |

- Claim "$100 entry cliff" → **CONFIRMED**: nothing exists between the $0 free tier
  (20 posts/mo, 3 accounts) and PRO at $100/mo. First paid dollar = $100/mo.
- All tiers include API access. X/Twitter posts billed separately from a prepaid credit
  balance: $0.015/post, $0.20 for posts with a link.
- **Uptime/guarantee language on pricing page:** none found.
- **Unlimited accounts on any tier:** yes — every paid tier (PRO and up) has unlimited
  connected social accounts.

---

## 5. Metricool — reference benchmark (no operator claim to verify)

Source: https://metricool.com/pricing/ (fetched 2026-08-10, two fetches; USD monthly billing)

| Plan | Monthly (USD) | Brands |
|---|---|---|
| Free | $0 | 1 brand (excludes LinkedIn and Twitter/X; 20 posts/mo max; 30-day analytics) |
| Starter | $20/mo (5 brands) · $36/mo (10 brands) | 5–10 |
| Advanced | $53/mo (15 brands) · $85/mo (25 brands) · $159/mo (50 brands) | 15–50 |
| Custom | "Let's talk!" | custom |

- Annual billing: page advertises "save up to 24%"; explicit USD annual figures were not
  exposed in the fetch (EUR annual shown: Starter from ~€16/mo, Advanced from ~€43/mo).
- Starter+ has "Unlimited* content publishing" (* Fair Use Policy).
- **Uptime/guarantee language on pricing page:** none found.
- **Unlimited brands on any tier:** No — standard tiers cap at 50 brands ($159/mo);
  Custom is negotiable, not advertised as unlimited.
- Benchmark math: 50 brands at $159/mo = **$3.18/brand/mo** — the cheapest per-brand rate
  of any competitor in this file.

---

## 6. upload-post.com — context (optional fetch)

Sources: https://www.upload-post.com/pricing (fetched 2026-08-10 — page itself exposes no
numbers) + the vendor's own https://www.upload-post.com/llms-full.txt (fetched 2026-08-10).
Numbers below are vendor-published in llms-full.txt, not visually confirmed on the rendered
pricing page — flag as such if quoted publicly.

| Plan | Monthly | Annual (total/yr) | Profiles | Seats | Uploads |
|---|---|---|---|---|---|
| Free | $0 | $0 | 2 | 1 | 10 uploads/mo |
| Basic | $24 | $192 | 5 | 1 | unlimited |
| Professional | $50 | $400 | 25 | 2 | unlimited |
| Advanced | $147 | $1,411 | 75 | 5 | unlimited |
| Business | $438 | $4,205 | 225 | 10 | unlimited |

- Extra-profile add-on packs: $15–$115/mo depending on tier. "Annual billing saves 40%" (their claim).
- **Uptime/status:** publishes a status page (https://www.upload-post.com/status); no SLA % stated.
- **Unlimited profiles on any tier:** No (225 max on Business + paid add-ons).
- Comparison math at 100 profiles: falls between Advanced (75) and Business (225) —
  Advanced $147 + add-on packs, or Business $438/mo flat.

---

## Verdict summary

| # | Claim | Verdict |
|---|---|---|
| 1 | Ayrshare ≈ $1,228/mo at 100 profiles | **CONFIRMED** — $1,228.30/mo computed from published Business tiering (monthly billing); $1,158.30/mo on annual per-profile rates |
| 2 | Buffer ≈ $360/mo at 30 channels | **DIFFERENT** — published rates give ≤ $300/mo (Team) / $150/mo (Essentials); $360 requires a $12/channel rate not on the current page |
| 3 | Hootsuite "price hikes + failed-post complaints" | **UNVERIFIED** (complaints out of scope; hikes not provable from current page). Current pricing recorded: entry $99/mo billed annually, unlimited accounts from $199/mo |
| 4 | bundle.social "$100 entry cliff" | **CONFIRMED** — first paid tier PRO $100/mo (free tier: 20 posts/mo, 3 accounts) |
| 5 | Metricool (benchmark, no claim) | Recorded: $0 / $20–36 / $53–159 / custom; max 50 brands; ~$3.18/brand/mo at top standard tier |
| 6 | upload-post (context) | Recorded from vendor llms-full.txt: $0/$24/$50/$147/$438/mo; 2–225 profiles; status page published |

## Pre-publish notes for the comparison pages

- Ayrshare's own pricing page claims "99.99% API uptime" — if Publishly's pages contrast
  reliability, do not imply Ayrshare publishes no uptime figure.
- Hootsuite Professional ($199/mo annual) now advertises UNLIMITED social accounts — avoid
  any copy implying Hootsuite always caps accounts.
- Buffer: re-check the monthly/annual toggle in a real browser before publishing any
  30-channel figure; use $300/mo unless the toggle proves $12/channel monthly.
- All prices re-verify before each publish; this snapshot is 2026-08-10.
