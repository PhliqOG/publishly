// Every marketing-facing string and brand value in one file, so a rename or
// repositioning never requires touching components.
//
// HONESTY FLOOR: no fabricated customers, testimonials, stats, logos, or
// certifications — ever. Feature claims must map to data/public-product-facts.json
// (status shipping or pre_release); in_development AI items are described as
// direction, never as shipped UI.
// COMPLIANCE: multi-account language is always multi-brand / multi-client /
// multi-location / multi-market. Never "autopilot accounts", never bot/farm/mass
// framing — platform app reviewers read marketing copy.

export const MARKETING = {
  brand: process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly',
  // The one canonical entity sentence — used verbatim on home, about and docs
  // so answer engines build a consistent entity. Edit here, nowhere else.
  entity:
    'Publishly is a social publishing API and scheduler that gives every post a delivery receipt, a failure reason, and an automatic retry — built for teams running many brands, clients, and locations.',
  tagline: 'Nothing fails silently.',
  sub: 'You can’t watch 200 accounts. Publishly does — every post gets a delivery receipt, every failure gets a reason and a retry, and your plan price doesn’t grow with your account count.',
  cta: { primary: 'Get started free', secondary: 'See how it works' },
  authRegister: '/auth',
  authLogin: '/auth/login',
  sourceUrl: process.env.NEXT_PUBLIC_SOURCE_URL || '/source',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '',
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
      body: 'Access tokens on the major platforms expire in roughly 60 days. One quiet expiry and an account slips into a reconnect loop while its queue keeps “posting” into nothing.',
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
      body: 'Each destination runs as its own tracked delivery with a full state history — and a successful post stores the live URL to prove it. A post to 6 networks is 6 receipts.',
    },
    {
      title: 'Every failure gets a reason — and a webhook',
      body: 'Failed posts carry a plain-English reason and a failure code classed as recoverable, needs-your-action, or a content problem. The same moment, a signed post.failure webhook tells your systems.',
    },
    {
      title: 'Retries that never double-post',
      body: 'Transient failures retry automatically with backoff. The publish call itself fires exactly once — a retry can never duplicate a post. Missed slots are swept back into the queue hourly.',
    },
    {
      title: 'Dead accounts get caught, not discovered',
      body: 'When a token can’t refresh, the account is flagged and pulled out of delivery, and you’re alerted immediately — one dead connection never breaks the rest of the calendar.',
    },
    {
      title: 'Flat pricing, unlimited accounts',
      body: 'Plans are sized by how much you post, not how many accounts you run. From 5 accounts to 500 — same API, same flat price.',
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
      title: 'Every connection through the platform’s own front door',
      body: 'Nine of the ten featured networks connect through their official OAuth flows & permission scopes. Bluesky offers no third-party OAuth, so it uses an app password you generate & revoke in Bluesky itself — never your account password. No browser automation anywhere.',
    },
    {
      title: 'API keys you scope & revoke',
      body: 'Programmatic access uses hashed, scope-limited keys you can revoke at any time. Keys are shown once & never stored in recoverable form.',
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
    watch: 'You can’t watch 200 accounts. Publishly does.',
    receipt: 'Every post gets a delivery receipt. Every failure gets a webhook.',
    token: 'Know a token’s dying before your post does.',
    tax: 'Stop paying a tax on your own growth.',
    alert: 'The post failed. You already got the alert — and the retry is already scheduled.',
    punish: 'Per-profile pricing is a punishment for winning. We don’t do that.',
    calendar: 'One dead account shouldn’t break your whole content calendar.',
    fleet: 'Built for the person running 50 brands, not one.',
    client: 'Find the broken connection before your client does.',
    same: 'From 5 accounts to 500 — same API, same flat price.',
  },

  openSource: {
    line: 'Built on the open-source Postiz engine (AGPL-3.0). The corresponding source of the running service is available to every user.',
    linkLabel: 'Get the source',
  },

  footerNote:
    'No growth hacks, no engagement bots, no fake metrics — publishing treated like infrastructure, with receipts.',
} as const;
