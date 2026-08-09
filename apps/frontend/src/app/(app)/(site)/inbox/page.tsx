export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { InboxComponent } from '@gitroom/frontend/components/inbox/inbox.component';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';
export const metadata: Metadata = {
  title: `${productNameServerSide()} Inbox`,
  description: '',
};
export default async function Index() {
  return <InboxComponent />;
}
