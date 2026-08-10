import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';

export const metadata: Metadata = { title: 'Agencies' };

export default function AgenciesPage() {
  return (
    <ProductMarketingPage
      eyebrow="Agencies"
      title="Client calendars without client data bleed."
      lede="Use separate workspaces and memberships so each client’s connections, media, keys, posts, and analytics stay isolated."
      items={[
        { title: 'Workspace boundaries', body: 'Every private query and mutation carries an organization constraint, backed by tenant-isolation tests.' },
        { title: 'Team access', body: 'Invite owners, admins, and members without exposing provider tokens in the interface.' },
        { title: 'Operator visibility', body: 'Audit logs, provider health, queue health, and publishing failures remain available to internal operators.' },
      ]}
    />
  );
}
