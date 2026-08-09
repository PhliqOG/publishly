import { LifetimeDeal } from '@gitroom/frontend/components/billing/lifetime.deal';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${productNameServerSide()} Lifetime deal`,
  description: '',
};
export default async function Page() {
  return <LifetimeDeal />;
}
