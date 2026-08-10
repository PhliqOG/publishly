# Crawler policy

Which crawlers get access to Publishly's marketing site, why each one is allowed,
and how to verify none of them are silently blocked before go-live. Implementation
lives in `apps/frontend/src/app/robots.ts` (rules) and `apps/frontend/src/app/sitemap.ts`
(the routes those rules point crawlers at). Referenced from
`docs/seo/DEPLOY-CHECKLIST.md`.

Rule: allow every crawler on every marketing/docs route. Disallow only the
private, signed-in app surface (`/auth`, `/api/`, `/settings`, `/launches`,
`/analytics`) — nothing there is meant to be indexed by anyone.

## The crawlers

| Crawler | Operator | Purpose | Allowed | Why | Source doc | Last verified |
|---|---|---|---|---|---|---|
| Googlebot | Google | Search indexing — AI Overviews and AI Mode ride the normal Search index, there's no separate crawler for them | Yes | Standard search crawling; blocking it removes the site from Google Search entirely | [Google crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers) | 2026-08-10 |
| OAI-SearchBot | OpenAI | Crawls and indexes content for ChatGPT's search feature | Yes | This is **the** mechanism for ChatGPT Search visibility — not GPTBot, which is a separate training crawler | [OpenAI crawlers](https://developers.openai.com/api/docs/bots) | 2026-08-10 |
| GPTBot | OpenAI | Crawls content to help train OpenAI's generative AI models | Yes | Allowed as a deliberate content-use decision, not a ranking lever — it has no effect on whether ChatGPT Search cites Publishly (that's OAI-SearchBot's job) | [OpenAI crawlers](https://developers.openai.com/api/docs/bots) | 2026-08-10 |
| PerplexityBot | Perplexity | Surfaces and links websites in Perplexity's answer results | Yes | Answer-engine discovery — Perplexity's equivalent of a search crawler | [Perplexity crawlers](https://docs.perplexity.ai/guides/bots) | 2026-08-10 |
| ClaudeBot | Anthropic | Collects web content that may contribute to training Anthropic's models | Yes | Training / content-use, documented as such. The allowance is a content-use decision — it guarantees nothing about whether Claude recommends Publishly | [Anthropic crawler FAQ](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) | 2026-08-10 |
| CCBot | Common Crawl (non-profit) | Builds the open Common Crawl web dataset that many AI labs train on | Yes | A dataset contribution, not a ranking mechanism — reach into any model trained on Common Crawl is indirect and unverifiable | [Common Crawl / CCBot](https://commoncrawl.org/ccbot) | 2026-08-10 |
| Google-Extended | Google | Controls whether Google may use crawled content to train future Gemini models / ground Gemini Apps | Yes | **Not** required for AI Overviews or AI Mode — those ride Googlebot and the standard Search index. This token is specifically the Gemini-training opt-in, and Google states it "does not impact a site's inclusion in Google Search nor is it used as a ranking signal" | [Google crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers) | 2026-08-10 |

None of these allowances are a promise of traffic, citations, or rankings — they're
a content-use decision. The moat is accurate, current, well-sourced content (see
`docs/seo/measurement.md`), not crawler access by itself.

## Deploy-day checklist

Run this the day the site goes live, and again after any Cloudflare/WAF change.
A crawler that's allowed in `robots.txt` but silently blocked at the edge is worse
than an honest disallow — it looks open and isn't.

- [ ] For each user agent below, confirm the public marketing/docs pages return a
      normal `200` with real HTML — **no** Cloudflare managed challenge, JS
      challenge, CAPTCHA, `403`, `429` loop, geo-block, or login redirect:
      ```
      curl -sD - -o /dev/null -A "Googlebot" https://<live-origin>/
      curl -sD - -o /dev/null -A "OAI-SearchBot" https://<live-origin>/
      curl -sD - -o /dev/null -A "GPTBot" https://<live-origin>/
      curl -sD - -o /dev/null -A "PerplexityBot" https://<live-origin>/
      curl -sD - -o /dev/null -A "ClaudeBot" https://<live-origin>/
      curl -sD - -o /dev/null -A "CCBot" https://<live-origin>/
      curl -sD - -o /dev/null -A "Google-Extended" https://<live-origin>/
      ```
      Repeat against a few deep marketing routes (e.g. `/pricing`, `/compare/ayrshare`,
      `/resources`), not just `/`.
- [ ] Confirm the private app surface is still protected for all of the above:
      `/auth`, `/api/`, `/settings`, `/launches`, `/analytics` should NOT be openly
      crawlable — dashboard, API, and customer routes stay behind auth regardless
      of crawler identity.
- [ ] `https://<live-origin>/robots.txt` serves and lists the rules above (rendered
      from `apps/frontend/src/app/robots.ts`).
- [ ] `https://<live-origin>/sitemap.xml` serves and is reachable from the
      `Sitemap:` line in `robots.txt` (rendered from `apps/frontend/src/app/sitemap.ts`).
- [ ] No bot-management rule (Cloudflare Bot Fight Mode, Super Bot Fight Mode,
      Turnstile, custom WAF rule, etc.) is silently overriding the allowances above —
      `robots.txt` is a request, not an enforcement mechanism; the edge has to agree.
