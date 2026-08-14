import { FacebookProvider } from './social/facebook.provider';
import { InstagramProvider } from './social/instagram.provider';
import { InstagramStandaloneProvider } from './social/instagram.standalone.provider';

const integration = {
  id: 'integration-1',
  internalId: 'account-1',
  organizationId: 'org-1',
} as any;

describe('Meta inbox adapters', () => {
  it('normalizes Facebook comments without putting the token in the URL', async () => {
    const provider = new FacebookProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'comment-1',
              message: 'hello',
              created_time: '2026-01-01T00:00:00Z',
              from: { id: 'user-1', name: 'A User' },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const result = await provider.listComments('secret-token', integration, {
      postId: 'post-1',
    });
    expect(result.comments[0]).toMatchObject({
      id: 'comment-1',
      postId: 'post-1',
      message: 'hello',
      author: { name: 'A User', username: 'user-1' },
    });
    expect(fetchSpy.mock.calls[0][0]).not.toContain('secret-token');
    expect((fetchSpy.mock.calls[0][1] as any).headers.Authorization).toBe(
      'Bearer secret-token'
    );
  });

  it('uses the official Instagram replies edge', async () => {
    const provider = new InstagramProvider();
    const fetchSpy = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'reply-1' }), { status: 200 })
      );

    await expect(
      provider.replyToComment(
        'ig-token___user-token',
        integration,
        'comment-1',
        'Thanks!'
      )
    ).resolves.toEqual({ id: 'reply-1' });
    expect(fetchSpy.mock.calls[0][0]).toContain('/comment-1/replies');
    expect((fetchSpy.mock.calls[0][1] as any).body).toBe('message=Thanks%21');
  });

  it('normalizes Instagram conversations and exposes the 24-hour reply window', async () => {
    const provider = new InstagramProvider();
    const recent = new Date(Date.now() - 60_000).toISOString();
    const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'thread-1',
              participants: {
                data: [
                  { id: 'account-1', name: 'Publishly Test' },
                  { id: 'igsid-1', name: 'Customer' },
                ],
              },
              messages: {
                data: [
                  {
                    id: 'message-1',
                    message: 'Can you help?',
                    created_time: recent,
                    from: { id: 'igsid-1', name: 'Customer' },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    const result = await provider.listDirectMessages(
      'secret-token',
      integration,
      {}
    );
    expect(result.messages[0]).toMatchObject({
      id: 'message-1',
      threadId: 'thread-1',
      recipientId: 'igsid-1',
      direction: 'inbound',
      replyAllowed: true,
      message: 'Can you help?',
    });
    expect(fetchSpy.mock.calls[0][0]).toContain(
      '/account-1/conversations?platform=instagram'
    );
    expect(fetchSpy.mock.calls[0][0]).not.toContain('secret-token');
    expect((fetchSpy.mock.calls[0][1] as any).headers.Authorization).toBe(
      'Bearer secret-token'
    );
  });

  it('validates the participant and response window before sending a DM', async () => {
    const provider = new InstagramProvider();
    const fetchSpy = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            participants: {
              data: [{ id: 'account-1' }, { id: 'igsid-1' }],
            },
            messages: {
              data: [
                {
                  id: 'incoming-1',
                  created_time: new Date(Date.now() - 60_000).toISOString(),
                  from: { id: 'igsid-1' },
                },
              ],
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message_id: 'sent-1' }), {
          status: 200,
        })
      );

    await expect(
      provider.sendDirectMessage(
        'secret-token',
        integration,
        'thread-1',
        'igsid-1',
        'Thanks'
      )
    ).resolves.toEqual({ id: 'sent-1' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toContain('/account-1/messages');
    expect(JSON.parse((fetchSpy.mock.calls[1][1] as any).body)).toEqual({
      recipient: { id: 'igsid-1' },
      message: { text: 'Thanks' },
    });
  });

  it('uses graph.instagram.com for standalone comments and messaging', async () => {
    const provider = new InstagramStandaloneProvider();
    const commentsSpy = jest
      .spyOn(InstagramProvider.prototype, 'listComments')
      .mockResolvedValue({ comments: [] });
    const messagesSpy = jest
      .spyOn(InstagramProvider.prototype, 'listDirectMessages')
      .mockResolvedValue({ messages: [] });

    await provider.listComments('token', integration, {});
    await provider.listDirectMessages('token', integration, {});

    expect(commentsSpy.mock.calls[0][3]).toBe('graph.instagram.com');
    expect(messagesSpy.mock.calls[0][3]).toBe('graph.instagram.com');
    expect(provider.scopes).toContain('instagram_business_manage_messages');
  });
});
