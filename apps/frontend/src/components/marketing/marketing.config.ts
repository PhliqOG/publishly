// Every marketing-facing string and brand value in one file, so a rename or
// repositioning never requires touching components. No fabricated claims:
// nothing here may reference customer counts, testimonials, or partner logos
// until they are real.

export const MARKETING = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly',
  tagline: 'Every post leaves on time.',
  sub: 'Plan a week of content in one sitting. Publishly tailors each caption to its network & a durable pipeline delivers it — 10 networks, one calendar, official APIs only.',
  cta: { primary: 'Get started free', secondary: 'See how it works' },
  authRegister: '/auth',
  authLogin: '/auth/login',
  sourceUrl: process.env.NEXT_PUBLIC_SOURCE_URL || '/source',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',

  networks: [
    'Instagram',
    'Facebook',
    'TikTok',
    'YouTube',
    'X',
    'Threads',
    'LinkedIn',
    'Pinterest',
    'Bluesky',
    'Mastodon',
  ],

  reliability: [
    {
      title: 'Retries that converge, not repeat',
      body: 'Every destination runs as a durable workflow with a deterministic identity. Provider-aware status checks & conservative retry rules reduce duplicate risk — even in ambiguous timeout cases.',
    },
    {
      title: 'One failure never sinks the rest',
      body: 'A post to 6 networks is 6 deliveries — if one fails, the other 5 stay published & only the failed one retries. The calendar shows exactly what happened, per network.',
    },
    {
      title: 'Missed slots recover on their own',
      body: 'A sweeper re-checks the schedule every hour & re-queues anything that missed its slot — after downtime, an API outage, or a token refresh. Missed doesn’t mean lost.',
    },
  ],

  composer: [
    {
      title: 'One draft, tailored to every network',
      body: 'Write the core message once, then tailor captions, tags & first comments per network — with live previews & each platform’s real limits enforced before you hit schedule.',
    },
    {
      title: 'A week planned in one sitting',
      body: 'Month, week & day views with drag-and-drop rescheduling. Move a slot & the pipeline moves with it.',
    },
    {
      title: 'CSV imports that explain every rejection',
      body: 'Import a CSV of scheduled posts with a full validation preview — every rejected row tells you why before anything is committed.',
    },
  ],

  security: [
    {
      title: 'Tokens encrypted before they’re stored',
      body: 'Your social account credentials are sealed with authenticated AES-256-GCM encryption before they touch the database.',
    },
    {
      title: 'Every connection through official OAuth',
      body: 'Connections use each platform’s official OAuth flows & permission scopes. No password sharing, no fragile browser automation.',
    },
    {
      title: 'API keys you scope & revoke',
      body: 'Programmatic access uses hashed, scope-limited keys you can revoke at any time. Keys are shown once & never stored in recoverable form.',
    },
    {
      title: 'An audit trail that answers questions',
      body: 'Team invitations, channel changes, key management & bulk operations are recorded per workspace — who, what, when, from where.',
    },
  ],

  openSource: {
    line: 'Built on the open-source Postiz engine (AGPL-3.0). The corresponding source of the running service is available to every user.',
    linkLabel: 'Get the source',
  },

  footerNote:
    'No growth hacks, no engagement bots, no fake metrics — a scheduler that treats publishing like infrastructure.',
} as const;
