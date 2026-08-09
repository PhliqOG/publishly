import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { Agent } from '@gitroom/frontend/components/agents/agent';
export const metadata: Metadata = {
  title: `${productNameServerSide()} - Agent`,
  description: 'agents',
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Agent>{children}</Agent>;
}
