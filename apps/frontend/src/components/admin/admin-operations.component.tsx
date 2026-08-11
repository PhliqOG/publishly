'use client';

import { FC } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';

type CountRow = { count: number };
type OperationsResponse = {
  generatedAt: string;
  dependencies: Record<'database' | 'redis' | 'temporal', boolean>;
  totals: {
    users: number;
    organizations: number;
    memberships: number;
    integrations: number;
  };
  integrationsByProvider: ({ provider: string } & CountRow)[];
  subscriptions: ({ tier: string } & CountRow)[];
  publishing: {
    states: ({ state: string } & CountRow)[];
    recentFailures: {
      id: string;
      postId: string;
      provider: string;
      state: string;
      attempts: number;
      failureCategory?: string | null;
      lastError?: string | null;
      updatedAt: string;
      organization: { id: string; name: string };
    }[];
  };
  storage: { objects: number; bytes: number };
  api: { activeKeys: number; usedLast24Hours: number };
  webhooks: {
    configured: number;
    inboundProcessedLast24Hours: number;
    failedDeliveriesLast24Hours: number;
    recentFailures: {
      id: string;
      eventId: string;
      eventType: string;
      attempt: number;
      statusCode?: number | null;
      error?: string | null;
      createdAt: string;
      organization: { id: string; name: string };
      webhook: { id: string; name: string };
    }[];
    latestInbound?: {
      source: string;
      type: string;
      processedAt: string;
    } | null;
  };
  providers: {
    identifier: string;
    name: string;
    configured: boolean;
    missingEnv: string[];
    queueConcurrency?: number;
  }[];
  flags: Record<string, string | boolean>;
  recentUsers: {
    id: string;
    email: string;
    name?: string | null;
    lastName?: string | null;
    activated: boolean;
    isSuperAdmin: boolean;
    createdAt: string;
    lastOnline: string;
  }[];
  recentOrganizations: {
    id: string;
    name: string;
    createdAt: string;
    _count: { users: number; Integration: number; post: number; media: number };
    subscription?: {
      subscriptionTier: string;
      period: string;
      cancelAt?: string | null;
    } | null;
  }[];
  auditLogs: {
    id: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    actorType: string;
    createdAt: string;
    organization: { id: string; name: string };
    user?: { id: string; email: string } | null;
  }[];
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4);
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
};

const when = (date?: string | null) =>
  date ? new Date(date).toLocaleString() : 'Never';

const Card: FC<{ label: string; value: string | number; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[16px] min-w-0">
    <div className="text-[12px] uppercase tracking-[0.08em] opacity-60">
      {label}
    </div>
    <div className="mt-[6px] text-[26px] font-[600] truncate">{value}</div>
    {hint ? (
      <div className="mt-[3px] text-[12px] opacity-60">{hint}</div>
    ) : null}
  </div>
);

const Section: FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="rounded-[12px] border border-newTableBorder overflow-hidden">
    <div className="px-[16px] py-[12px] bg-newBgColorInner border-b border-newTableBorder font-[600]">
      {title}
    </div>
    {children}
  </section>
);

export const AdminOperationsComponent: FC = () => {
  const user = useUser();
  const fetch = useFetch();
  const { data, error, isLoading, mutate } = useSWR<OperationsResponse>(
    user?.isSuperAdmin ? '/admin/operations' : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Could not load operations data');
      return response.json();
    },
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  if (!user?.isSuperAdmin) {
    return (
      <div className="p-[20px] text-textColor">
        You do not have access to this page.
      </div>
    );
  }

  if (isLoading) return <LoadingComponent />;
  if (error || !data) {
    return (
      <div className="text-textColor flex items-center gap-[12px]">
        <span className="text-red-400">Failed to load operations data.</span>
        <button
          type="button"
          onClick={() => mutate()}
          className="underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="text-textColor flex flex-col gap-[16px] min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <div>
          <h1 className="text-[22px] font-[650]">Operations</h1>
          <p className="text-[13px] opacity-60">
            Live service, tenant, publishing, and usage telemetry.
          </p>
        </div>
        <div className="text-[12px] opacity-60">
          Updated {when(data.generatedAt)}
        </div>
      </div>

      <div className="flex flex-wrap gap-[8px]">
        {Object.entries(data.dependencies).map(([name, healthy]) => (
          <div
            key={name}
            className={`rounded-full px-[11px] py-[6px] text-[12px] border ${
              healthy
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-red-500/40 bg-red-500/10 text-red-400'
            }`}
          >
            {name}: {healthy ? 'healthy' : 'unavailable'}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[10px]">
        <Card label="Users" value={data.totals.users.toLocaleString()} />
        <Card
          label="Workspaces"
          value={data.totals.organizations.toLocaleString()}
          hint={`${data.totals.memberships.toLocaleString()} active memberships`}
        />
        <Card
          label="Social connections"
          value={data.totals.integrations.toLocaleString()}
        />
        <Card
          label="Storage"
          value={formatBytes(data.storage.bytes)}
          hint={`${data.storage.objects.toLocaleString()} media records`}
        />
        <Card
          label="Active API keys"
          value={data.api.activeKeys.toLocaleString()}
          hint={`${data.api.usedLast24Hours.toLocaleString()} used in 24h`}
        />
        <Card
          label="Customer webhooks"
          value={data.webhooks.configured.toLocaleString()}
          hint={`${data.webhooks.failedDeliveriesLast24Hours.toLocaleString()} failed deliveries in 24h`}
        />
        <Card
          label="Failed jobs"
          value={(
            data.publishing.states.find((row) => row.state === 'FAILED')
              ?.count || 0
          ).toLocaleString()}
        />
        <Card
          label="Retrying jobs"
          value={(
            data.publishing.states.find((row) => row.state === 'RETRYING')
              ?.count || 0
          ).toLocaleString()}
        />
      </div>

      <div className="grid xl:grid-cols-2 gap-[16px]">
        <Section title="Publishing state">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-newTableBorder">
            {data.publishing.states.length ? (
              data.publishing.states.map((row) => (
                <div key={row.state} className="bg-newBgColorInner p-[14px]">
                  <div className="text-[12px] opacity-60">
                    {row.state.split('_').join(' ')}
                  </div>
                  <div className="text-[20px] font-[600]">
                    {row.count.toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-newBgColorInner p-[14px] text-[13px] opacity-60 col-span-full">
                No publishing jobs yet.
              </div>
            )}
          </div>
        </Section>

        <Section title="Subscriptions">
          <div className="divide-y divide-newTableBorder">
            {data.subscriptions.length ? (
              data.subscriptions.map((row) => (
                <div
                  key={row.tier}
                  className="flex justify-between px-[16px] py-[10px] text-[13px]"
                >
                  <span>{row.tier}</span>
                  <span>{row.count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="p-[16px] text-[13px] opacity-60">
                No active subscriptions.
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title="Recent publishing failures">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[850px]">
            <thead className="opacity-60">
              <tr>
                {[
                  'Updated',
                  'Workspace',
                  'Provider',
                  'State',
                  'Attempts',
                  'Category',
                  'Error',
                  'Post',
                ].map((label) => (
                  <th key={label} className="px-[12px] py-[9px] font-[500]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-newTableBorder">
              {data.publishing.recentFailures.map((failure) => (
                <tr key={failure.id}>
                  <td className="px-[12px] py-[10px] whitespace-nowrap">
                    {when(failure.updatedAt)}
                  </td>
                  <td className="px-[12px] py-[10px]">
                    {failure.organization.name}
                  </td>
                  <td className="px-[12px] py-[10px] capitalize">
                    {failure.provider}
                  </td>
                  <td className="px-[12px] py-[10px]">{failure.state}</td>
                  <td className="px-[12px] py-[10px]">{failure.attempts}</td>
                  <td className="px-[12px] py-[10px]">
                    {failure.failureCategory || '—'}
                  </td>
                  <td
                    className="px-[12px] py-[10px] max-w-[360px] truncate"
                    title={failure.lastError || ''}
                  >
                    {failure.lastError || '—'}
                  </td>
                  <td className="px-[12px] py-[10px] font-mono">
                    {failure.postId.slice(0, 10)}
                  </td>
                </tr>
              ))}
              {!data.publishing.recentFailures.length ? (
                <tr>
                  <td colSpan={8} className="p-[16px] opacity-60">
                    No failed or retrying jobs.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Recent webhook delivery failures">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[760px]">
            <thead className="opacity-60">
              <tr>
                {[
                  'Created',
                  'Workspace',
                  'Webhook',
                  'Event',
                  'Attempt',
                  'HTTP',
                  'Error',
                ].map((label) => (
                  <th key={label} className="px-[12px] py-[9px] font-[500]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-newTableBorder">
              {data.webhooks.recentFailures.map((failure) => (
                <tr key={failure.id}>
                  <td className="px-[12px] py-[10px] whitespace-nowrap">
                    {when(failure.createdAt)}
                  </td>
                  <td className="px-[12px] py-[10px]">
                    {failure.organization.name}
                  </td>
                  <td className="px-[12px] py-[10px]">
                    {failure.webhook.name}
                  </td>
                  <td className="px-[12px] py-[10px] font-mono">
                    {failure.eventType}
                  </td>
                  <td className="px-[12px] py-[10px]">{failure.attempt}</td>
                  <td className="px-[12px] py-[10px]">
                    {failure.statusCode || '—'}
                  </td>
                  <td
                    className="px-[12px] py-[10px] max-w-[360px] truncate"
                    title={failure.error || ''}
                  >
                    {failure.error || '—'}
                  </td>
                </tr>
              ))}
              {!data.webhooks.recentFailures.length ? (
                <tr>
                  <td colSpan={7} className="p-[16px] opacity-60">
                    No recorded delivery failures.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Provider configuration and connection health">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[720px]">
            <thead className="opacity-60">
              <tr>
                {[
                  'Provider',
                  'Configuration',
                  'Connections',
                  'Queue cap',
                  'Missing variables',
                ].map((label) => (
                  <th key={label} className="px-[12px] py-[9px] font-[500]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-newTableBorder">
              {data.providers.map((provider) => (
                <tr key={provider.identifier}>
                  <td className="px-[12px] py-[10px]">{provider.name}</td>
                  <td
                    className={`px-[12px] py-[10px] ${
                      provider.configured
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {provider.configured ? 'Configured' : 'Disabled'}
                  </td>
                  <td className="px-[12px] py-[10px]">
                    {data.integrationsByProvider.find(
                      (row) => row.provider === provider.identifier
                    )?.count || 0}
                  </td>
                  <td className="px-[12px] py-[10px]">
                    {provider.queueConcurrency || 'default'}
                  </td>
                  <td className="px-[12px] py-[10px] font-mono text-[11px] max-w-[480px] break-words">
                    {provider.missingEnv.join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid xl:grid-cols-2 gap-[16px]">
        <Section title="Recent workspaces">
          <div className="divide-y divide-newTableBorder">
            {data.recentOrganizations.map((workspace) => (
              <div
                key={workspace.id}
                className="px-[14px] py-[11px] text-[12px]"
              >
                <div className="flex justify-between gap-[12px]">
                  <span className="font-[600] truncate">{workspace.name}</span>
                  <span className="opacity-60 whitespace-nowrap">
                    {workspace.subscription?.subscriptionTier || 'No plan'}
                  </span>
                </div>
                <div className="mt-[4px] opacity-60">
                  {workspace._count.users} members ·{' '}
                  {workspace._count.Integration} connections ·{' '}
                  {workspace._count.post} posts · {workspace._count.media} media
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Recent users">
          <div className="divide-y divide-newTableBorder">
            {data.recentUsers.map((entry) => (
              <div
                key={entry.id}
                className="px-[14px] py-[11px] text-[12px] flex justify-between gap-[12px]"
              >
                <div className="min-w-0">
                  <div className="font-[600] truncate">{entry.email}</div>
                  <div className="opacity-60">
                    Joined {when(entry.createdAt)}
                  </div>
                </div>
                <span
                  className={
                    entry.activated ? 'text-emerald-400' : 'text-amber-400'
                  }
                >
                  {entry.activated ? 'Active' : 'Unverified'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Recent audit activity">
        <div className="divide-y divide-newTableBorder">
          {data.auditLogs.map((log) => (
            <div
              key={log.id}
              className="grid sm:grid-cols-[180px_1fr_1fr] gap-[4px_12px] px-[14px] py-[10px] text-[12px]"
            >
              <span className="opacity-60">{when(log.createdAt)}</span>
              <span>{log.action}</span>
              <span className="opacity-70 truncate">
                {log.user?.email || log.actorType} · {log.organization.name}
              </span>
            </div>
          ))}
          {!data.auditLogs.length ? (
            <div className="p-[16px] text-[13px] opacity-60">
              No audit entries yet.
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  );
};
