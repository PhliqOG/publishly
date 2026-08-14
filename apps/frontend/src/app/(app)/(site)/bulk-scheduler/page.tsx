export const dynamic = 'force-dynamic';

import { Metadata } from 'next';
import { BulkSchedulerComponent } from '@gitroom/frontend/components/bulk-scheduler/bulk-scheduler.component';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${productNameServerSide()} Bulk Scheduler`,
  description: 'Native multi-video campaign scheduling with durable file and delivery outcomes.',
};

export default function BulkSchedulerPage() {
  return <BulkSchedulerComponent />;
}
