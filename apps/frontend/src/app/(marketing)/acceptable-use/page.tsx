import type { Metadata } from 'next';
import { MarketingFooter, MarketingNav } from '@gitroom/frontend/components/marketing/chrome';

export const metadata: Metadata = { title: 'Acceptable Use' };

export default function AcceptableUsePage() {
  return (
    <>
      <MarketingNav />
      <main className="mk-prose">
        <h1>Acceptable Use Policy</h1>
        <p className="mk-draft">
          Draft template—have counsel confirm the operator identity,
          jurisdiction, notice process, and enforcement terms before launch.
        </p>
        <p>
          Use Publishly only for accounts you are authorized to manage and in
          compliance with each destination platform’s terms and applicable law.
        </p>
        <h2>Not permitted</h2>
        <ul>
          <li>Spam, deceptive engagement, impersonation, or coordinated abuse.</li>
          <li>Harassment, exploitation, illegal content, or rights infringement.</li>
          <li>Credential theft, security bypasses, scraping, or private-API automation.</li>
          <li>Malware, phishing, service disruption, or attempts to cross tenant boundaries.</li>
          <li>Reselling access in a way that bypasses plan limits or platform approvals.</li>
        </ul>
        <h2>Enforcement</h2>
        <p>
          The operator may restrict publishing, suspend access, preserve legally
          required evidence, and cooperate with valid legal process. Where safe
          and lawful, users should receive notice and an opportunity to appeal.
        </p>
      </main>
      <MarketingFooter />
    </>
  );
}
