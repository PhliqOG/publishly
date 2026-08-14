'use client';

import React, {
  FC,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { Textarea } from '@gitroom/react/form/textarea';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

type InboxChannel = {
  id: string;
  name: string;
  picture?: string;
  providerIdentifier: string;
  supportsInbox: boolean;
  supportsReplies: boolean;
  supportsDirectMessages: boolean;
  supportsDirectMessageReplies: boolean;
};

type InboxWorkflow = {
  isRead: boolean;
  resolved: boolean;
  assignedUserId: string | null;
  assignedUser?: { id: string; name?: string; email: string } | null;
  internalNote: string;
};

type InboxComment = {
  id: string;
  postId?: string;
  releaseURL?: string;
  author: { name: string; username?: string; picture?: string };
  message: string;
  createdAt: string;
  workflow: InboxWorkflow;
};

type InboxDirectMessage = {
  id: string;
  threadId: string;
  recipientId: string;
  author: { id?: string; name: string; username?: string; picture?: string };
  message: string;
  createdAt: string;
  direction: 'inbound' | 'outbound';
  replyAllowed: boolean;
  windowExpiresAt?: string;
  unsupported?: boolean;
  workflow: InboxWorkflow;
};

type TeamMember = {
  role: 'SUPERADMIN' | 'ADMIN' | 'USER';
  user: { id: string; email: string };
};

const useInboxChannels = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/inbox/channels')).json();
  }, []);
  return useSWR<InboxChannel[]>('inbox-channels', load);
};

const useInboxComments = (
  integrationId: string | null,
  search: string,
  status: string,
  assignedTo: string
) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    if (!integrationId) {
      return null;
    }
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (assignedTo) params.set('assignedTo', assignedTo);
    const response = await fetch(
      `/inbox/${integrationId}${params.size ? `?${params}` : ''}`
    );
    if (!response.ok) {
      throw new Error('inbox-load-failed');
    }
    return response.json();
  }, [integrationId, search, status, assignedTo]);
  return useSWR<{ comments: InboxComment[] } | null>(
    integrationId
      ? ['inbox-comments', integrationId, search, status, assignedTo]
      : null,
    load,
    { refreshInterval: 15_000 }
  );
};

const useInboxDirectMessages = (
  integrationId: string | null,
  search: string,
  status: string,
  assignedTo: string
) => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    if (!integrationId) return null;
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (assignedTo) params.set('assignedTo', assignedTo);
    const response = await fetch(
      `/inbox/${integrationId}/messages${params.size ? `?${params}` : ''}`
    );
    if (!response.ok) throw new Error('inbox-messages-load-failed');
    return response.json();
  }, [integrationId, search, status, assignedTo]);
  return useSWR<{ messages: InboxDirectMessage[] } | null>(
    integrationId
      ? ['inbox-direct-messages', integrationId, search, status, assignedTo]
      : null,
    load,
    { refreshInterval: 15_000 }
  );
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const InboxComponent: FC = () => {
  const t = useT();
  const { data: channels, isLoading } = useInboxChannels();
  const [selected, setSelected] = useState<string | null>(null);

  const selectedChannel = useMemo(
    () => channels?.find((c) => c.id === selected) || null,
    [channels, selected]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <h1 className="text-[24px]">{t('inbox', 'Inbox')}</h1>
      {isLoading && (
        <div className="text-customColor18">{t('loading', 'Loading...')}</div>
      )}
      {!isLoading && !channels?.length && (
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-customColor18">
          {t(
            'inbox_no_channels',
            'Connect a channel first - comments or messages appear only when the network provides an official API.'
          )}
        </div>
      )}
      {!!channels?.length && (
        <div className="flex gap-[16px]">
          <div className="flex flex-col gap-[8px] min-w-[240px]">
            {channels.map((channel) => (
              <div
                key={channel.id}
                onClick={() =>
                  channel.supportsInbox || channel.supportsDirectMessages
                    ? setSelected(channel.id)
                    : undefined
                }
                title={
                  channel.supportsInbox || channel.supportsDirectMessages
                    ? channel.name
                    : t(
                        'inbox_unsupported_tooltip',
                        'This network does not provide an approved comments or messages path in the current build.'
                      )
                }
                className={clsx(
                  'flex items-center gap-[10px] p-[12px] rounded-[4px] border border-fifth',
                  channel.supportsInbox || channel.supportsDirectMessages
                    ? 'cursor-pointer bg-sixth hover:bg-forth'
                    : 'opacity-40 cursor-not-allowed bg-sixth',
                  selected === channel.id && 'bg-forth'
                )}
              >
                {!!channel.picture && (
                  <img
                    src={channel.picture}
                    alt=""
                    className="w-[24px] h-[24px] rounded-full"
                  />
                )}
                <div className="flex flex-col">
                  <div className="text-[14px]">{channel.name}</div>
                  <div className="text-[11px] text-customColor18">
                    {channel.providerIdentifier}
                    {!channel.supportsInbox &&
                      !channel.supportsDirectMessages &&
                      ' - ' + t('inbox_not_available', 'not available yet')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex-1">
            {!selectedChannel && (
              <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-customColor18">
                {t(
                  'inbox_pick_channel',
                  'Pick a channel on the left to open its official inbox data.'
                )}
              </div>
            )}
            {!!selectedChannel && (
              <InboxChannelView
                key={selectedChannel.id}
                channel={selectedChannel}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const InboxChannelView: FC<{ channel: InboxChannel }> = ({ channel }) => {
  const t = useT();
  const [view, setView] = useState<'comments' | 'messages'>(
    channel.supportsInbox ? 'comments' : 'messages'
  );
  return (
    <div className="flex flex-col gap-[12px]">
      {channel.supportsInbox && channel.supportsDirectMessages && (
        <div className="flex gap-[8px]">
          <button
            type="button"
            onClick={() => setView('comments')}
            className={clsx(
              'rounded-[6px] px-[12px] py-[8px] text-[13px]',
              view === 'comments' ? 'bg-btnSimple' : 'bg-sixth'
            )}
          >
            {t('comments', 'Comments')}
          </button>
          <button
            type="button"
            onClick={() => setView('messages')}
            className={clsx(
              'rounded-[6px] px-[12px] py-[8px] text-[13px]',
              view === 'messages' ? 'bg-btnSimple' : 'bg-sixth'
            )}
          >
            {t('direct_messages', 'Direct messages')}
          </button>
        </div>
      )}
      {view === 'comments' && channel.supportsInbox ? (
        <CommentsList channel={channel} />
      ) : (
        <DirectMessagesList channel={channel} />
      )}
    </div>
  );
};

const CommentsList: FC<{ channel: InboxChannel }> = ({ channel }) => {
  const t = useT();
  const fetch = useFetch();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState('open');
  const [assignedTo, setAssignedTo] = useState('');
  const { data: team } = useSWR<TeamMember[]>('inbox-team', async () => {
    return (await (await fetch('/settings/team')).json()).users;
  });
  const { data, error, isLoading, mutate } = useInboxComments(
    channel.id,
    deferredSearch,
    status,
    assignedTo
  );
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const filters = (
    <div className="grid gap-[8px] tablet:grid-cols-[minmax(180px,1fr),160px,220px]">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('search_comments', 'Search comments')}
        className="h-[40px] rounded-[6px] border border-fifth bg-sixth px-[12px] text-[13px] outline-none focus:border-boxFocused"
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-[40px] rounded-[6px] border border-fifth bg-sixth px-[10px] text-[13px]"
      >
        <option value="open">{t('open', 'Open')}</option>
        <option value="unread">{t('unread', 'Unread')}</option>
        <option value="resolved">{t('resolved', 'Resolved')}</option>
        <option value="">{t('all', 'All')}</option>
      </select>
      <select
        value={assignedTo}
        onChange={(event) => setAssignedTo(event.target.value)}
        className="h-[40px] rounded-[6px] border border-fifth bg-sixth px-[10px] text-[13px]"
      >
        <option value="">{t('all_assignees', 'All assignees')}</option>
        {(team || []).map((member) => (
          <option key={member.user.id} value={member.user.id}>
            {member.user.email}
          </option>
        ))}
      </select>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[12px]">
        {filters}
        <div className="text-customColor18">{t('loading', 'Loading...')}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-[12px]">
        {filters}
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-customColor18">
          {t(
            'inbox_load_error',
            'Could not load comments from the platform. Try again in a moment.'
          )}
        </div>
      </div>
    );
  }
  if (!data?.comments?.length) {
    return (
      <div className="flex flex-col gap-[12px]">
        {filters}
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-customColor18">
          {t('inbox_empty', 'No comments match these filters.')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {filters}
      {data.comments.map((comment) => (
        <div
          key={comment.id}
          className={clsx(
            'bg-sixth border border-fifth rounded-[4px] p-[16px] flex flex-col gap-[8px]',
            !comment.workflow.isRead && 'border-s-[3px] border-s-boxFocused'
          )}
        >
          <div className="flex items-center gap-[10px]">
            {!!comment.author.picture && (
              <img
                src={comment.author.picture}
                alt=""
                className="w-[28px] h-[28px] rounded-full"
              />
            )}
            <div className="flex flex-col">
              <div className="text-[14px]">{comment.author.name}</div>
              {!!comment.author.username && (
                <div className="text-[11px] text-customColor18">
                  @{comment.author.username}
                </div>
              )}
            </div>
            <div className="ms-auto text-[11px] text-customColor18">
              {relativeTime(comment.createdAt)}
            </div>
          </div>
          <div className="text-[14px] whitespace-pre-wrap">
            {comment.message}
          </div>
          <div className="flex items-center gap-[12px]">
            {!!comment.releaseURL && (
              <a
                href={comment.releaseURL}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] underline text-customColor18"
              >
                {t('inbox_view_post', 'View post')}
              </a>
            )}
            {channel.supportsReplies && (
              <div
                className="text-[12px] underline cursor-pointer text-customColor18"
                onClick={() =>
                  setReplyTo(replyTo === comment.id ? null : comment.id)
                }
              >
                {t('reply', 'Reply')}
              </div>
            )}
          </div>
          {replyTo === comment.id && (
            <ReplyComposer
              channelId={channel.id}
              commentId={comment.id}
              postId={comment.postId}
              onDone={() => {
                setReplyTo(null);
                mutate();
              }}
            />
          )}
          <InboxWorkflowControls
            channelId={channel.id}
            item={comment}
            team={team || []}
            onChanged={() => mutate()}
          />
        </div>
      ))}
    </div>
  );
};

const DirectMessagesList: FC<{ channel: InboxChannel }> = ({ channel }) => {
  const t = useT();
  const fetch = useFetch();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState('open');
  const [assignedTo, setAssignedTo] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const { data: team } = useSWR<TeamMember[]>('inbox-team', async () => {
    return (await (await fetch('/settings/team')).json()).users;
  });
  const { data, error, isLoading, mutate } = useInboxDirectMessages(
    channel.id,
    deferredSearch,
    status,
    assignedTo
  );

  const filters = (
    <div className="grid gap-[8px] tablet:grid-cols-[minmax(180px,1fr),160px,220px]">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('search_direct_messages', 'Search direct messages')}
        className="h-[40px] rounded-[6px] border border-fifth bg-sixth px-[12px] text-[13px] outline-none focus:border-boxFocused"
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="h-[40px] rounded-[6px] border border-fifth bg-sixth px-[10px] text-[13px]"
      >
        <option value="open">{t('open', 'Open')}</option>
        <option value="unread">{t('unread', 'Unread')}</option>
        <option value="resolved">{t('resolved', 'Resolved')}</option>
        <option value="">{t('all', 'All')}</option>
      </select>
      <select
        value={assignedTo}
        onChange={(event) => setAssignedTo(event.target.value)}
        className="h-[40px] rounded-[6px] border border-fifth bg-sixth px-[10px] text-[13px]"
      >
        <option value="">{t('all_assignees', 'All assignees')}</option>
        {(team || []).map((member) => (
          <option key={member.user.id} value={member.user.id}>
            {member.user.email}
          </option>
        ))}
      </select>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[12px]">
        {filters}
        <div className="text-customColor18">{t('loading', 'Loading...')}</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col gap-[12px]">
        {filters}
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-customColor18">
          {t(
            'inbox_messages_load_error',
            'Could not load Instagram messages. Try again in a moment.'
          )}
        </div>
      </div>
    );
  }
  if (!data?.messages?.length) {
    return (
      <div className="flex flex-col gap-[12px]">
        {filters}
        <div className="bg-sixth border border-fifth rounded-[4px] p-[24px] text-customColor18">
          {t('inbox_messages_empty', 'No direct messages match these filters.')}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]">
      {filters}
      <div className="text-[12px] text-customColor18">
        {t(
          'instagram_dm_policy',
          "Instagram replies are available only after the customer starts the conversation and while Meta's 24-hour response window is open."
        )}
      </div>
      {data.messages.map((message) => (
        <div
          key={message.id}
          className={clsx(
            'bg-sixth border border-fifth rounded-[4px] p-[16px] flex flex-col gap-[8px]',
            !message.workflow.isRead && 'border-s-[3px] border-s-boxFocused'
          )}
        >
          <div className="flex items-center gap-[10px]">
            {!!message.author.picture && (
              <img
                src={message.author.picture}
                alt=""
                className="w-[28px] h-[28px] rounded-full"
              />
            )}
            <div className="flex flex-col">
              <div className="text-[14px]">{message.author.name}</div>
              <div className="text-[11px] text-customColor18">
                {message.direction === 'outbound'
                  ? t('sent_by_business', 'Sent by your business')
                  : t('received_from_customer', 'Received from customer')}
              </div>
            </div>
            <div className="ms-auto text-[11px] text-customColor18">
              {relativeTime(message.createdAt)}
            </div>
          </div>
          <div className="text-[14px] whitespace-pre-wrap">
            {message.message}
          </div>
          {message.direction === 'inbound' &&
            channel.supportsDirectMessageReplies && (
              <div>
                {message.replyAllowed && !message.unsupported ? (
                  <button
                    type="button"
                    className="text-[12px] underline text-customColor18"
                    onClick={() =>
                      setReplyTo(replyTo === message.id ? null : message.id)
                    }
                  >
                    {t('reply', 'Reply')}
                  </button>
                ) : (
                  <span className="text-[11px] text-customColor18">
                    {t(
                      'instagram_reply_window_closed',
                      'Reply unavailable: the response window is closed.'
                    )}
                  </span>
                )}
              </div>
            )}
          {replyTo === message.id && (
            <DirectMessageReplyComposer
              channelId={channel.id}
              threadId={message.threadId}
              recipientId={message.recipientId}
              onDone={() => {
                setReplyTo(null);
                mutate();
              }}
            />
          )}
          <InboxWorkflowControls
            channelId={channel.id}
            item={message}
            team={team || []}
            onChanged={() => mutate()}
          />
        </div>
      ))}
    </div>
  );
};

const InboxWorkflowControls: FC<{
  channelId: string;
  item: { id: string; workflow: InboxWorkflow };
  team: TeamMember[];
  onChanged: () => void;
}> = ({ channelId, item, team, onChanged }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const [note, setNote] = useState(item.workflow.internalNote || '');
  const [saving, setSaving] = useState(false);

  const patchState = useCallback(
    async (patch: Record<string, unknown>) => {
      setSaving(true);
      try {
        const response = await fetch(
          `/inbox/${channelId}/${encodeURIComponent(item.id)}/state`,
          { method: 'POST', body: JSON.stringify(patch) }
        );
        if (!response.ok) throw new Error('state-update-failed');
        onChanged();
      } catch {
        toaster.show(
          t('inbox_state_failed', 'Could not update the inbox item'),
          'warning'
        );
      } finally {
        setSaving(false);
      }
    },
    [channelId, item.id, onChanged, fetch, toaster, t]
  );

  return (
    <div className="mt-[6px] flex flex-col gap-[8px] rounded-[6px] border border-fifth bg-newBgColorInner p-[10px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <button
          type="button"
          disabled={saving}
          onClick={() => patchState({ read: !item.workflow.isRead })}
          className="rounded-[5px] bg-btnSimple px-[10px] py-[6px] text-[12px]"
        >
          {item.workflow.isRead
            ? t('mark_unread', 'Mark unread')
            : t('mark_read', 'Mark read')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            patchState({ resolved: !item.workflow.resolved, read: true })
          }
          className="rounded-[5px] bg-btnSimple px-[10px] py-[6px] text-[12px]"
        >
          {item.workflow.resolved
            ? t('reopen', 'Reopen')
            : t('resolve', 'Resolve')}
        </button>
        <select
          aria-label={t('assign_to', 'Assign to')}
          value={item.workflow.assignedUserId || ''}
          disabled={saving}
          onChange={(event) =>
            patchState({ assignedUserId: event.target.value || null })
          }
          className="h-[31px] min-w-[180px] rounded-[5px] border border-fifth bg-sixth px-[8px] text-[12px]"
        >
          <option value="">{t('unassigned', 'Unassigned')}</option>
          {team.map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.email}
            </option>
          ))}
        </select>
        {item.workflow.resolved && (
          <span className="text-[11px] text-emerald-400">
            {t('resolved', 'Resolved')}
          </span>
        )}
      </div>
      <div className="flex items-end gap-[8px]">
        <div className="flex-1">
          <Textarea
            label={t('internal_note', 'Internal note')}
            name={`note-${item.id}`}
            disableForm={true}
            value={note}
            onChange={(event: any) => setNote(event.target.value)}
            placeholder={t(
              'inbox_note_placeholder',
              'Visible only to workspace members'
            )}
          />
        </div>
        <button
          type="button"
          disabled={saving || note === (item.workflow.internalNote || '')}
          onClick={() => patchState({ internalNote: note || null })}
          className="mb-[2px] rounded-[5px] bg-btnSimple px-[12px] py-[7px] text-[12px] disabled:opacity-40"
        >
          {saving ? t('saving', 'Saving...') : t('save_note', 'Save note')}
        </button>
      </div>
    </div>
  );
};

const ReplyComposer: FC<{
  channelId: string;
  commentId: string;
  postId?: string;
  onDone: () => void;
}> = ({ channelId, commentId, postId, onDone }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    if (!message.trim()) {
      return;
    }
    setSending(true);
    try {
      const response = await fetch(`/inbox/${channelId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ commentId, message, postId }),
      });
      if (!response.ok) {
        throw new Error('reply-failed');
      }
      toaster.show(t('inbox_reply_sent', 'Reply sent'), 'success');
      onDone();
    } catch {
      toaster.show(
        t('inbox_reply_failed', 'The platform rejected the reply'),
        'warning'
      );
    } finally {
      setSending(false);
    }
  }, [message, channelId, commentId, postId]);

  return (
    <div className="flex flex-col gap-[8px] mt-[4px]">
      <Textarea
        label=""
        name="reply"
        disableForm={true}
        value={message}
        onChange={(e: any) => setMessage(e.target.value)}
        placeholder={t('inbox_reply_placeholder', 'Write a reply...')}
      />
      <div>
        <Button onClick={send} disabled={sending || !message.trim()}>
          {sending ? t('sending', 'Sending...') : t('send_reply', 'Send reply')}
        </Button>
      </div>
    </div>
  );
};

const DirectMessageReplyComposer: FC<{
  channelId: string;
  threadId: string;
  recipientId: string;
  onDone: () => void;
}> = ({ channelId, threadId, recipientId, onDone }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      const response = await fetch(`/inbox/${channelId}/messages/reply`, {
        method: 'POST',
        body: JSON.stringify({ threadId, recipientId, message: trimmed }),
      });
      if (!response.ok) throw new Error('direct-message-reply-failed');
      toaster.show(t('inbox_message_sent', 'Message sent'), 'success');
      onDone();
    } catch {
      toaster.show(
        t(
          'inbox_message_failed',
          'Instagram rejected the message. The response window may have closed.'
        ),
        'warning'
      );
    } finally {
      setSending(false);
    }
  }, [message, channelId, threadId, recipientId, fetch, toaster, t, onDone]);

  return (
    <div className="flex flex-col gap-[8px] mt-[4px]">
      <Textarea
        label=""
        name={`dm-reply-${threadId}`}
        disableForm={true}
        value={message}
        onChange={(event: any) =>
          setMessage(String(event.target.value).slice(0, 1000))
        }
        placeholder={t('inbox_message_placeholder', 'Write a message...')}
      />
      <div className="flex items-center gap-[10px]">
        <Button onClick={send} disabled={sending || !message.trim()}>
          {sending ? t('sending', 'Sending...') : t('send_reply', 'Send reply')}
        </Button>
        <span className="text-[11px] text-customColor18">
          {message.length}/1000
        </span>
      </div>
    </div>
  );
};
