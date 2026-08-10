# Go-live checklist — blocking gates

The marketing site describes the finished product (operator decision 2026-08-10).
**Deploy is blocked until every claimed feature below actually ships.** Verify each
against the code, not memory.

## Claimed-feature gates (from data/public-product-facts.json)
- [ ] `post.failure` webhook dispatches on every failure path (status was pre_release
      2026-08-10 — concurrent build in `publishing-failure.service.ts` / workflow v1.0.7;
      verify merged + e2e green)
- [ ] Failure catalog live end-to-end (codes surface on posts + webhooks)
- [ ] Delivery receipts readable by customers (org-facing publishing-job endpoint/UI,
      not just admin)
- [ ] Org-scoped success-rate/fleet-health surface (planned Phase 1b/1f — build before
      any "dashboard glimpse" screenshot ships)
- [ ] Quota semantics: ERROR posts excluded from the monthly counter before any
      "failed posts never count" copy goes live (currently NOT claimable — copy uses
      "sized by posts" only)
- [ ] AI suite (Caption Memory, Brand Folders, Video Understanding, self-tuning
      schedule): pages label these "in development" — EITHER ship them or keep labels
- [ ] Pricing: Stripe products match pricing.ts ($0/$29/$99/$299, yearly ×10);
      ULTIMATE 'Enterprise' placeholder finalized or hidden from app billing UI

## Infrastructure gates
- [ ] NEXT_PUBLIC_SITE_URL set to the real origin (JSON-LD @id, sitemap, robots depend on it)
- [ ] robots.txt serves at the live domain; crawler policy honored (docs/seo/crawler-policy.md)
- [ ] Cloudflare (or any WAF/CDN): OAI-SearchBot, PerplexityBot, Googlebot, GPTBot,
      ClaudeBot, CCBot receive NO managed challenge / JS challenge / CAPTCHA / 403 /
      429 loop / geo block / login redirect on public marketing+docs pages
      (test with curl -A per user agent). Private app/API routes stay protected.
- [ ] sitemap.xml reachable; lastmod honest
- [ ] Structured data validates (Rich Results test): Organization, SoftwareApplication,
      FAQPage — zero fake ratings/reviews/counts
- [ ] favicon.ico + site.webmanifest regenerated to the blue-tile mark (theme_color
      still #4F46E5 as of 2026-08-10)
- [ ] node scripts/check-claim-freshness.mjs exits 0 (competitor numbers ≤30 days old)
- [ ] public-facts.spec.ts green (registry ↔ pricing.ts ↔ copy)

## Post-deploy activation (docs/seo/measurement.md)
- [ ] Search Console verified; AI Overviews/AI Mode reporting tracked weekly
- [ ] utm_source=chatgpt.com referral segment + AI-referral funnel dashboard
- [ ] Preferred Sources CTA tracking event
- [ ] AI discovery regression checks begin (fixed query set, manual, no automated
      hammering of consumer AI products)
