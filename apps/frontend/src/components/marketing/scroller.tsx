import { CSSProperties, Fragment } from 'react';

// The platform cloud — Stripe's customer-logo carousel slot, filled with
// every posting target the engine genuinely supports (top networks first,
// then engine-inherited targets). Wordmark text + brand dot; nominative use.
// Track duplicated for the seamless -50% loop; duplicate is aria-hidden;
// static wrap under reduced motion.

const PLATFORMS: Array<[string, string?]> = [
  ['TikTok', 'var(--net-tiktok)'],
  ['Instagram', 'var(--net-instagram)'],
  ['Facebook', 'var(--net-facebook)'],
  ['LinkedIn', 'var(--net-linkedin)'],
  ['YouTube', 'var(--net-youtube)'],
  ['X', 'var(--net-x)'],
  ['Threads', 'var(--net-threads)'],
  ['Pinterest', 'var(--net-pinterest)'],
  ['Bluesky', 'var(--net-bluesky)'],
  ['Mastodon', 'var(--net-mastodon)'],
  ['Reddit', '#ff4500'],
  ['Discord', '#5865f2'],
  ['Slack', '#611f69'],
  ['Telegram', '#2aabee'],
  ['Medium', undefined],
  ['Dev.to', undefined],
  ['Hashnode', '#2962ff'],
  ['WordPress', '#21759b'],
  ['Tumblr', '#001935'],
  ['Farcaster', '#8a63d2'],
  ['Lemmy', undefined],
  ['Twitch', '#9146ff'],
  ['Kick', '#53fc18'],
  ['Dribbble', '#ea4c89'],
  ['Google Business', '#4285f4'],
  ['VK', '#0077ff'],
  ['Nostr', '#8e30eb'],
  ['MeWe', undefined],
];

export const PlatformScroller = () => (
  <section className="mk-scroller" aria-label="Supported publishing targets">
    <p className="mk-scroller-note">
      Every channel below publishes through its official API
    </p>
    <div className="mk-scroller-track">
      {[0, 1].map((dup) => (
        <Fragment key={dup}>
          {PLATFORMS.map(([name, color]) => (
            <span
              key={`${dup}-${name}`}
              aria-hidden={dup === 1}
              className="mk-scroller-item"
              style={color ? ({ '--net': color } as CSSProperties) : undefined}
            >
              <i />
              {name}
            </span>
          ))}
        </Fragment>
      ))}
    </div>
  </section>
);
