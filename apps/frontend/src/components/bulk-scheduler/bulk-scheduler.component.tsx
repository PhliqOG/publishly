'use client';

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { BULK_UPLOAD_CHUNK_BYTES } from '@gitroom/helpers/bulk-scheduler/upload.contract';
import {
  bulkExpansionMath,
  clientUploadId,
  selectedDestinationAvailability,
} from './bulk-scheduler.logic';

type Integration = {
  id: string;
  name: string;
  identifier: string;
  picture?: string;
  disabled?: boolean;
};
type MatrixTuple = {
  id: string;
  provider: string;
  providerDisplayName: string;
  accountType: string;
  postType: string;
  mediaKind: string;
  integrationDecisions?: Array<{
    integrationId: string;
    eligible: boolean;
    code: string;
    reason: string;
  }>;
};
type CapabilityResponse = {
  canaryMode: boolean;
  tuples: MatrixTuple[];
};
type Campaign = {
  id: string;
  name: string;
  state: string;
  currentRevision: number;
  openIssueCount: number;
  updatedAt: string;
};
type CampaignDetail = Campaign & {
  intent: { intent: Record<string, any>; revision: number };
};
type Upload = {
  id: string;
  originalName: string;
  relativePath: string;
  expectedByteLength: number;
  receivedBytes: number;
  totalParts: number;
  receivedParts: number;
  uploadedPartNumbers: number[];
  state: string;
  assetId?: string | null;
  failureClass?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
};
type CampaignJob = {
  id: string;
  state: string;
  scheduledAt?: string | null;
  localScheduledAt?: string | null;
  timezone: string;
  pinned: boolean;
  revision: number;
  outcomeClass?: string | null;
  outcomeCode: string;
  outcomeReason: string;
};

const weekdays = [
  ['Sun', 0],
  ['Mon', 1],
  ['Tue', 2],
  ['Wed', 3],
  ['Thu', 4],
  ['Fri', 5],
  ['Sat', 6],
] as const;

const terminalUploads = new Set([
  'READY',
  'QUARANTINED',
  'FINAL_FAILURE',
  'ABORTED',
  'EXPIRED',
]);

async function responseProblem(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return {
    reason:
      body.reason ||
      body.message?.reason ||
      (typeof body.message === 'string' ? body.message : null) ||
      body.error ||
      fallback,
    body,
  };
}

function key(prefix: string) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, item]) => `${JSON.stringify(name)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function uploadBatchKey(
  campaignId: string,
  descriptors: Array<Record<string, unknown>>
) {
  const bytes = new TextEncoder().encode(
    canonical({ campaignId, descriptors })
  );
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `upload-batch:${hex}`;
}

function percent(upload: Upload) {
  return Math.min(
    100,
    Math.round((upload.receivedBytes / upload.expectedByteLength) * 100)
  );
}

export function BulkSchedulerComponent() {
  const api = useFetch();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState('');
  const [campaignName, setCampaignName] = useState('Video campaign');
  const [selected, setSelected] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [jobs, setJobs] = useState<CampaignJob[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(
    null
  );
  const [distributionMode, setDistributionMode] = useState<
    'cross_post' | 'distribute'
  >('cross_post');
  const [cadenceScope, setCadenceScope] = useState<'per_account' | 'campaign'>(
    'per_account'
  );
  const [postsPerDay, setPostsPerDay] = useState(3);
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState([1, 2, 3, 4, 5]);
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [windowStart, setWindowStart] = useState('09:00');
  const [windowEnd, setWindowEnd] = useState('17:00');
  const [spacingMinutes, setSpacingMinutes] = useState(60);
  const [slotStrategy, setSlotStrategy] = useState<'fixed' | 'even'>('even');
  const [conflictBehavior, setConflictBehavior] = useState<
    'next_available' | 'keep_conflict' | 'stop'
  >('next_available');
  const [orderingMode, setOrderingMode] = useState<
    'upload' | 'filename' | 'manual' | 'deterministic_shuffle'
  >('upload');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(
    async (url: string) => {
      const response = await api(url);
      if (!response.ok)
        throw new Error(
          (await responseProblem(response, 'Request failed.')).reason
        );
      return response.json();
    },
    [api]
  );
  const { data: integrationData } = useSWR<{ integrations: Integration[] }>(
    '/integrations/list',
    load,
    { revalidateOnFocus: false }
  );
  const { data: capabilityData } = useSWR<CapabilityResponse>(
    '/bulk/scheduler/capabilities',
    load,
    { revalidateOnFocus: false }
  );

  const integrations = integrationData?.integrations || [];
  const availability = useMemo(
    () =>
      selectedDestinationAvailability({
        integrations,
        tuples: capabilityData?.tuples || [],
      }),
    [integrations, capabilityData]
  );
  const destinationRows = useMemo(
    () =>
      availability.map((row) => ({
        ...row,
        integration: integrations.find(
          (item) => item.id === row.integrationId
        )!,
        tuple: capabilityData?.tuples.find(
          (item) => item.id === row.capabilityTupleId
        )!,
        key: `${row.integrationId}:${row.capabilityTupleId}`,
      })),
    [availability, integrations, capabilityData]
  );
  const selectedDestinations = destinationRows.filter((row) =>
    selected.includes(row.key)
  );
  const readyAssets = uploads.filter(
    (upload) => upload.state === 'READY'
  ).length;
  const pendingLocalFiles = files.length;
  const expansion = bulkExpansionMath({
    assetCount: readyAssets + pendingLocalFiles,
    destinationCount: selectedDestinations.length,
    distributionMode,
  });

  const refreshCampaigns = useCallback(async () => {
    const page = await load('/bulk/scheduler/campaigns?limit=100');
    setCampaigns(page.items || []);
  }, [load]);
  const refreshDetail = useCallback(async () => {
    if (!activeCampaignId) return;
    const [uploadPage, jobPage, issuePage] = await Promise.all([
      load(`/bulk/scheduler/campaigns/${activeCampaignId}/uploads?limit=100`),
      load(`/bulk/scheduler/campaigns/${activeCampaignId}/jobs?limit=100`),
      load(
        `/bulk/scheduler/campaigns/${activeCampaignId}/issues?state=open&limit=100`
      ),
    ]);
    setUploads(uploadPage.items || []);
    setJobs(jobPage.items || []);
    setIssues(issuePage.items || []);
  }, [activeCampaignId, load]);

  const hydrateCampaign = useCallback(
    async (campaignId: string) => {
      const detail = (await load(
        `/bulk/scheduler/campaigns/${campaignId}`
      )) as CampaignDetail;
      const value = detail.intent.intent;
      const destinations = value.selection?.destinations || [];
      setCampaignDetail(detail);
      setCampaignName(detail.name);
      setSelected(
        destinations.map(
          (destination: any) =>
            `${destination.integrationId}:${destination.capabilityTupleId}`
        )
      );
      setDistributionMode(value.distribution?.mode || 'cross_post');
      setCadenceScope(value.cadence?.scope || 'per_account');
      setPostsPerDay(value.cadence?.postsPerDay || 3);
      setStartDate(
        value.schedule?.startDate || new Date().toISOString().slice(0, 10)
      );
      setEndDate(value.schedule?.endDate || '');
      setSelectedWeekdays(value.schedule?.weekdays || [1, 2, 3, 4, 5]);
      setTimezone(value.schedule?.timezone || 'UTC');
      setWindowStart(value.schedule?.windowStart || '09:00');
      setWindowEnd(value.schedule?.windowEnd || '17:00');
      setSpacingMinutes(value.schedule?.spacingMinutes || 60);
      setSlotStrategy(value.schedule?.slotStrategy || 'even');
      setConflictBehavior(value.schedule?.conflictBehavior || 'next_available');
      setOrderingMode(value.ordering?.mode || 'upload');
      setCaption(value.publication?.caption || '');
    },
    [load]
  );

  useEffect(() => {
    refreshCampaigns().catch((cause) => setError(cause.message));
  }, [refreshCampaigns]);
  useEffect(() => {
    refreshDetail().catch((cause) => setError(cause.message));
  }, [refreshDetail]);
  useEffect(() => {
    if (!activeCampaignId) {
      setCampaignDetail(null);
      setUploads([]);
      setJobs([]);
      setIssues([]);
      return;
    }
    hydrateCampaign(activeCampaignId).catch((cause) => setError(cause.message));
  }, [activeCampaignId, hydrateCampaign]);
  useEffect(() => {
    if (
      !activeCampaignId ||
      !uploads.some((upload) => !terminalUploads.has(upload.state))
    )
      return;
    const timer = window.setInterval(
      () => refreshDetail().catch(() => undefined),
      3_000
    );
    return () => window.clearInterval(timer);
  }, [activeCampaignId, uploads, refreshDetail]);

  const intent = useCallback(
    () => ({
      schemaVersion: 1,
      selection: {
        destinations: selectedDestinations.map((row) => ({
          integrationId: row.integrationId,
          capabilityTupleId: row.capabilityTupleId,
        })),
      },
      distribution: { mode: distributionMode },
      cadence: { scope: cadenceScope, postsPerDay },
      schedule: {
        startDate,
        ...(endDate ? { endDate } : {}),
        weekdays: selectedWeekdays,
        timezone,
        windowStart,
        windowEnd,
        spacingMinutes,
        slotStrategy,
        conflictBehavior,
      },
      ordering: {
        mode: orderingMode,
        ...(orderingMode === 'deterministic_shuffle'
          ? { seed: campaignName }
          : {}),
      },
      publication: { caption },
    }),
    [
      selectedDestinations,
      distributionMode,
      cadenceScope,
      postsPerDay,
      startDate,
      endDate,
      selectedWeekdays,
      timezone,
      windowStart,
      windowEnd,
      spacingMinutes,
      slotStrategy,
      conflictBehavior,
      orderingMode,
      campaignName,
      caption,
    ]
  );

  const createCampaign = async () => {
    setBusy('Creating campaign');
    setError('');
    try {
      if (!selectedDestinations.length)
        throw new Error('Select at least one enabled destination.');
      const response = await api('/bulk/scheduler/campaigns', {
        method: 'POST',
        headers: { 'Idempotency-Key': key('campaign-create') },
        body: JSON.stringify({ name: campaignName, intent: intent() }),
      });
      if (!response.ok)
        throw new Error(
          (
            await responseProblem(response, 'Campaign could not be created.')
          ).reason
        );
      const campaign = await response.json();
      setActiveCampaignId(campaign.id);
      setCampaigns((current) => [
        campaign,
        ...current.filter((item) => item.id !== campaign.id),
      ]);
      setNotice(
        'Campaign created. Add files, then preview and reserve the calendar.'
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Campaign could not be created.'
      );
    } finally {
      setBusy('');
    }
  };

  const addFiles = (incoming: File[]) => {
    setFiles((current) => {
      const ids = new Set(
        current.map((file) =>
          clientUploadId({
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            relativePath: file.webkitRelativePath,
          })
        )
      );
      return [
        ...current,
        ...incoming.filter((file) => {
          const id = clientUploadId({
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            relativePath: file.webkitRelativePath,
          });
          if (ids.has(id)) return false;
          ids.add(id);
          return true;
        }),
      ];
    });
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const uploadFiles = async () => {
    if (!activeCampaignId)
      return setError('Create or select a campaign first.');
    if (!files.length) return setError('Choose one or more video files first.');
    setBusy('Uploading files');
    setError('');
    try {
      const descriptors = files.map((file) => ({
        clientUploadId: clientUploadId({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          relativePath: file.webkitRelativePath,
        }),
        originalName: file.name,
        relativePath: file.webkitRelativePath || file.name,
        byteLength: file.size,
        mimeType: file.type || 'application/octet-stream',
      }));
      const initiatedResponse = await api(
        `/bulk/scheduler/campaigns/${activeCampaignId}/uploads`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': await uploadBatchKey(
              activeCampaignId,
              descriptors
            ),
          },
          body: JSON.stringify({ files: descriptors }),
        }
      );
      if (!initiatedResponse.ok) {
        throw new Error(
          (
            await responseProblem(initiatedResponse, 'Upload could not start.')
          ).reason
        );
      }
      const initiated = await initiatedResponse.json();
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];
        const upload = initiated.sessions[fileIndex] as Upload;
        const already = new Set(upload.uploadedPartNumbers || []);
        for (
          let partNumber = 0;
          partNumber < upload.totalParts;
          partNumber += 1
        ) {
          if (already.has(partNumber)) continue;
          const start = partNumber * BULK_UPLOAD_CHUNK_BYTES;
          const chunk = file.slice(
            start,
            Math.min(file.size, start + BULK_UPLOAD_CHUNK_BYTES)
          );
          const form = new FormData();
          form.append('chunk', chunk, `${file.name}.part-${partNumber}`);
          const response = await api(
            `/bulk/scheduler/campaigns/${activeCampaignId}/uploads/${upload.id}/parts/${partNumber}`,
            { method: 'PUT', body: form }
          );
          if (!response.ok) {
            throw new Error(
              (
                await responseProblem(response, `Part ${partNumber} failed.`)
              ).reason
            );
          }
        }
        const completed = await api(
          `/bulk/scheduler/campaigns/${activeCampaignId}/uploads/${upload.id}/complete`,
          { method: 'POST' }
        );
        if (!completed.ok) {
          throw new Error(
            (
              await responseProblem(completed, 'Upload completion failed.')
            ).reason
          );
        }
      }
      setFiles([]);
      setNotice(
        'Every file was received. Validation and normalization are running independently.'
      );
      await refreshDetail();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Upload stopped. Received chunks remain resumable.'
      );
      await refreshDetail().catch(() => undefined);
    } finally {
      setBusy('');
    }
  };

  const lifecycle = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!activeCampaignId) return;
    setBusy(action);
    setError('');
    try {
      const response = await api(
        `/bulk/scheduler/campaigns/${activeCampaignId}/${action}`,
        { method: 'POST', headers: { 'Idempotency-Key': key(action) } }
      );
      if (!response.ok)
        throw new Error(
          (await responseProblem(response, `${action} failed.`)).reason
        );
      setNotice(
        `Campaign ${
          action === 'pause'
            ? 'paused'
            : action === 'resume'
            ? 'resumed'
            : 'cancellation started'
        }.`
      );
      await Promise.all([refreshCampaigns(), refreshDetail()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${action} failed.`);
    } finally {
      setBusy('');
    }
  };

  const plan = async () => {
    if (!activeCampaignId) return;
    setBusy('Planning and reserving');
    setError('');
    try {
      let detail = campaignDetail;
      if (!detail) {
        detail = (await load(
          `/bulk/scheduler/campaigns/${activeCampaignId}`
        )) as CampaignDetail;
      }
      const nextIntent = intent();
      if (canonical(detail.intent.intent) !== canonical(nextIntent)) {
        const revisedResponse = await api(
          `/bulk/scheduler/campaigns/${activeCampaignId}/intent`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              expectedRevision: detail.currentRevision,
              intent: nextIntent,
            }),
          }
        );
        if (!revisedResponse.ok) {
          throw new Error(
            (
              await responseProblem(
                revisedResponse,
                'Cadence changes could not be saved.'
              )
            ).reason
          );
        }
        detail = await revisedResponse.json();
        setCampaignDetail(detail);
      }
      const response = await api(
        `/bulk/scheduler/campaigns/${activeCampaignId}/plan`,
        { method: 'POST' }
      );
      if (!response.ok)
        throw new Error(
          (await responseProblem(response, 'Planning failed.')).reason
        );
      const result = await response.json();
      setNotice(
        `Reserved ${
          result.expansion.expandedJobCount - result.overflowCount
        } jobs. ${result.overflowCount} overflow item(s) remain visible.`
      );
      await Promise.all([refreshCampaigns(), refreshDetail()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Planning failed.');
    } finally {
      setBusy('');
    }
  };

  const mutateJob = async (
    job: CampaignJob,
    action: 'pin' | 'unpin' | 'retry'
  ) => {
    if (!activeCampaignId) return;
    setBusy(
      action === 'retry' ? 'Queueing item retry' : 'Updating pinned slot'
    );
    setError('');
    try {
      const response = await api(
        `/bulk/scheduler/campaigns/${activeCampaignId}/jobs/${job.id}/${
          action === 'retry' ? 'retry' : 'pin'
        }`,
        action === 'retry'
          ? {
              method: 'POST',
              headers: { 'Idempotency-Key': key(`job-retry:${job.id}`) },
            }
          : {
              method: 'POST',
              body: JSON.stringify({
                pinned: action === 'pin',
                expectedRevision: job.revision,
              }),
            }
      );
      if (!response.ok) {
        throw new Error(
          (await responseProblem(response, 'Item update failed.')).reason
        );
      }
      setNotice(
        action === 'retry'
          ? 'The item was returned to the existing verified publishing path.'
          : `The calendar slot was ${action === 'pin' ? 'pinned' : 'unpinned'}.`
      );
      await refreshDetail();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Item update failed.');
    } finally {
      setBusy('');
    }
  };

  const activeCampaign = campaigns.find(
    (campaign) => campaign.id === activeCampaignId
  );
  const blockedDestinations = destinationRows.filter((row) => !row.eligible);
  const conflicted = jobs.filter((job) => job.state === 'CONFLICTED').length;
  const overflow = jobs.filter((job) => job.state === 'OVERFLOW').length;

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-newBgColorInner p-[20px] text-textColor">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-[14px]">
        <div className="flex flex-wrap items-start justify-between gap-[12px]">
          <div>
            <h1 className="text-[26px] font-[700]">Bulk Scheduler</h1>
            <p className="mt-[3px] max-w-[760px] text-[13px] opacity-65">
              Drop a folder of videos, prove every file, preview the exact job
              expansion, then send each item through Publishly&apos;s verified
              V109 publisher.
            </p>
          </div>
          <select
            className="min-w-[260px] rounded-[9px] border border-newTableBorder bg-newBgColorInner px-[10px] py-[9px] text-[12px]"
            value={activeCampaignId}
            onChange={(event) => setActiveCampaignId(event.target.value)}
          >
            <option value="">New campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} - {campaign.state} ({campaign.openIssueCount}{' '}
                issues)
              </option>
            ))}
          </select>
        </div>

        {(notice || error || busy) && (
          <div
            className={clsx(
              'rounded-[10px] border px-[12px] py-[9px] text-[12px]',
              error
                ? 'border-red-500/35 bg-red-500/10 text-red-300'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
            )}
          >
            {error || (busy ? `${busy}...` : notice)}
          </div>
        )}

        <div className="grid gap-[12px] xl:grid-cols-[1.05fr_1fr]">
          <section className="rounded-[12px] border border-newTableBorder p-[15px]">
            <div className="text-[15px] font-[650]">
              1. Campaign and destinations
            </div>
            {!activeCampaignId && (
              <label className="mt-[12px] block text-[11px] opacity-75">
                Campaign name
                <input
                  className="mt-[5px] w-full rounded-[8px] border border-newTableBorder bg-transparent px-[10px] py-[8px] text-[13px]"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                />
              </label>
            )}
            <div className="mt-[12px] max-h-[270px] space-y-[7px] overflow-auto pe-[4px]">
              {destinationRows.map((row) => (
                <label
                  key={row.key}
                  className={clsx(
                    'flex items-start gap-[9px] rounded-[9px] border p-[9px]',
                    row.eligible
                      ? 'border-newTableBorder'
                      : 'border-amber-500/25 bg-amber-500/5 opacity-75'
                  )}
                  title={row.reason}
                >
                  <input
                    type="checkbox"
                    disabled={!row.eligible || Boolean(activeCampaignId)}
                    checked={selected.includes(row.key)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, row.key]
                          : current.filter((item) => item !== row.key)
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-[600]">
                      {row.integration?.name || row.integrationId} -{' '}
                      {row.tuple?.providerDisplayName} {row.tuple?.postType}
                    </div>
                    <div className="mt-[2px] text-[10px] opacity-60">
                      {row.eligible
                        ? 'Eligible for this exact tuple'
                        : `${row.code}: ${row.reason}`}
                    </div>
                  </div>
                </label>
              ))}
              {!destinationRows.length && (
                <div className="rounded-[9px] bg-white/5 p-[12px] text-[12px] opacity-65">
                  Connect an account first. Unknown platform/post combinations
                  remain disabled.
                </div>
              )}
            </div>
            {!activeCampaignId && (
              <button
                onClick={createCampaign}
                disabled={Boolean(busy) || !selectedDestinations.length}
                className="mt-[12px] rounded-[8px] bg-blue-600 px-[13px] py-[8px] text-[12px] font-[650] text-white disabled:opacity-40"
              >
                Create campaign
              </button>
            )}
            {blockedDestinations.length > 0 && (
              <div className="mt-[9px] text-[10px] text-amber-300/80">
                {blockedDestinations.length} exact tuple(s) are visibly disabled
                by the capability matrix.
              </div>
            )}
          </section>

          <section className="rounded-[12px] border border-newTableBorder p-[15px]">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-[650]">
                2. Native video upload
              </div>
              <div className="text-[10px] opacity-55">
                Private - resumable - 8 MiB chunks
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              multiple
              hidden
              onChange={onFiles}
            />
            <input
              ref={folderRef}
              type="file"
              accept="video/*"
              multiple
              hidden
              {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={onFiles}
            />
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              className="mt-[12px] flex min-h-[135px] flex-col items-center justify-center rounded-[11px] border border-dashed border-blue-400/50 bg-blue-500/5 p-[18px] text-center"
            >
              <div className="text-[14px] font-[650]">Drop videos here</div>
              <div className="mt-[3px] text-[11px] opacity-60">
                One invalid file is quarantined; the rest continue.
              </div>
              <div className="mt-[10px] flex gap-[7px]">
                <button
                  onClick={() => inputRef.current?.click()}
                  className="rounded-[7px] border border-newTableBorder px-[10px] py-[6px] text-[11px]"
                >
                  Choose videos
                </button>
                <button
                  onClick={() => folderRef.current?.click()}
                  className="rounded-[7px] border border-newTableBorder px-[10px] py-[6px] text-[11px]"
                >
                  Choose folder
                </button>
              </div>
            </div>
            {files.length > 0 && (
              <div className="mt-[9px] rounded-[8px] bg-white/5 p-[9px] text-[11px]">
                {files.length} local file(s),{' '}
                {(
                  files.reduce((sum, file) => sum + file.size, 0) /
                  1024 /
                  1024
                ).toFixed(1)}{' '}
                MiB selected.
              </div>
            )}
            <button
              onClick={uploadFiles}
              disabled={!activeCampaignId || !files.length || Boolean(busy)}
              className="mt-[10px] rounded-[8px] bg-blue-600 px-[13px] py-[8px] text-[12px] font-[650] text-white disabled:opacity-40"
            >
              Upload and validate
            </button>
          </section>
        </div>

        <section className="rounded-[12px] border border-newTableBorder p-[15px]">
          <div className="text-[15px] font-[650]">
            3. Cadence and calendar intent
          </div>
          <div className="mt-[11px] grid gap-[9px] sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <Field label="Distribution">
              <select
                value={distributionMode}
                onChange={(event) =>
                  setDistributionMode(event.target.value as any)
                }
              >
                <option value="cross_post">
                  Every asset x every destination
                </option>
                <option value="distribute">
                  Distribute across destinations
                </option>
              </select>
            </Field>
            <Field label="Cadence scope">
              <select
                value={cadenceScope}
                onChange={(event) => setCadenceScope(event.target.value as any)}
              >
                <option value="per_account">Per account</option>
                <option value="campaign">Across campaign</option>
              </select>
            </Field>
            <Field label="Posts/day">
              <input
                type="number"
                min={1}
                max={100}
                value={postsPerDay}
                onChange={(event) => setPostsPerDay(Number(event.target.value))}
              />
            </Field>
            <Field label="Start date">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field label="End date (capacity cap)">
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </Field>
            <Field label="Timezone">
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </Field>
            <Field label="Window start">
              <input
                type="time"
                value={windowStart}
                onChange={(event) => setWindowStart(event.target.value)}
              />
            </Field>
            <Field label="Window end">
              <input
                type="time"
                value={windowEnd}
                onChange={(event) => setWindowEnd(event.target.value)}
              />
            </Field>
            <Field label="Minimum spacing">
              <input
                type="number"
                min={1}
                max={1440}
                value={spacingMinutes}
                onChange={(event) =>
                  setSpacingMinutes(Number(event.target.value))
                }
              />
            </Field>
            <Field label="Slot strategy">
              <select
                value={slotStrategy}
                onChange={(event) => setSlotStrategy(event.target.value as any)}
              >
                <option value="even">Even spacing</option>
                <option value="fixed">Fixed slots</option>
              </select>
            </Field>
            <Field label="Conflicts">
              <select
                value={conflictBehavior}
                onChange={(event) =>
                  setConflictBehavior(event.target.value as any)
                }
              >
                <option value="next_available">Next available</option>
                <option value="keep_conflict">Keep as conflict</option>
                <option value="stop">Stop planning</option>
              </select>
            </Field>
            <Field label="Asset order">
              <select
                value={orderingMode}
                onChange={(event) => setOrderingMode(event.target.value as any)}
              >
                <option value="upload">Upload order</option>
                <option value="filename">Filename order</option>
                <option value="manual">Manual order</option>
                <option value="deterministic_shuffle">
                  Deterministic shuffle
                </option>
              </select>
            </Field>
          </div>
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {weekdays.map(([label, value]) => (
              <button
                key={value}
                onClick={() =>
                  setSelectedWeekdays((current) =>
                    current.includes(value)
                      ? current.filter((day) => day !== value)
                      : [...current, value].sort()
                  )
                }
                className={clsx(
                  'rounded-full border px-[9px] py-[5px] text-[10px]',
                  selectedWeekdays.includes(value)
                    ? 'border-blue-400 bg-blue-500/15 text-blue-200'
                    : 'border-newTableBorder opacity-60'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-[10px] block text-[11px] opacity-75">
            Caption applied to this MVP batch
            <textarea
              className="mt-[5px] min-h-[72px] w-full rounded-[8px] border border-newTableBorder bg-transparent p-[9px] text-[12px]"
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </label>
        </section>

        <div className="grid gap-[12px] xl:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-[12px] border border-newTableBorder p-[15px]">
            <div className="text-[15px] font-[650]">
              4. Expansion preview and controls
            </div>
            <div className="mt-[10px] grid grid-cols-2 gap-[8px]">
              <Metric label="Assets" value={expansion.assetCount} />
              <Metric label="Destinations" value={expansion.destinationCount} />
              <Metric
                label="Expanded jobs"
                value={expansion.expandedJobCount}
              />
              <Metric label="Visible issues" value={issues.length} />
            </div>
            <div className="mt-[9px] rounded-[8px] bg-blue-500/10 p-[10px] text-[12px] text-blue-100">
              {expansion.formula}
            </div>
            {expansion.overLimit && (
              <div className="mt-[8px] rounded-[8px] border border-red-400/50 bg-red-500/10 p-[10px] text-[11px] text-red-100">
                This preview exceeds the {expansion.maximumExpandedJobs.toLocaleString()}{' '}
                job campaign limit. Split the assets or destinations; Publishly
                will not silently truncate the campaign.
              </div>
            )}
            <div className="mt-[8px] text-[10px] opacity-60">
              Current ledger: {jobs.length} jobs, {conflicted} conflicts,{' '}
              {overflow} overflow. No hidden spillover.
            </div>
            <div className="mt-[11px] flex flex-wrap gap-[7px]">
              <button
                disabled={
                  !activeCampaignId ||
                  readyAssets < 1 ||
                  expansion.overLimit ||
                  Boolean(busy)
                }
                onClick={plan}
                className="rounded-[8px] bg-emerald-600 px-[12px] py-[7px] text-[11px] font-[650] text-white disabled:opacity-40"
              >
                Preview, reserve, schedule
              </button>
              <button
                disabled={!activeCampaignId || Boolean(busy)}
                onClick={() => lifecycle('pause')}
                className="rounded-[8px] border border-newTableBorder px-[10px] py-[7px] text-[11px] disabled:opacity-40"
              >
                Pause
              </button>
              <button
                disabled={!activeCampaignId || Boolean(busy)}
                onClick={() => lifecycle('resume')}
                className="rounded-[8px] border border-newTableBorder px-[10px] py-[7px] text-[11px] disabled:opacity-40"
              >
                Resume
              </button>
              <button
                disabled={!activeCampaignId || Boolean(busy)}
                onClick={() => lifecycle('cancel')}
                className="rounded-[8px] border border-red-500/40 px-[10px] py-[7px] text-[11px] text-red-300 disabled:opacity-40"
              >
                Cancel future unpinned
              </button>
            </div>
            {activeCampaign && (
              <div className="mt-[10px] text-[10px] opacity-55">
                {activeCampaign.state} - revision{' '}
                {activeCampaign.currentRevision} -{' '}
                {activeCampaign.openIssueCount} open issue(s)
              </div>
            )}
            {campaignDetail &&
              canonical(campaignDetail.intent.intent) !==
                canonical(intent()) && (
                <div className="mt-[8px] text-[10px] text-amber-300">
                  Cadence edits are unsaved. Previewing will create a new intent
                  revision and preserve published or pinned slots.
                </div>
              )}
          </section>

          <section className="rounded-[12px] border border-newTableBorder p-[15px]">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-[650]">
                File and outcome ledger
              </div>
              <button
                onClick={() => refreshDetail()}
                className="text-[10px] underline opacity-60"
              >
                Refresh
              </button>
            </div>
            <div className="mt-[9px] max-h-[370px] space-y-[7px] overflow-auto pe-[3px]">
              {uploads.map((upload) => (
                <div
                  key={upload.id}
                  className="rounded-[9px] border border-newTableBorder p-[9px]"
                >
                  <div className="flex items-start gap-[10px]">
                    {upload.assetId ? (
                      <img
                        src={`/bulk/scheduler/assets/${upload.assetId}/thumbnail`}
                        alt=""
                        className="h-[48px] w-[64px] rounded-[6px] object-cover"
                      />
                    ) : (
                      <div className="flex h-[48px] w-[64px] items-center justify-center rounded-[6px] bg-white/5 text-[9px] opacity-50">
                        VIDEO
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-[8px]">
                        <div className="truncate text-[12px] font-[600]">
                          {upload.relativePath}
                        </div>
                        <StateBadge state={upload.state} />
                      </div>
                      <div className="mt-[5px] h-[4px] overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-blue-400"
                          style={{
                            width: `${
                              upload.state === 'READY' ? 100 : percent(upload)
                            }%`,
                          }}
                        />
                      </div>
                      <div className="mt-[4px] text-[9px] opacity-55">
                        {upload.receivedParts}/{upload.totalParts} parts -{' '}
                        {(upload.expectedByteLength / 1024 / 1024).toFixed(1)}{' '}
                        MiB
                      </div>
                      {upload.failureCode && (
                        <div className="mt-[4px] text-[10px] text-amber-300">
                          {upload.failureClass}/{upload.failureCode}:{' '}
                          {upload.failureReason}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!uploads.length && (
                <div className="py-[25px] text-center text-[11px] opacity-50">
                  No durable upload items yet.
                </div>
              )}
            </div>
          </section>
        </div>

        {issues.length > 0 && (
          <section className="rounded-[12px] border border-amber-500/25 bg-amber-500/5 p-[15px]">
            <div className="text-[14px] font-[650] text-amber-200">
              Open issues - nothing skipped silently
            </div>
            <div className="mt-[8px] grid gap-[6px] lg:grid-cols-2">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-[8px] bg-black/10 p-[8px] text-[10px]"
                >
                  <span className="font-[650]">
                    {issue.issueClass}/{issue.failureClass}/{issue.code}
                  </span>
                  : {issue.reason}
                </div>
              ))}
            </div>
          </section>
        )}

        {jobs.length > 0 && (
          <section className="rounded-[12px] border border-newTableBorder p-[15px]">
            <div className="text-[14px] font-[650]">Scheduled item ledger</div>
            <div className="mt-[8px] grid gap-[7px] lg:grid-cols-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-[9px] border border-newTableBorder p-[9px] text-[10px]"
                >
                  <div className="flex items-center justify-between gap-[8px]">
                    <StateBadge state={job.state} />
                    <span className="opacity-55">
                      {job.localScheduledAt || 'No slot'} {job.timezone}
                    </span>
                  </div>
                  <div className="mt-[6px] break-words">
                    <span className="font-[650]">
                      {job.outcomeClass ? `${job.outcomeClass}/` : ''}
                      {job.outcomeCode}
                    </span>
                    : {job.outcomeReason}
                  </div>
                  <div className="mt-[7px] flex gap-[6px]">
                    {['RESERVED', 'SCHEDULED', 'PAUSED', 'PUBLISHED'].includes(
                      job.state
                    ) && (
                      <button
                        disabled={
                          Boolean(busy) ||
                          (job.state === 'PUBLISHED' && job.pinned)
                        }
                        onClick={() =>
                          mutateJob(job, job.pinned ? 'unpin' : 'pin')
                        }
                        className="rounded-[6px] border border-newTableBorder px-[7px] py-[4px] disabled:opacity-35"
                      >
                        {job.pinned ? 'Unpin' : 'Pin slot'}
                      </button>
                    )}
                    {['RETRYABLE_FAILURE', 'BLOCKED'].includes(job.state) && (
                      <button
                        disabled={Boolean(busy)}
                        onClick={() => mutateJob(job, 'retry')}
                        className="rounded-[6px] border border-blue-400/40 px-[7px] py-[4px] text-blue-200 disabled:opacity-35"
                      >
                        Retry item
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-[4px] text-[10px] opacity-75 [&_input]:h-[34px] [&_input]:rounded-[7px] [&_input]:border [&_input]:border-newTableBorder [&_input]:bg-transparent [&_input]:px-[7px] [&_select]:h-[34px] [&_select]:rounded-[7px] [&_select]:border [&_select]:border-newTableBorder [&_select]:bg-newBgColorInner [&_select]:px-[7px]">
      {label}
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] bg-white/5 p-[9px]">
      <div className="text-[9px] uppercase opacity-50">{label}</div>
      <div className="mt-[2px] text-[20px] font-[700]">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const good = state === 'READY';
  const bad = ['QUARANTINED', 'FINAL_FAILURE', 'FAILED', 'EXPIRED'].includes(
    state
  );
  return (
    <span
      className={clsx(
        'shrink-0 rounded-full px-[7px] py-[3px] text-[8px] font-[700]',
        good
          ? 'bg-emerald-500/15 text-emerald-300'
          : bad
          ? 'bg-red-500/15 text-red-300'
          : 'bg-blue-500/15 text-blue-200'
      )}
    >
      {state}
    </span>
  );
}
