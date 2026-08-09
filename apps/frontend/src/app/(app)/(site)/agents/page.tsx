import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: `${productNameServerSide()} - Agent`,
  description: '',
};

export default async function Page() {
  return redirect('/agents/new');
}
