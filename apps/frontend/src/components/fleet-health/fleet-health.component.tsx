'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import {
  completeCurrentReconnect,
  createReconnectBatch,
  currentReconnectAction,
  failCurrentReconnect,
  FleetReconnectBatch,
  parseReconnectBatch,
} from './fleet-reconnect.flow';
import {
  confirmCurrentConnect,
  createConnectBatch,
  currentConnectAction,
  failCurrentConnect,
  FleetConnectBatch,
  parseConnectBatch,
} from './fleet-connect.flow';
import {
  FleetPlatformTruth,
  fleetPlatformTruthBadge,
} from './fleet-platform-truth';

type HealthColor = 'green' | 'yellow' | 'red';
type Facet = { id: string; name: string; color: string };
type FleetRow = {
  id: string;
  internalId: string;
  name: string;
  picture?: string | null;
  provider: string;
  disabled: boolean;
  refreshNeeded: boolean;
  healthColor: HealthColor;
  healthReason: string;
  tokenExpiration?: string | null;
  tokenDaysRemaining?: number | null;
  tokenHealthState: string;
  tokenHealthReason?: string | null;
  connectionHealthState: string;
  connectionHealthReason?: string | null;
  lastProviderContactAt?: string | null;
  lastSuccessfulPublishAt?: string | null;
  lastFailedPublishAt?: string | null;
  consecutiveErrors: number;
  staleSince?: string | null;
  deadAccountAt?: string | null;
  rateLimitedUntil?: string | null;
  platformTruth: FleetPlatformTruth;
  group?: Facet | null;
  groups: Facet[];
  tags: Facet[];
  metrics: {
    confirmedLive: number;
    failed: number;
    terminal: number;
    successRate: number | null;
    retries: number;
    queued: number;
    oldestQueuedAt?: string | null;
  };
};

type FleetResponse = {
  generatedAt: string;
  windowDays: 7 | 30 | 90;
  summary: {
    total: number;
    green: number;
    yellow: number;
    red: number;
    confirmedLive: number;
    failed: number;
    successRate: number | null;
  };
  facets: { groups: Facet[]; tags: Facet[] };
  rows: FleetRow[];
};

type ProviderCatalogEntry = {
  identifier: string;
  name: string;
  configured: boolean;
  isExternal?: boolean;
  isChromeExtension?: boolean;
  customFields?: unknown;
};

type ProviderCatalog = { social: ProviderCatalogEntry[] };

const RECONNECT_STORAGE_KEY = 'publishly:fleet-reconnect:v1';
const CONNECT_STORAGE_KEY = 'publishly:fleet-connect:v1';

const healthClasses: Record<HealthColor, string> = {
  green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  yellow: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  red: 'border-red-500/40 bg-red-500/10 text-red-400',
};

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : 'Never';

const formatRate = (value: number | null) =>
  value === null ? 'No outcomes' : `${value.toFixed(value % 1 ? 2 : 0)}%`;

async function responseReason(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return (
    body.reason ||
    body.message?.reason ||
    (typeof body.message === 'string' ? body.message : null) ||
    body.error ||
    fallback
  );
}

function SummaryCard({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: HealthColor;
}) {
  return (
    <div className="rounded-[12px] border border-newTableBorder bg-newBgColorInner p-[15px] min-w-0">
      <div className="flex items-center gap-[7px] text-[12px] uppercase tracking-[0.08em] opacity-60">
        {color ? (
          <span
            className={clsx(
              'h-[8px] w-[8px] rounded-full',
              color === 'green' && 'bg-emerald-400',
              color === 'yellow' && 'bg-amber-300',
              color === 'red' && 'bg-red-400'
            )}
          />
        ) : null}
        {label}
      </div>
      <div className="mt-[5px] text-[25px] font-[650] truncate">{value}</div>
      {hint ? (
        <div className="mt-[2px] text-[11px] opacity-55">{hint}</div>
      ) : null}
    </div>
  );
}

export function FleetHealthComponent() {
  const fetch = useFetch();
  const searchParams = useSearchParams();
  const callbackHandled = useRef(false);
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [groupId, setGroupId] = useState('');
  const [tagId, setTagId] = useState('');
  const [color, setColor] = useState<'' | HealthColor>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#8C66FF');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#3B82F6');
  const [connectProvider, setConnectProvider] = useState('');
  const [connectCount, setConnectCount] = useState(1);
  const [connectSelections, setConnectSelections] = useState<
    Array<{ provider: string; count: number }>
  >([]);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [batch, setBatch] = useState<FleetReconnectBatch | null>(null);
  const [connectBatch, setConnectBatch] = useState<FleetConnectBatch | null>(
    null
  );

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ windowDays: String(windowDays) });
    if (groupId) params.set('groupId', groupId);
    if (tagId) params.set('tagId', tagId);
    if (color) params.set('color', color);
    return `/integrations/fleet-health?${params.toString()}`;
  }, [windowDays, groupId, tagId, color]);

  const load = useCallback(
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          await responseReason(response, 'Fleet health could not be loaded.')
        );
      }
      return response.json();
    },
    [fetch]
  );
  const { data, error, isLoading, mutate } = useSWR<FleetResponse>(
    endpoint,
    load,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );
  const { data: providerCatalog } = useSWR<ProviderCatalog>(
    '/integrations/',
    load,
    { revalidateOnFocus: false }
  );

  const saveBatch = useCallback((next: FleetReconnectBatch | null) => {
    setBatch(next);
    if (typeof window === 'undefined') return;
    if (next) {
      localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(RECONNECT_STORAGE_KEY);
    }
  }, []);

  const saveConnectBatch = useCallback((next: FleetConnectBatch | null) => {
    setConnectBatch(next);
    if (typeof window === 'undefined') return;
    if (next) {
      localStorage.setItem(CONNECT_STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(CONNECT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const saved = parseReconnectBatch(
      typeof window === 'undefined'
        ? null
        : localStorage.getItem(RECONNECT_STORAGE_KEY)
    );
    if (saved) setBatch(saved);
    const savedConnect = parseConnectBatch(
      typeof window === 'undefined'
        ? null
        : localStorage.getItem(CONNECT_STORAGE_KEY)
    );
    if (savedConnect) setConnectBatch(savedConnect);
  }, []);

  useEffect(() => {
    if (
      callbackHandled.current ||
      !searchParams.get('added') ||
      connectBatch ||
      !batch ||
      !currentReconnectAction(batch)
    ) {
      return;
    }
    callbackHandled.current = true;
    const completed = completeCurrentReconnect(batch);
    saveBatch(completed);
    setActionNotice('Connection refreshed. Continue with the next account.');
    void mutate();
    window.history.replaceState(null, '', '/fleet');
  }, [batch, connectBatch, mutate, saveBatch, searchParams]);

  useEffect(() => {
    const addedProvider = searchParams.get('added');
    if (
      callbackHandled.current ||
      !addedProvider ||
      !connectBatch ||
      !currentConnectAction(connectBatch)
    ) {
      return;
    }
    const completed = confirmCurrentConnect(connectBatch, addedProvider);
    if (completed === connectBatch) return;
    callbackHandled.current = true;
    saveConnectBatch(completed);
    setActionNotice(
      'Connection confirmed. Continue with the next bulk-connect action.'
    );
    void mutate();
    window.history.replaceState(null, '', '/fleet');
  }, [connectBatch, mutate, saveConnectBatch, searchParams]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return data?.rows || [];
    return (data?.rows || []).filter((row) =>
      [
        row.name,
        row.provider,
        row.platformTruth.code || '',
        row.platformTruth.reason || '',
        ...row.groups.map((group) => group.name),
        ...row.tags.map((tag) => tag.name),
      ].some((value) => value.toLocaleLowerCase().includes(query))
    );
  }, [data?.rows, search]);

  const toggleSelected = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id].slice(0, 500)
    );
  }, []);

  const toggleAllVisible = useCallback(() => {
    const visibleIds = visibleRows.map((row) => row.id);
    setSelected((current) => {
      const allSelected = visibleIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }
      return [...new Set([...current, ...visibleIds])].slice(0, 500);
    });
  }, [visibleRows]);

  const createReconnectPlan = useCallback(
    async (integrationIds: string[]) => {
      setActionBusy(true);
      setActionError('');
      setActionNotice('');
      try {
        const response = await fetch(
          '/integrations/fleet-health/reconnect-plan',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ integrationIds }),
          }
        );
        if (!response.ok) {
          throw new Error(
            await responseReason(
              response,
              'Reconnect plan could not be created.'
            )
          );
        }
        const plan = createReconnectBatch(await response.json());
        saveConnectBatch(null);
        saveBatch(plan);
        setSelected([]);
        if (!plan.actions.length) {
          setActionError(
            plan.rejected.map((item) => item.reason).join(' ') ||
              'None of the selected connections can be reconnected.'
          );
        } else {
          setActionNotice(
            `${plan.actions.length} connection${
              plan.actions.length === 1 ? '' : 's'
            } ready for guided reconnect.`
          );
        }
      } catch (planError) {
        setActionError(
          planError instanceof Error
            ? planError.message
            : 'Reconnect plan could not be created.'
        );
      } finally {
        setActionBusy(false);
      }
    },
    [fetch, saveBatch, saveConnectBatch]
  );

  const continueReconnect = useCallback(async () => {
    if (!batch) return;
    const action = currentReconnectAction(batch);
    if (!action) return;
    setActionBusy(true);
    setActionError('');
    try {
      const params = new URLSearchParams({
        refresh: action.internalId,
        redirectUrl: '/fleet',
      });
      const response = await fetch(
        `/integrations/social/${encodeURIComponent(
          action.provider
        )}?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(
          await responseReason(
            response,
            `Reconnect could not start for ${action.name}.`
          )
        );
      }
      const payload = await response.json();
      if (!payload?.url || typeof payload.url !== 'string') {
        throw new Error(`Reconnect URL was missing for ${action.name}.`);
      }
      window.location.assign(payload.url);
    } catch (reconnectError) {
      const reason =
        reconnectError instanceof Error
          ? reconnectError.message
          : `Reconnect could not start for ${action.name}.`;
      saveBatch(failCurrentReconnect(batch, reason));
      setActionError(reason);
      setActionBusy(false);
    }
  }, [batch, fetch, saveBatch]);

  const addConnectSelection = useCallback(() => {
    const count = Math.max(1, Math.min(500, Math.trunc(connectCount)));
    if (!connectProvider) return;
    setConnectSelections((current) => {
      const withoutProvider = current.filter(
        (selection) => selection.provider !== connectProvider
      );
      const total = withoutProvider.reduce(
        (sum, selection) => sum + selection.count,
        count
      );
      if (total > 500) {
        setActionError('A bulk-connect plan can contain at most 500 actions.');
        return current;
      }
      setActionError('');
      return [...withoutProvider, { provider: connectProvider, count }];
    });
  }, [connectCount, connectProvider]);

  const createBulkConnectPlan = useCallback(async () => {
    if (!connectSelections.length) return;
    setActionBusy(true);
    setActionError('');
    setActionNotice('');
    try {
      const response = await fetch('/integrations/fleet-health/connect-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: connectSelections }),
      });
      if (!response.ok) {
        throw new Error(
          await responseReason(
            response,
            'Bulk-connect plan could not be created.'
          )
        );
      }
      const plan = createConnectBatch(await response.json());
      saveBatch(null);
      saveConnectBatch(plan);
      setConnectSelections([]);
      if (!plan.actions.length) {
        setActionError(
          plan.rejected.map((item) => item.reason).join(' ') ||
            'None of these providers support guided bulk connect.'
        );
      } else {
        setActionNotice(
          `${plan.actions.length} connection action${
            plan.actions.length === 1 ? '' : 's'
          } ready. OAuth will run one account at a time.`
        );
      }
    } catch (connectError) {
      setActionError(
        connectError instanceof Error
          ? connectError.message
          : 'Bulk-connect plan could not be created.'
      );
    } finally {
      setActionBusy(false);
    }
  }, [connectSelections, fetch, saveBatch, saveConnectBatch]);

  const continueConnect = useCallback(async () => {
    if (!connectBatch) return;
    const action = currentConnectAction(connectBatch);
    if (!action) return;
    setActionBusy(true);
    setActionError('');
    try {
      const params = new URLSearchParams({ redirectUrl: '/fleet' });
      const response = await fetch(
        `/integrations/social/${encodeURIComponent(
          action.provider
        )}?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(
          await responseReason(
            response,
            `OAuth could not start for ${action.providerName}.`
          )
        );
      }
      const payload = await response.json();
      if (!payload?.url || typeof payload.url !== 'string') {
        throw new Error(`OAuth URL was missing for ${action.providerName}.`);
      }
      window.location.assign(payload.url);
    } catch (connectError) {
      const reason =
        connectError instanceof Error
          ? connectError.message
          : `OAuth could not start for ${action.providerName}.`;
      saveConnectBatch(failCurrentConnect(connectBatch, reason));
      setActionError(reason);
      setActionBusy(false);
    }
  }, [connectBatch, fetch, saveConnectBatch]);

  const createTag = useCallback(async () => {
    setActionBusy(true);
    setActionError('');
    try {
      const response = await fetch('/integrations/fleet-health/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      });
      if (!response.ok) {
        throw new Error(
          await responseReason(response, 'Account tag could not be created.')
        );
      }
      const created = await response.json();
      setNewTagName('');
      setSelectedTag(created.id);
      setActionNotice(`Tag “${created.name}” is ready.`);
      await mutate();
    } catch (tagError) {
      setActionError(
        tagError instanceof Error
          ? tagError.message
          : 'Account tag could not be created.'
      );
    } finally {
      setActionBusy(false);
    }
  }, [fetch, mutate, newTagColor, newTagName]);

  const assignTag = useCallback(
    async (mode: 'add' | 'remove') => {
      if (!selectedTag || !selected.length) return;
      setActionBusy(true);
      setActionError('');
      try {
        const response = await fetch(
          `/integrations/fleet-health/tags/${encodeURIComponent(
            selectedTag
          )}/assign`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ integrationIds: selected, mode }),
          }
        );
        if (!response.ok) {
          throw new Error(
            await responseReason(response, 'Account tags could not be updated.')
          );
        }
        const result = await response.json();
        setActionNotice(
          `${result.requested} selected connection${
            result.requested === 1 ? '' : 's'
          } processed.`
        );
        await mutate();
      } catch (tagError) {
        setActionError(
          tagError instanceof Error
            ? tagError.message
            : 'Account tags could not be updated.'
        );
      } finally {
        setActionBusy(false);
      }
    },
    [fetch, mutate, selected, selectedTag]
  );

  const createGroup = useCallback(async () => {
    setActionBusy(true);
    setActionError('');
    try {
      const response = await fetch('/integrations/fleet-health/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName, color: newGroupColor }),
      });
      if (!response.ok) {
        throw new Error(
          await responseReason(response, 'Account group could not be created.')
        );
      }
      const created = await response.json();
      setNewGroupName('');
      setSelectedGroup(created.id);
      setActionNotice(`Group "${created.name}" is ready.`);
      await mutate();
    } catch (groupError) {
      setActionError(
        groupError instanceof Error
          ? groupError.message
          : 'Account group could not be created.'
      );
    } finally {
      setActionBusy(false);
    }
  }, [fetch, mutate, newGroupColor, newGroupName]);

  const assignGroup = useCallback(
    async (mode: 'add' | 'remove') => {
      if (!selectedGroup || !selected.length) return;
      setActionBusy(true);
      setActionError('');
      try {
        const response = await fetch(
          `/integrations/fleet-health/groups/${encodeURIComponent(
            selectedGroup
          )}/assign`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ integrationIds: selected, mode }),
          }
        );
        if (!response.ok) {
          throw new Error(
            await responseReason(
              response,
              'Account groups could not be updated.'
            )
          );
        }
        const result = await response.json();
        setActionNotice(
          `${result.requested} selected connection${
            result.requested === 1 ? '' : 's'
          } processed.`
        );
        await mutate();
      } catch (groupError) {
        setActionError(
          groupError instanceof Error
            ? groupError.message
            : 'Account groups could not be updated.'
        );
      } finally {
        setActionBusy(false);
      }
    },
    [fetch, mutate, selected, selectedGroup]
  );

  if (isLoading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-newBgColorInner">
        <LoadingComponent />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 items-center justify-center bg-newBgColorInner p-[20px] text-textColor">
        <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 p-[18px] text-center">
          <div className="text-red-400">
            {error instanceof Error
              ? error.message
              : 'Fleet health could not be loaded.'}
          </div>
          <button className="mt-[10px] underline" onClick={() => mutate()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentAction = batch ? currentReconnectAction(batch) : null;
  const currentConnect = connectBatch
    ? currentConnectAction(connectBatch)
    : null;
  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selected.includes(row.id));

  return (
    <div className="flex flex-1 flex-col gap-[14px] overflow-auto bg-newBgColorInner p-[20px] text-textColor">
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <h1 className="text-[24px] font-[650]">Fleet health</h1>
          <p className="mt-[2px] text-[13px] opacity-60">
            Confirmed delivery, token horizon, and account health across every
            connection.
          </p>
        </div>
        <div className="text-[11px] opacity-55">
          Updated {formatDate(data.generatedAt)} · refreshes every 30s
        </div>
      </div>

      <div className="grid grid-cols-2 gap-[9px] lg:grid-cols-5">
        <SummaryCard label="Connections" value={data.summary.total} />
        <SummaryCard label="Healthy" value={data.summary.green} color="green" />
        <SummaryCard
          label="Attention"
          value={data.summary.yellow}
          color="yellow"
        />
        <SummaryCard label="Broken" value={data.summary.red} color="red" />
        <SummaryCard
          label={`${data.windowDays}d success`}
          value={formatRate(data.summary.successRate)}
          hint={`${data.summary.confirmedLive} confirmed · ${data.summary.failed} failed`}
        />
      </div>

      <div className="rounded-[12px] border border-newTableBorder p-[12px]">
        <div className="flex flex-wrap items-end gap-[8px]">
          <div className="me-auto min-w-[220px]">
            <div className="text-[13px] font-[600]">Bulk connect accounts</div>
            <div className="mt-[2px] text-[11px] opacity-60">
              Build up to 500 actions. OAuth runs sequentially so every result
              is confirmed before the next account starts.
            </div>
          </div>
          <label className="flex min-w-[180px] flex-col gap-[4px] text-[11px] opacity-80">
            Provider
            <select
              value={connectProvider}
              onChange={(event) => setConnectProvider(event.target.value)}
              className="h-[34px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[8px] text-[12px]"
            >
              <option value="">Choose provider</option>
              {(providerCatalog?.social || []).map((provider) => (
                <option key={provider.identifier} value={provider.identifier}>
                  {provider.name}
                  {provider.configured ? '' : ' (not configured)'}
                </option>
              ))}
            </select>
          </label>
          <label className="flex w-[90px] flex-col gap-[4px] text-[11px] opacity-80">
            Accounts
            <input
              type="number"
              min={1}
              max={500}
              value={connectCount}
              onChange={(event) => setConnectCount(Number(event.target.value))}
              className="h-[34px] rounded-[8px] border border-newTableBorder bg-transparent px-[8px] text-[12px]"
            />
          </label>
          <button
            type="button"
            disabled={!connectProvider || actionBusy}
            onClick={addConnectSelection}
            className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
          >
            Add to plan
          </button>
          <button
            type="button"
            disabled={!connectSelections.length || actionBusy}
            onClick={createBulkConnectPlan}
            className="h-[34px] rounded-[8px] bg-primary px-[12px] text-[12px] font-[600] text-white disabled:opacity-40"
          >
            Start bulk connect
          </button>
        </div>
        {connectSelections.length ? (
          <div className="mt-[8px] flex flex-wrap gap-[6px]">
            {connectSelections.map((selection) => (
              <button
                key={selection.provider}
                type="button"
                onClick={() =>
                  setConnectSelections((current) =>
                    current.filter(
                      (item) => item.provider !== selection.provider
                    )
                  )
                }
                className="rounded-full border border-newTableBorder px-[8px] py-[3px] text-[11px]"
                title="Remove from plan"
              >
                {selection.provider} x {selection.count}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {connectBatch ? (
        <div className="rounded-[12px] border border-sky-500/40 bg-sky-500/10 p-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div>
              <div className="font-[600]">Guided bulk connect</div>
              <div className="mt-[2px] text-[12px] opacity-70">
                {connectBatch.completed.length} of {connectBatch.actions.length}{' '}
                connected
                {connectBatch.failed.length
                  ? ` / ${connectBatch.failed.length} could not start`
                  : ''}
                {connectBatch.rejected.length
                  ? ` / ${connectBatch.rejected.length} provider selections require individual action`
                  : ''}
              </div>
              {currentConnect ? (
                <div className="mt-[5px] text-[13px]">
                  Next: {currentConnect.providerName} account{' '}
                  {currentConnect.ordinal}
                </div>
              ) : (
                <div className="mt-[5px] text-[13px] text-emerald-400">
                  Bulk-connect batch finished.
                </div>
              )}
            </div>
            <div className="flex gap-[8px]">
              {currentConnect ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={continueConnect}
                  className="rounded-[8px] bg-sky-600 px-[13px] py-[8px] text-[12px] font-[600] text-white disabled:opacity-50"
                >
                  Connect next account
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => saveConnectBatch(null)}
                className="rounded-[8px] border border-newTableBorder px-[13px] py-[8px] text-[12px]"
              >
                {currentConnect ? 'Stop' : 'Done'}
              </button>
            </div>
          </div>
          {connectBatch.rejected.length ? (
            <div className="mt-[9px] border-t border-sky-500/20 pt-[8px] text-[11px] opacity-70">
              {connectBatch.rejected.map((item) => (
                <div key={`${item.provider}:${item.code}`}>
                  {item.providerName || item.provider}: {item.reason}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {batch ? (
        <div className="rounded-[12px] border border-primary/40 bg-primary/10 p-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <div>
              <div className="font-[600]">Guided reconnect</div>
              <div className="mt-[2px] text-[12px] opacity-70">
                {batch.completed.length} of {batch.actions.length} refreshed
                {batch.failed.length
                  ? ` · ${batch.failed.length} could not start`
                  : ''}
                {batch.rejected.length
                  ? ` · ${batch.rejected.length} require individual action`
                  : ''}
              </div>
              {currentAction ? (
                <div className="mt-[5px] text-[13px]">
                  Next: {currentAction.name} ({currentAction.provider})
                </div>
              ) : (
                <div className="mt-[5px] text-[13px] text-emerald-400">
                  Reconnect batch finished. Health will update after provider
                  confirmation.
                </div>
              )}
            </div>
            <div className="flex gap-[8px]">
              {currentAction ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={continueReconnect}
                  className="rounded-[8px] bg-primary px-[13px] py-[8px] text-[12px] font-[600] text-white disabled:opacity-50"
                >
                  Continue reconnect
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => saveBatch(null)}
                className="rounded-[8px] border border-newTableBorder px-[13px] py-[8px] text-[12px]"
              >
                {currentAction ? 'Stop' : 'Done'}
              </button>
            </div>
          </div>
          {batch.rejected.length ? (
            <div className="mt-[9px] border-t border-primary/20 pt-[8px] text-[11px] opacity-70">
              {batch.rejected.map((item) => (
                <div key={`${item.integrationId}:${item.code}`}>
                  {item.name || item.integrationId}: {item.reason}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-[9px] border border-red-500/30 bg-red-500/10 px-[12px] py-[9px] text-[12px] text-red-300">
          {actionError}
        </div>
      ) : null}
      {actionNotice ? (
        <div className="rounded-[9px] border border-emerald-500/30 bg-emerald-500/10 px-[12px] py-[9px] text-[12px] text-emerald-300">
          {actionNotice}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-[8px] rounded-[12px] border border-newTableBorder p-[12px]">
        <label className="flex min-w-[180px] flex-1 flex-col gap-[4px] text-[11px] opacity-80">
          Search fleet
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Account, provider, group, or tag"
            className="h-[36px] rounded-[8px] border border-newTableBorder bg-transparent px-[10px] text-[13px] outline-none"
          />
        </label>
        <label className="flex min-w-[125px] flex-col gap-[4px] text-[11px] opacity-80">
          Health
          <select
            value={color}
            onChange={(event) =>
              setColor(event.target.value as '' | HealthColor)
            }
            className="h-[36px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[9px] text-[13px]"
          >
            <option value="">All colors</option>
            <option value="green">Green</option>
            <option value="yellow">Yellow</option>
            <option value="red">Red</option>
          </select>
        </label>
        <label className="flex min-w-[145px] flex-col gap-[4px] text-[11px] opacity-80">
          Group
          <select
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            className="h-[36px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[9px] text-[13px]"
          >
            <option value="">All groups</option>
            {data.facets.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[145px] flex-col gap-[4px] text-[11px] opacity-80">
          Account tag
          <select
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
            className="h-[36px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[9px] text-[13px]"
          >
            <option value="">All tags</option>
            {data.facets.tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[100px] flex-col gap-[4px] text-[11px] opacity-80">
          Window
          <select
            value={windowDays}
            onChange={(event) =>
              setWindowDays(Number(event.target.value) as 7 | 30 | 90)
            }
            className="h-[36px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[9px] text-[13px]"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-[8px] rounded-[12px] border border-newTableBorder p-[12px]">
        <div className="me-auto text-[12px] opacity-70">
          {selected.length
            ? `${selected.length} selected`
            : 'Select connections for reconnect or tagging'}
        </div>
        <button
          type="button"
          disabled={!selected.length || actionBusy}
          onClick={() => createReconnectPlan(selected)}
          className="h-[34px] rounded-[8px] bg-primary px-[12px] text-[12px] font-[600] text-white disabled:opacity-40"
        >
          Reconnect selected
        </button>
        <select
          value={selectedGroup}
          onChange={(event) => setSelectedGroup(event.target.value)}
          className="h-[34px] min-w-[130px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[8px] text-[12px]"
        >
          <option value="">Choose group</option>
          {data.facets.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected.length || !selectedGroup || actionBusy}
          onClick={() => assignGroup('add')}
          className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
        >
          Add group
        </button>
        <button
          type="button"
          disabled={!selected.length || !selectedGroup || actionBusy}
          onClick={() => assignGroup('remove')}
          className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
        >
          Remove group
        </button>
        <select
          value={selectedTag}
          onChange={(event) => setSelectedTag(event.target.value)}
          className="h-[34px] min-w-[130px] rounded-[8px] border border-newTableBorder bg-newBgColorInner px-[8px] text-[12px]"
        >
          <option value="">Choose tag</option>
          {data.facets.tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected.length || !selectedTag || actionBusy}
          onClick={() => assignTag('add')}
          className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
        >
          Add tag
        </button>
        <button
          type="button"
          disabled={!selected.length || !selectedTag || actionBusy}
          onClick={() => assignTag('remove')}
          className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
        >
          Remove tag
        </button>
        <input
          value={newTagName}
          onChange={(event) => setNewTagName(event.target.value)}
          placeholder="New tag"
          maxLength={40}
          className="h-[34px] w-[125px] rounded-[8px] border border-newTableBorder bg-transparent px-[9px] text-[12px] outline-none"
        />
        <input
          aria-label="New tag color"
          type="color"
          value={newTagColor}
          onChange={(event) => setNewTagColor(event.target.value)}
          className="h-[34px] w-[38px] rounded-[8px] border border-newTableBorder bg-transparent p-[3px]"
        />
        <button
          type="button"
          disabled={!newTagName.trim() || actionBusy}
          onClick={createTag}
          className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
        >
          Create tag
        </button>
        <input
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
          placeholder="New group"
          maxLength={60}
          className="h-[34px] w-[125px] rounded-[8px] border border-newTableBorder bg-transparent px-[9px] text-[12px] outline-none"
        />
        <input
          aria-label="New group color"
          type="color"
          value={newGroupColor}
          onChange={(event) => setNewGroupColor(event.target.value)}
          className="h-[34px] w-[38px] rounded-[8px] border border-newTableBorder bg-transparent p-[3px]"
        />
        <button
          type="button"
          disabled={!newGroupName.trim() || actionBusy}
          onClick={createGroup}
          className="h-[34px] rounded-[8px] border border-newTableBorder px-[10px] text-[12px] disabled:opacity-40"
        >
          Create group
        </button>
      </div>

      <div className="min-h-[280px] overflow-auto rounded-[12px] border border-newTableBorder">
        <table className="w-full min-w-[1320px] border-collapse text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-newBgColorInner">
            <tr className="border-b border-newTableBorder text-[11px] uppercase tracking-[0.06em] opacity-65">
              <th className="w-[42px] px-[12px] py-[11px]">
                <input
                  aria-label="Select visible connections"
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="px-[10px] py-[11px]">Platform truth</th>
              <th className="px-[10px] py-[11px]">Health</th>
              <th className="px-[10px] py-[11px]">Connection</th>
              <th className="px-[10px] py-[11px]">Group / tags</th>
              <th className="px-[10px] py-[11px]">Token</th>
              <th className="px-[10px] py-[11px]">Success</th>
              <th className="px-[10px] py-[11px]">Outcomes</th>
              <th className="px-[10px] py-[11px]">Queue</th>
              <th className="px-[10px] py-[11px]">Last live</th>
              <th className="px-[10px] py-[11px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-newTableBorder/70 last:border-b-0 hover:bg-boxHover/40"
              >
                <td className="px-[12px] py-[12px] align-top">
                  <input
                    aria-label={`Select ${row.name}`}
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggleSelected(row.id)}
                  />
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  {(() => {
                    const badge = fleetPlatformTruthBadge(row.platformTruth);
                    return (
                      <>
                        <span
                          title={badge.reason}
                          className={clsx(
                            'inline-flex rounded-full border px-[7px] py-[3px] text-[10px] font-[650]',
                            badge.tone === 'red' &&
                              'border-red-500/40 bg-red-500/10 text-red-300',
                            badge.tone === 'yellow' &&
                              'border-amber-500/40 bg-amber-500/10 text-amber-300',
                            badge.tone === 'green' &&
                              'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
                            badge.tone === 'neutral' &&
                              'border-newTableBorder opacity-65'
                          )}
                        >
                          {badge.label}
                        </span>
                        <div className="mt-[5px] max-w-[190px] text-[10px] leading-[1.35] opacity-60">
                          {badge.reason}
                        </div>
                      </>
                    );
                  })()}
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <span
                    title={row.healthReason}
                    className={clsx(
                      'inline-flex rounded-full border px-[8px] py-[4px] font-[600] capitalize',
                      healthClasses[row.healthColor]
                    )}
                  >
                    {row.healthColor}
                  </span>
                  <div className="mt-[5px] max-w-[170px] text-[10px] leading-[1.35] opacity-60">
                    {row.healthReason}
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div className="flex items-center gap-[9px]">
                    <div className="relative h-[34px] w-[34px] shrink-0">
                      <ImageWithFallback
                        fallbackSrc={`/icons/platforms/${row.provider}.png`}
                        src={
                          row.picture || `/icons/platforms/${row.provider}.png`
                        }
                        alt={row.provider}
                        width={34}
                        height={34}
                        className="h-[34px] w-[34px] rounded-[8px] object-cover"
                      />
                    </div>
                    <div>
                      <div className="max-w-[180px] truncate font-[600]">
                        {row.name}
                      </div>
                      <div className="mt-[2px] text-[10px] opacity-55">
                        {row.provider}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div className="flex max-w-[190px] flex-wrap gap-[4px]">
                    {row.groups.length ? (
                      row.groups.map((group) => (
                        <span
                          key={group.id}
                          className="rounded-full px-[6px] py-[2px] text-[10px]"
                          style={{
                            color: group.color,
                            backgroundColor: `${group.color}1F`,
                          }}
                        >
                          {group.name}
                        </span>
                      ))
                    ) : (
                      <span className="opacity-60">Ungrouped</span>
                    )}
                  </div>
                  <div className="mt-[5px] flex max-w-[190px] flex-wrap gap-[4px]">
                    {row.tags.length ? (
                      row.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full px-[6px] py-[2px] text-[10px]"
                          style={{
                            color: tag.color,
                            backgroundColor: `${tag.color}1F`,
                          }}
                        >
                          {tag.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] opacity-45">No tags</span>
                    )}
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div className="font-[600]">{row.tokenHealthState}</div>
                  <div className="mt-[3px] text-[10px] opacity-55">
                    {row.tokenDaysRemaining === null ||
                    row.tokenDaysRemaining === undefined
                      ? 'Expiry unknown'
                      : row.tokenDaysRemaining <= 0
                      ? 'Expired'
                      : `${row.tokenDaysRemaining}d remaining`}
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div className="text-[16px] font-[650]">
                    {formatRate(row.metrics.successRate)}
                  </div>
                  <div className="mt-[3px] text-[10px] opacity-55">
                    {data.windowDays} day window
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div className="text-emerald-400">
                    {row.metrics.confirmedLive} confirmed
                  </div>
                  <div className="text-red-400">
                    {row.metrics.failed} failed
                  </div>
                  <div className="text-[10px] opacity-55">
                    {row.metrics.retries} retries
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div>{row.metrics.queued} active</div>
                  <div className="mt-[3px] text-[10px] opacity-55">
                    oldest {formatDate(row.metrics.oldestQueuedAt)}
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <div>{formatDate(row.lastSuccessfulPublishAt)}</div>
                  <div className="mt-[3px] text-[10px] opacity-55">
                    contact {formatDate(row.lastProviderContactAt)}
                  </div>
                </td>
                <td className="px-[10px] py-[12px] align-top">
                  <button
                    type="button"
                    disabled={row.disabled || actionBusy}
                    onClick={() => createReconnectPlan([row.id])}
                    className="rounded-[7px] border border-newTableBorder px-[9px] py-[6px] text-[11px] disabled:opacity-35"
                  >
                    Reconnect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleRows.length ? (
          <div className="p-[35px] text-center text-[13px] opacity-60">
            No connections match these fleet filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
