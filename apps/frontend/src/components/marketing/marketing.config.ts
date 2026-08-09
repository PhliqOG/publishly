// Every marketing-facing string and brand value in one file, so a rename or
// repositioning never requires touching components. No fabricated claims:
// nothing here may reference customer counts, testimonials, or partner logos
// until they are real.

export const MARKETING = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly',
  tagline: 'Every post leaves on time.',
  sub: 'Plan a week of content across ten networks in one sitting. Write once, tailor each caption, and let a workflow engine built for exactly-once delivery handle the publishing.',
  cta: { primary: 'Start free', secondary: 'See how it runs' },
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
      title: 'Exactly-once publishing',
      body: 'Every scheduled post runs as a durable workflow with a deterministic identity. A crash, restart, or retry can never publish the same post twice - the pipeline is built so the dangerous step is simply not repeatable.',
    },
    {
      title: 'Partial success, honest status',
      body: 'A post going to six networks is six deliveries. If one network fails, the other five stay published and only the failed one retries. The calendar shows exactly what happened, per network.',
    },
    {
      title: 'Recovery built in',
      body: 'A sweeper re-checks the schedule every hour and re-queues anything that missed its slot - after downtime, an API outage, or a token refresh. Missed does not mean lost.',
    },
  ],

  composer: [
    {
      title: 'One draft, every voice',
      body: 'Write the core message once, then tailor captions, tags, and first comments per network - with live previews and each platform’s real limits enforced before you hit schedule.',
    },
    {
      title: 'The week at a glance',
      body: 'Month, week, and day views with drag-and-drop rescheduling. Move a slot, and the pipeline moves with it.',
    },
    {
      title: 'Bulk, when you need it',
      body: 'Import a CSV of scheduled posts with a full validation preview - every rejected row tells you why before anything is committed.',
    },
  ],

  security: [
    {
      title: 'Tokens encrypted at rest',
      body: 'Social account credentials are sealed with authenticated AES-256-GCM encryption before they touch the database.',
    },
    {
      title: 'Official APIs only',
      body: 'Connections use each platform’s official OAuth flows and permission scopes. No password sharing, no fragile browser automation.',
    },
    {
      title: 'Scoped API keys',
      body: 'Programmatic access uses hashed, scope-limited keys you can revoke at any time. Keys are shown once and never stored in recoverable form.',
    },
    {
      title: 'An audit trail that answers questions',
      body: 'Team invitations, channel changes, key management, and bulk operations are recorded per workspace - who, what, when, from where.',
    },
  ],

  openSource: {
    line: 'Built on the open-source Postiz engine (AGPL-3.0). The corresponding source of the running service is available to every user.',
    linkLabel: 'Get the source',
  },

  footerNote:
    'No growth hacks, no engagement bots, no fake metrics - a scheduler that treats publishing like infrastructure.',
} as const;
