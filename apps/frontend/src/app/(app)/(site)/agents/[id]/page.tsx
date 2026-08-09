import { Metadata } from 'next';
import { productNameServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import { Agent } from '@gitroom/frontend/components/agents/agent';
import { AgentChat } from '@gitroom/frontend/components/agents/agent.chat';
export const metadata: Metadata = {
  title: `${productNameServerSide()} - Agent`,
  description: '',
};
export default async function Page() {
  return (
    <AgentChat />
  );
}
