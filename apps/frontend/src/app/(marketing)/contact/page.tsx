import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingFooter, MarketingNav } from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <>
      <MarketingNav />
      <main className="mk-prose">
        <h1>Contact</h1>
        <p>
          Questions about onboarding, platform permissions, security, privacy,
          billing, or an account export are handled by the operator support
          address configured for this deployment.
        </p>
        {MARKETING.supportEmail ? (
          <p>
            <a className="mk-btn mk-btn-primary" href={`mailto:${MARKETING.supportEmail}`}>
              Email {MARKETING.supportEmail}
            </a>
          </p>
        ) : (
          <p className="mk-draft">
            Operator action required: set NEXT_PUBLIC_SUPPORT_EMAIL before
            launch so this page exposes a working support channel.
          </p>
        )}
        <h2>Security reports</h2>
        <p>
          Include a concise reproduction and avoid placing access tokens or
          customer data in email. See the <Link href="/security">security page</Link>.
        </p>
      </main>
      <MarketingFooter />
    </>
  );
}
