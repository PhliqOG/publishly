import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';

export const metadata: Metadata = { title: 'API' };

export default function ApiMarketingPage() {
  return (
    <ProductMarketingPage
      eyebrow="API"
      title="Automate the schedule without widening access."
      lede="Issue workspace-owned keys, reveal them once, and grant only the scopes each integration needs."
      items={[
        { title: 'Hashed keys', body: 'Raw API keys are never recoverable from the database and can be revoked independently.' },
        { title: 'Narrow scopes', body: 'Separate read and write access for posts, integrations, media, and notifications.' },
        { title: 'Operational limits', body: 'Server-side rate limiting and last-used timestamps make customer automation observable.' },
      ]}
    />
  );
}
