import type { Metadata } from 'next';
import {
  MarketingFooter,
  MarketingNav,
} from '@gitroom/frontend/components/marketing/chrome';
import { MARKETING } from '@gitroom/frontend/components/marketing/marketing.config';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
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
                Legal / Privacy
              </span>
              <h1 className="mk-h2">Privacy Policy</h1>
            </header>
            <div className="mk-prose">
              <p className="mk-draft">
                Draft template — the operator must have counsel review and
                complete this document (controller identity, jurisdiction, DPA
                terms) before public launch.
              </p>
              <h2>What we store</h2>
              <ul>
                <li>Account data: email, name, workspace membership.</li>
                <li>
                  Content you create: drafts, scheduled posts, media you
                  upload.
                </li>
                <li>
                  Connection tokens for the social accounts you authorize —
                  encrypted at rest, used only to publish and read what you
                  asked for.
                </li>
                <li>
                  Metrics the connected platforms report about your own
                  accounts.
                </li>
                <li>
                  An audit log of security-relevant actions in your workspace.
                </li>
              </ul>
              <h2>What we do not do</h2>
              <ul>
                <li>No selling of personal data.</li>
                <li>
                  No reading of your social inboxes beyond what you connect.
                </li>
                <li>No posting without a schedule you created.</li>
              </ul>
              <h2>Deletion and export</h2>
              <p>
                Disconnecting a channel deletes its stored tokens. Deleting
                your workspace removes your content and connections;
                platform-side posts remain on the platforms, where you control
                them. Contact support
                {MARKETING.supportEmail ? ` (${MARKETING.supportEmail})` : ''}{' '}
                for a data export or full account erasure.
              </p>
              <h2>Meta platforms note</h2>
              <p>
                For accounts connected through Meta (Facebook, Instagram,
                Threads), you can also trigger removal by de-authorizing the
                app in your Meta settings; instructions for requesting deletion
                of data we hold are on this page.
              </p>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
