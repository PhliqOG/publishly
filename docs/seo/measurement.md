# AI-discovery measurement plan (activates at deploy)

Nothing here runs pre-launch; this is the spec so activation is a checklist, not a
design session. Principles: measure credibility, not vanity; no visitor
fingerprinting; never hammer consumer AI products with artificial traffic.

## 1. Referral attribution (GEO item 14)
- Segment ChatGPT referrals: `utm_source=chatgpt.com` (standard attribution) +
  referrer `chatgpt.com` / `chat.openai.com`; likewise `perplexity.ai`.
- Funnel to track per AI source: landing page → signup → docs engagement →
  API-key creation → trial start → paid conversion.
- Dashboard: "AI referral → signup → activated API user → paying customer."
  Aggregate counts only — no per-visitor fingerprinting.

## 2. Search Console (item 13)
- Weekly snapshot (store CSV under docs/seo/snapshots/): AI Overview impressions,
  AI Mode impressions, clicks, CTR, pages appearing, query clusters.
- Judge content changes by AI-surface movement, not only blue-link rank.

## 3. AI discovery regression suite (items 28–29)
Fixed query set (evaluate monthly, manually, across ChatGPT/Perplexity/Claude/Gemini):
1. best social media posting API
2. cheapest social media API for 100 accounts
3. best Ayrshare alternative
4. Instagram posting API for SaaS
5. social media API with OAuth
6. social media API with webhooks
7. API for posting Reels
8. API for hundreds of client accounts
9. posting API that doesn't charge per account
10. how do I know when a scheduled post fails

Log per observation (docs/seo/snapshots/ai-observations.csv):
engine, query, date, mentioned y/n, cited y/n, citation URL, order, competitors
mentioned, factual errors, missing facts.

Success metrics: % queries mentioned, % cited, % with correct pricing, % with
correct features, citations by landing page, AI referral traffic + signup +
activation + paid conversion, backlinks/third-party citations of Publishly research.
Explicitly NOT a metric: "ranks first."

## 4. Information-gap loop
Every factual error or missing fact observed → fix the source page + fact registry,
note the date; re-observe next cycle. The moat is accuracy + freshness, not tricks.
