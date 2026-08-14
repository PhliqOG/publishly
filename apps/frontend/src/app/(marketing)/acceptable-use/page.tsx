import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = {
  title: 'Acceptable Use',
  alternates: { canonical: '/acceptable-use' },
};

export default function AcceptableUsePage() {
  return (
    <>
      <MarketingNav />
      <main id="mk-main">
        <section className="mk-section">
          <div className="mk-container">
            <header style={{ marginBottom: 36 }}>
              <span
                className="mk-eyebrow"
                style={{ display: 'block', marginBottom: 20 }}
              >
                Legal / Acceptable use
              </span>
              <h1 className="mk-h2">Acceptable Use Policy</h1>
            </header>
            <div className="mk-prose">
              <p>
                Use Publishly only for accounts you are authorized to manage and
                in compliance with each destination platform’s terms and
                applicable law.
              </p>
              <p>
                This policy is effective {MARKETING.legal.effectiveDate} and
                applies to services operated by {MARKETING.legal.entity},
                {` ${MARKETING.legal.address}`}.
              </p>
              <h2>Not permitted</h2>
              <ul>
                <li>
                  Spam, deceptive engagement, impersonation, or coordinated
                  abuse.
                </li>
                <li>
                  Harassment, exploitation, illegal content, or rights
                  infringement.
                </li>
                <li>
                  Credential theft, security bypasses, scraping, or private-API
                  automation.
                </li>
                <li>
                  Malware, phishing, service disruption, or attempts to cross
                  tenant boundaries.
                </li>
                <li>
                  Reselling access in a way that bypasses plan limits or
                  platform approvals.
                </li>
              </ul>
              <h2>Enforcement</h2>
              <p>
                {MARKETING.legal.entity} may restrict publishing, suspend
                access, preserve legally required evidence, and cooperate with
                valid legal process. Where safe and lawful, users should receive
                notice and an opportunity to appeal. Report suspected abuse to{' '}
                <a href={`mailto:${MARKETING.supportEmail}`}>
                  {MARKETING.supportEmail}
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
