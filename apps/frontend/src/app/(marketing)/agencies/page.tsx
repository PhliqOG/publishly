import type { Metadata } from 'next';
import { ProductMarketingPage } from '@gitroom/frontend/components/marketing/product-page';

export const metadata: Metadata = { title: 'Agencies' };

export default function AgenciesPage() {
  return (
    <ProductMarketingPage
      eyebrow="Agencies"
      title="Client calendars without client data bleed."
      lede="Run each client in a separate workspace with its own memberships, so connections, media, keys, posts & analytics stay isolated by construction."
      capabilitiesHeading="Boundaries you can hand to a client."
      statement="One client per workspace: connections, media, keys, posts & analytics stay inside the boundary — enforced in the queries, not just the interface."
      items={[
        {
          title: 'Isolation enforced in every query',
          body: 'Every private query & mutation carries an organization constraint, backed by tenant-isolation tests.',
        },
        {
          title: 'Client teams, without exposed tokens',
          body: 'Invite owners, admins & members per workspace — provider tokens never appear in the interface.',
        },
        {
          title: 'See failures before clients do',
          body: 'Audit logs, provider health, queue health & publishing failures stay visible to internal operators.',
        },
      ]}
    />
  );
}
