import type { Metadata } from 'next';
import { MarketingFooter, MarketingNav } from '@gitroom/frontend/components/marketing/chrome';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <>
      <MarketingNav />
      <main className="mk-prose">
        <h1>About Publishly</h1>
        <p>
          Publishly is social-publishing infrastructure for teams that want a
          clear calendar, provider-aware controls, and recoverable background
          jobs instead of a browser tab that must stay open.
        </p>
        <h2>Built in the open</h2>
        <p>
          The product is based on Postiz and distributed under AGPL-3.0. The
          corresponding source for the running service is offered to its users.
          Publishly is an independent brand and does not imply endorsement by
          Postiz or any connected social network.
        </p>
        <h2>How claims are made</h2>
        <p>
          No fabricated customer totals, reviews, partnerships, or unavailable
          metrics. Provider features are exposed only when an implemented
          official API adapter supports them.
        </p>
      </main>
      <MarketingFooter />
    </>
  );
}
