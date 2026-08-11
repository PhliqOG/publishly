export const dynamic = 'force-dynamic';
import { AdminOperationsComponent } from '@gitroom/frontend/components/admin/admin-operations.component';
import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${productNameServerSide()} Operations`,
  description: 'Publishly operator health and usage dashboard',
};

export default function Page() {
  return (
    <div className="bg-newBgColorInner flex-1 min-w-0 flex-col flex p-[20px] gap-[12px] overflow-y-auto">
      <AdminOperationsComponent />
    </div>
  );
}
