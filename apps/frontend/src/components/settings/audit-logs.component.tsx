'use client';

import React, { Fragment, FC, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const AuditLogsComponent: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const [page, setPage] = useState(1);
  const list = useCallback(async () => {
    return (await fetch(`/audit-logs?page=${page}`)).json();
  }, [page]);
  const { data } = useSWR(`audit-logs-${page}`, list);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('audit_log', 'Audit log')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'audit_log_description',
          'Security-relevant actions in this workspace: who did what, when, and from where.'
        )}
      </div>
      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
        {!data?.logs?.length ? (
          <div className="opacity-70">
            {t(
              'audit_log_empty',
              'Nothing here yet. Actions like API key creation, member changes and channel connections will appear as they happen.'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[1.4fr,1.6fr,1.2fr,2fr,1fr] gap-y-[10px] gap-x-[8px] text-[13px] items-center">
            <div className="font-[600]">{t('when', 'When')}</div>
            <div className="font-[600]">{t('who', 'Who')}</div>
            <div className="font-[600]">{t('action', 'Action')}</div>
            <div className="font-[600]">{t('details', 'Details')}</div>
            <div className="font-[600]">{t('ip', 'IP')}</div>
            {data.logs.map((log: any) => {
              const meta =
                log.metadata && log.metadata !== '{}' ? log.metadata : '';
              const compact =
                meta.length > 60 ? meta.slice(0, 57) + '…' : meta;
              return (
                <Fragment key={log.id}>
                  <div>{new Date(log.createdAt).toLocaleString()}</div>
                  <div className="truncate" title={log.user?.email || log.actorType}>
                    {log.user?.email || log.actorType}
                  </div>
                  <div className="font-mono text-[12px]">{log.action}</div>
                  <div className="font-mono text-[11px] truncate" title={meta}>
                    {log.targetType ? `${log.targetType}:${log.targetId || ''} ` : ''}
                    {compact}
                  </div>
                  <div className="text-[12px]">{log.ip || '-'}</div>
                </Fragment>
              );
            })}
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex gap-[10px] items-center">
            <Button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('previous', 'Previous')}
            </Button>
            <div className="text-[13px]">
              {page} / {totalPages}
            </div>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next', 'Next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
