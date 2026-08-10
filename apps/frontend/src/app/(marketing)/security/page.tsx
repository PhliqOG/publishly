import type { Metadata } from 'next';
import Link from 'next/link';
import { CSSProperties } from 'react';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Security',
  description:
    'How your social credentials are stored, used & destroyed — stated plainly, with the source available to check.',
};

// The calm chapter: definition lists & measured type, no cards, no urgency.

const DT: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--mk-font-display), sans-serif',
  fontWeight: 650,
  fontSize: 17,
  letterSpacing: '-0.015em',
  color: 'var(--mk-text)',
  lineHeight: 1.3,
};

const DD: CSSProperties = {
  margin: 0,
  color: 'var(--mk-text-2)',
  fontSize: 15,
  lineHeight: 1.6,
};

const BOUNDARIES = [
  {
    h: 'One workspace never sees another',
    p: 'Every workspace’s data is scoped at the query layer & covered by automated cross-tenant access tests that run against the real API.',
  },
  {
    h: 'Roles decide, the audit log records',
    p: 'Channels, media, keys & analytics live inside a workspace. Roles & invitations decide who can act; the audit log records who did.',
  },
  {
    h: 'Deletion is destruction',
    p: 'Disconnect a channel & its tokens are destroyed immediately. You can export your workspace at any time.',
  },
];

const STATEMENT =
  'Security here is mostly subtraction — fewer copies of each credential, narrower scopes on every key & a written record of everything that touched them.';

export default function SecurityPage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <header style={{ padding: '96px 0 8px' }}>
          <div className="mk-container">
            <div className="mk-reveal">
              <span className="mk-eyebrow" style={{ display: 'block' }}>
                Security
              </span>
              <h1
                className="mk-h2-lg"
                style={{ marginTop: 18, maxWidth: '13ch' }}
              >
                How your keys are held.
              </h1>
              <p className="mk-section-lede">
                A scheduler holds credentials to your audience. This page
                states plainly how they&rsquo;re stored, how they&rsquo;re
                used & how they&rsquo;re destroyed.
              </p>
            </div>
          </div>
        </header>

        <section className="mk-section" aria-labelledby="sec-commitments">
          <div className="mk-container">
            <div style={{ maxWidth: '58ch' }}>
              <h2 id="sec-commitments" className="mk-h2">
                4 commitments.
              </h2>
              <p className="mk-section-lede">
                Not aspirations — descriptions of how the system works today.
              </p>
            </div>
            <dl
              className="mk-rows mk-reveal"
              style={{ margin: '44px 0 0' }}
            >
              {MARKETING.security.map((item) => (
                <div className="mk-row" key={item.title}>
                  <dt style={DT}>{item.title}</dt>
                  <dd style={DD}>{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mk-quiet" style={{ textAlign: 'left' }}>
          <div className="mk-container">
            <p className="mk-statement">
              {STATEMENT.split(' ').map((w, i) => (
                <span className="mk-w" key={i}>
                  {w}{' '}
                </span>
              ))}
            </p>
          </div>
        </section>

        <section className="mk-section" aria-labelledby="sec-boundaries">
          <div className="mk-container">
            <div className="mk-split">
              <div>
                <h2 id="sec-boundaries" className="mk-h2">
                  Where the walls are.
                </h2>
                <p className="mk-section-lede">
                  Isolation is structural — the boundaries live in the
                  queries & the tests, not in a policy document.
                </p>
              </div>
              <dl className="mk-rows" style={{ margin: 0 }}>
                {BOUNDARIES.map((item) => (
                  <div className="mk-row" key={item.h}>
                    <dt style={DT}>{item.h}</dt>
                    <dd style={DD}>{item.p}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section
          className="mk-section"
          style={{ paddingTop: 24 }}
          aria-labelledby="sec-disclosure"
        >
          <div className="mk-container">
            <div style={{ maxWidth: '58ch' }}>
              <h2 id="sec-disclosure" className="mk-h2">
                Found a vulnerability?
              </h2>
              <p className="mk-section-lede">
                Write to us before disclosing publicly
                {MARKETING.supportEmail
                  ? `: ${MARKETING.supportEmail}`
                  : ' — see the contact page'}
                . We read every report.
              </p>
            </div>
            <div style={{ maxWidth: '58ch', marginTop: 72 }}>
              <h2 className="mk-h2">Read the code.</h2>
              <p className="mk-section-lede">{MARKETING.openSource.line}</p>
              <p style={{ margin: '20px 0 0' }}>
                <Link href="/source" className="mk-arrow">
                  {MARKETING.openSource.linkLabel}
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section style={{ padding: '8px 0 104px' }}>
          <div className="mk-container">
            <div
              style={{
                borderTop: '1px solid var(--mk-line)',
                paddingTop: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24,
                flexWrap: 'wrap',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: 'var(--mk-text-2)',
                  fontSize: 16,
                }}
              >
                Read it, then start.
              </p>
              <Link
                href={MARKETING.authRegister}
                className="mk-btn mk-btn-primary"
              >
                {MARKETING.cta.primary}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
