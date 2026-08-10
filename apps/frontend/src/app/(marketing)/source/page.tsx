import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Source code' };

export default function SourcePage() {
  const external =
    MARKETING.sourceUrl && MARKETING.sourceUrl.startsWith('http');
  return (
    <>
      <MarketingNav />
      <main>
        <section className="mk-section">
          <div className="mk-container">
            <header style={{ marginBottom: 36 }}>
              <span
                className="mk-eyebrow"
                style={{ display: 'block', marginBottom: 20 }}
              >
                Open source / AGPL-3.0 §13
              </span>
              <h1 className="mk-h2">Corresponding source</h1>
            </header>
            <div className="mk-prose">
              <p>
                {MARKETING.brand} is built on the open-source{' '}
                <a href="https://github.com/gitroomhq/postiz-app">Postiz</a>{' '}
                engine and is licensed under the GNU Affero General Public
                License v3.0 (AGPL-3.0). Under section 13 of that license,
                everyone who uses this service over the network is entitled to
                receive the complete corresponding source of the version that
                is running.
              </p>
              {external ? (
                <p>
                  The source of the currently deployed revision is available
                  here: <a href={MARKETING.sourceUrl}>{MARKETING.sourceUrl}</a>.
                </p>
              ) : (
                <p>
                  To receive the complete corresponding source of the deployed
                  revision at no charge, contact the operator
                  {MARKETING.supportEmail
                    ? ` at ${MARKETING.supportEmail}`
                    : ''}{' '}
                  and it will be provided as a source archive. (Operators: set
                  NEXT_PUBLIC_SOURCE_URL to link a public mirror directly.)
                </p>
              )}
              <h2>License</h2>
              <p>
                The full license text ships with the source tree (LICENSE),
                together with a compliance guide (LICENSE-COMPLIANCE.md)
                describing exactly which obligations apply to operators of this
                software.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
