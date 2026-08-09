'use client';

import React, { FC, Fragment, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@gitroom/react/form/button';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { Input } from '@gitroom/react/form/input';
import { FormProvider, useForm } from 'react-hook-form';
import { object, string } from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import copy from 'copy-to-clipboard';
import clsx from 'clsx';

const SCOPES = [
  '*',
  'posts:read',
  'posts:write',
  'media:write',
  'integrations:read',
  'integrations:write',
  'notifications:read',
  'video:write',
];

export const ApiKeysComponent: FC = () => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const list = useCallback(async () => {
    return (await fetch('/api-keys')).json();
  }, []);
  const { data, mutate } = useSWR('api-keys', list);

  const addKey = useCallback(() => {
    modal.openModal({
      title: t('create_api_key', 'Create API key'),
      withCloseButton: true,
      children: <CreateApiKey reload={mutate} />,
    });
  }, [t, mutate]);

  const revokeKey = useCallback(
    (key: any) => async () => {
      if (
        await deleteDialog(
          t(
            'revoke_api_key_confirm',
            `Revoke "${key.name}"? Requests using it will stop working immediately.`,
            { name: key.name }
          )
        )
      ) {
        await fetch(`/api-keys/${key.id}`, { method: 'DELETE' });
        mutate();
        toaster.show(t('api_key_revoked', 'API key revoked'), 'success');
      }
    },
    []
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('api_keys', 'API Keys')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'api_keys_description',
          'Scoped keys for the public API. The full key is shown once at creation and stored hashed - revoke and reissue if lost.'
        )}
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth items-center border rounded-[4px] p-[24px] flex gap-[24px]">
        <div className="flex flex-col w-full">
          {!!data?.length && (
            <div className="grid grid-cols-[2fr,1fr,2fr,1fr,1fr] w-full gap-y-[10px] items-center">
              <div>{t('name', 'Name')}</div>
              <div>{t('key', 'Key')}</div>
              <div>{t('scopes', 'Scopes')}</div>
              <div>{t('last_used', 'Last used')}</div>
              <div>{t('revoke', 'Revoke')}</div>
              {data?.map((p: any) => (
                <Fragment key={p.id}>
                  <div className={clsx(p.revokedAt && 'line-through opacity-50')}>
                    {p.name}
                  </div>
                  <div className="font-mono text-[12px]">{p.prefix}…</div>
                  <div className="text-[12px]">
                    {(JSON.parse(p.scopes || '[]') as string[]).join(', ')}
                  </div>
                  <div className="text-[12px]">
                    {p.lastUsedAt
                      ? new Date(p.lastUsedAt).toLocaleString()
                      : t('never', 'Never')}
                  </div>
                  <div>
                    {!p.revokedAt ? (
                      <Button onClick={revokeKey(p)}>
                        {t('revoke', 'Revoke')}
                      </Button>
                    ) : (
                      <span className="text-[12px] opacity-60">
                        {t('revoked', 'Revoked')}
                      </span>
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
          <div>
            <Button
              onClick={addKey}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('create_api_key', 'Create API key')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const details = object().shape({
  name: string().min(2).max(60).required(),
});

const CreateApiKey: FC<{ reload: () => void }> = ({ reload }) => {
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const [scopes, setScopes] = useState<string[]>(['*']);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(
    null
  );
  const form = useForm({
    resolver: yupResolver(details),
    values: { name: '' },
  });

  const toggleScope = useCallback(
    (scope: string) => () => {
      setScopes((current) => {
        if (scope === '*') {
          return ['*'];
        }
        const without = current.filter((s) => s !== '*');
        return without.includes(scope)
          ? without.filter((s) => s !== scope)
          : [...without, scope];
      });
    },
    []
  );

  const submit = useCallback(
    async (values: { name?: string }) => {
      const response = await (
        await fetch('/api-keys', {
          method: 'POST',
          body: JSON.stringify({ name: values.name, scopes }),
        })
      ).json();
      setCreated({ key: response.key, name: response.name });
      reload();
    },
    [scopes]
  );

  if (created) {
    return (
      <div className="flex flex-col gap-[16px]">
        <div>
          {t(
            'api_key_created_once',
            'Copy this key now - it is stored hashed and will never be shown again.'
          )}
        </div>
        <div className="flex items-center gap-[10px] bg-sixth border border-fifth rounded-[4px] p-[12px] font-mono text-[13px] break-all">
          {created.key}
        </div>
        <div className="flex gap-[10px]">
          <Button
            onClick={() => {
              copy(created.key);
              toaster.show(t('copied', 'Copied to clipboard'), 'success');
            }}
          >
            {t('copy', 'Copy')}
          </Button>
          <Button secondary={true} onClick={() => modal.closeAll()}>
            {t('done', 'Done')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="relative flex gap-[16px] flex-col flex-1 rounded-[4px] pt-0">
          <Input
            label="Name"
            translationKey="label_name"
            {...form.register('name')}
          />
          <div className="flex flex-col gap-[8px]">
            <div>{t('scopes', 'Scopes')}</div>
            <div className="flex flex-wrap gap-[8px]">
              {SCOPES.map((scope) => (
                <div
                  key={scope}
                  onClick={toggleScope(scope)}
                  className={clsx(
                    'cursor-pointer px-[10px] py-[6px] rounded-[4px] border text-[13px] select-none',
                    scopes.includes(scope)
                      ? 'border-fifth bg-forth'
                      : 'border-fifth bg-sixth opacity-60'
                  )}
                >
                  {scope === '*' ? t('full_access', 'Full access (*)') : scope}
                </div>
              ))}
            </div>
          </div>
          <div>
            <Button
              type="submit"
              className="mt-[8px]"
              disabled={!form.formState.isValid || !scopes.length}
            >
              {t('create', 'Create')}
            </Button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
};
