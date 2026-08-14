import { advertisedBulkSchedulerTuples } from '@gitroom/helpers/bulk-scheduler/capability.matrix';

// Every marketing-facing string and brand value in one file, so a rename or
// repositioning never requires touching components.
//
// HONESTY FLOOR: no fabricated customers, testimonials, stats, logos, or
// certifications — ever. Feature claims must map to data/public-product-facts.json
// (status shipping or pre_release); in_development AI items are described as
// direction, never as shipped UI.
// COMPLIANCE: multi-account language is always multi-brand / multi-client /
// multi-location / multi-market. Keep all scale language tied to legitimate
// brands, clients, locations, and markets.
// framing — platform app reviewers read marketing copy.

export const MARKETING = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly',
  // The one canonical entity sentence — used verbatim on home, about and docs
  // so answer engines build a consistent entity. Edit here, nowhere else.
  entity:
    'Publishly is the reliability layer for social posting at scale: every post gets proof, every failure gets a reason and a safe retry, and every paid plan includes unlimited accounts.',
  tagline: 'Nothing fails silently. Ever.',
  sub: 'Know what went live, what failed, why it failed, and what Publishly did next — across every brand, client, location, and market you manage.',
  cta: { primary: 'Get started free', secondary: 'See how it works' },
  authRegister: '/auth',
  authLogin: '/auth/login',
  sourceUrl: process.env.NEXT_PUBLIC_SOURCE_URL || '/source',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
  legal: {
    entity:
      process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME ||
      'Publishly operator (local configuration)',
    address:
      process.env.NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS ||
      'Configure NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS before deployment',
    privacyEmail:
      process.env.NEXT_PUBLIC_PRIVACY_EMAIL ||
      process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
      '',
    effectiveDate:
      process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || '2026-08-11',
    governingLaw:
      process.env.NEXT_PUBLIC_GOVERNING_LAW ||
      'the jurisdiction configured by the service operator',
  },
  // Server-rendered JSON-LD / sitemap origin. MAIN_URL is server-only, so client
  // bundles fall back to the public var (or localhost in dev) — harmless, since
  // every consumer of this value renders on the server.
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.MAIN_URL ||
    'http://localhost:4200',
  byline: 'Liam, founder of Publishly',

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

  // Bulk Scheduler claims are derived from the fail-closed tuple matrix. An
  // uncertified or killed tuple never appears here or in generated docs.
  bulkSchedulerTuples: advertisedBulkSchedulerTuples().map((tuple) => ({
    id: tuple.id,
    provider: tuple.providerDisplayName,
    accountType: tuple.accountType,
    postType: tuple.postType,
    mediaKind: tuple.mediaKind,
  })),

  // The pain narrative, in its canonical order. Every page that tells the
  // story tells it this way: silent failures → token death → no reasons →
  // the growth tax.
  pains: [
    {
      title: 'Schedulers fail silently',
      body: 'Most tools mark a post “scheduled” and move on. When it never lands, an agency finds out from the client — days later, mid-report.',
    },
    {
      title: 'Tokens die on a timer',
      body: 'Platform connections do not last forever. Some common access tokens last about 60 days; others renew more often. When that renewal breaks quietly, scheduled posts can stop with it.',
    },
    {
      title: 'Failures come with no reason',
      body: 'A red icon with no explanation isn’t status — it’s homework. You need the reason, whether it’s retryable, and what happens next.',
    },
    {
      title: 'Per-profile pricing punishes growth',
      body: 'At 100 profiles the per-profile tools bill four figures a month. Winning more clients shouldn’t raise your software bill faster than your revenue.',
    },
  ],

  // Publishly's answer — each row maps to a fact in public-product-facts.json.
  answers: [
    {
      title: 'Every post gets a delivery receipt',
      body: 'A post is only marked successful after Publishly confirms it is live. The receipt stores the result and the live link, separately for every account you chose.',
    },
    {
      title: 'Every failure gets a reason and an alert',
      body: 'You see what happened, what needs fixing, and whether Publishly will try again. Developers can send the same alert straight into their own software through a signed webhook.',
    },
    {
      title: 'Retries that never double-post',
      body: 'Short platform problems are retried safely. If Publishly cannot prove what happened, it stops and asks you to check instead of risking the same post appearing twice.',
    },
    {
      title: 'Expiring and disconnected accounts are caught early',
      body: 'Warnings start before a known connection expiry. If a connection dies, Publishly flags it, stops sending posts to that account, and keeps the rest of your calendar moving.',
    },
    {
      title: 'Flat pricing, unlimited accounts',
      body: 'Plans are sized by how much you post, not how many brand, client, or location accounts you manage. From 5 to 500 — same API, same flat price.',
    },
  ],

  composer: [
    {
      title: 'One draft, tailored to every network',
      body: 'Write the core message once, then tailor captions, tags & first comments per network — with live previews & each platform’s real limits enforced before you hit schedule.',
    },
    {
      title: 'A week planned in one sitting',
      body: 'Month, week, and day views with drag-and-drop rescheduling. Move a post and its real schedule updates with it.',
    },
    {
      title: 'CSV imports that explain every rejection',
      body: 'Import a CSV of scheduled posts with a full validation preview — every rejected row tells you why before anything is committed.',
    },
  ],

  security: [
    {
      title: 'Tokens encrypted before they’re stored',
      body: 'Your social account credentials are locked with industry-standard authenticated encryption before they are stored.',
    },
    {
      title: 'Every connection through the platform’s own front door',
      body: 'Nine of the ten featured networks use the platform’s official connect and permission screens. Bluesky uses a separate app password you create and revoke inside Bluesky — never your account password. Publishly does not automate a browser login.',
    },
    {
      title: 'API keys you can limit and revoke',
      body: 'Give each key only the access it needs and revoke it at any time. A full key is shown once and is never stored in a form Publishly can reveal later.',
    },
    {
      title: 'An audit trail that answers questions',
      body: 'Team invitations, channel changes, key management & bulk operations are recorded per workspace — who, what, when, from where.',
    },
    {
      title: 'Client isolation by design',
      body: 'Workspaces keep every brand’s accounts, tokens, media & history separate — a client’s data leaves with them, cleanly.',
    },
  ],

  // The learning loop — product direction (in development). Pages present
  // these as where Publishly is going, with diagrams, never fake screenshots.
  learning: [
    {
      title: 'Caption Memory',
      body: 'Every caption is joined to its measured results, per brand. New captions are written against what this audience actually rewarded — hooks, length, timing — not generic viral tips.',
    },
    {
      title: 'Brand Folders',
      body: 'Each brand gets a guided knowledge base — voice, banned words, product facts, audience, past winners. Fifty brands stay fifty distinct voices, never one blended mush.',
    },
    {
      title: 'Video Understanding',
      body: 'Publishly samples the frames & reads the transcript, so the caption is about the moment at 0:07 — in the brand’s voice, tailored per network.',
    },
    {
      title: 'A schedule that tunes itself',
      body: 'Slots drift toward the hours your audience measurably rewards — bounded, explainable & always under your control.',
    },
  ],

  // Direct operator-to-operator lines, used as section leads & fact blocks.
  copyBank: {
    silent: 'Nothing fails silently. Ever.',
    watch: 'You can’t watch 200 client and brand accounts. Publishly does.',
    receipt:
      'Every post gets a delivery receipt. Every failure gets a webhook.',
    token: 'Know a token’s dying before your post does.',
    tax: 'Stop paying a tax on your own growth.',
    alert:
      'The post failed. You already got the alert — and the retry is already scheduled.',
    punish:
      'Per-profile pricing is a punishment for winning. We don’t do that.',
    calendar: 'One dead account shouldn’t break your whole content calendar.',
    scale: 'Built for the person running 50 brands, not one.',
    client: 'Find the broken connection before your client does.',
    same: 'From 5 brand or client accounts to 500 — same API, same flat price.',
  },

  openSource: {
    line: 'Built on the open-source Postiz engine (AGPL-3.0). The corresponding source of the running service is available to every user.',
    linkLabel: 'Get the source',
  },

  footerNote:
    'Proof for every post. A reason for every failure. No fake reliability claims.',
} as const;
