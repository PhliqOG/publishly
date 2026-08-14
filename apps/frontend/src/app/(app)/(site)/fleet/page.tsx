export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { FleetHealthComponent } from '@gitroom/frontend/components/fleet-health/fleet-health.component';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${productNameServerSide()} Fleet Health`,
  description: 'Connection health and confirmed posting reliability.',
};

export default function FleetHealthPage() {
  return <FleetHealthComponent />;
}
