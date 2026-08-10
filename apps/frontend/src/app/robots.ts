import type { MetadataRoute } from 'next';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

// Crawler policy for Publishly's marketing site. Rationale, per-agent
// reasoning and the deploy-day verification checklist live in
// docs/seo/crawler-policy.md — read that before changing this file.
//
// Rule: allow every marketing/docs route for every crawler, including the
// AI answer-engine and training crawlers listed below (a deliberate content-
// use decision, not a ranking lever). Disallow only the private, signed-in
// app surface — nothing there is meant to be indexed anyway.
export default function robots(): MetadataRoute.Robots {
  const siteUrl = MARKETING.siteUrl.replace(/\/$/, '');
  const disallow = ['/auth', '/api/', '/settings', '/launches', '/analytics'];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      // AI answer-engine + training crawlers — explicitly named so intent is
      // never ambiguous. See docs/seo/crawler-policy.md for what each one is
      // and does (search discovery vs. model training vs. dataset ingestion).
      { userAgent: 'OAI-SearchBot', allow: '/', disallow },
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'ClaudeBot', allow: '/', disallow },
      { userAgent: 'CCBot', allow: '/', disallow },
      { userAgent: 'Google-Extended', allow: '/', disallow },
      { userAgent: 'Googlebot', allow: '/', disallow },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
