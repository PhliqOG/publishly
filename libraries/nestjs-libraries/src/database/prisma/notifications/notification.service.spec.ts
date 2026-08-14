import { NotificationService } from './notification.service';

describe('NotificationService digest failure handling', () => {
  const users = {
    users: [
      {
        user: {
          email: 'operator@example.test',
          sendSuccessEmails: true,
          sendFailureEmails: true,
        },
      },
    ],
  };

  function makeService(workflow: unknown, emailFailure?: Error) {
    const notifications = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notice-1' }),
    };
    const email = {
      sendEmail: emailFailure
        ? jest.fn().mockRejectedValue(emailFailure)
        : jest.fn().mockResolvedValue(undefined),
      hasProvider: jest.fn(() => true),
    };
    const organizations = {
      getAllUsersOrgs: jest.fn().mockResolvedValue(users),
    };
    const signalWithStart = jest.fn().mockImplementation(() => workflow);
    const temporal = {
      client: {
        getRawClient: jest.fn(() =>
          workflow === undefined ? undefined : { workflow: { signalWithStart } }
        ),
      },
    };
    return {
      service: new NotificationService(
        notifications as any,
        email as any,
        organizations as any,
        temporal as any
      ),
      notifications,
      email,
      signalWithStart,
    };
  }

  it('falls back to immediate email when the digest scheduler is unavailable', async () => {
    const { service, notifications, email } = makeService(undefined);

    await expect(
      service.inAppNotification(
        'org-1',
        'Reconnect YouTube',
        'The token was revoked.',
        true,
        true,
        'fail'
      )
    ).resolves.toBeUndefined();

    expect(notifications.createNotification).toHaveBeenCalledWith(
      'org-1',
      'The token was revoked.'
    );
    expect(email.sendEmail).toHaveBeenCalledWith(
      'operator@example.test',
      'Reconnect YouTube',
      'The token was revoked.',
      'top',
      undefined
    );
  });

  it('uses the durable digest and does not send a duplicate immediate email', async () => {
    const { service, email, signalWithStart } = makeService({
      workflowId: 'digest-1',
    });

    await service.inAppNotification(
      'org-1',
      'Subject',
      'Message',
      true,
      true,
      'fail'
    );

    expect(signalWithStart).toHaveBeenCalledTimes(1);
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('surfaces fallback email failure for durable caller retry', async () => {
    const { service } = makeService(
      undefined,
      new Error('email provider unavailable')
    );

    await expect(
      service.inAppNotification(
        'org-1',
        'Subject',
        'Message',
        true,
        true,
        'fail'
      )
    ).rejects.toThrow('email provider unavailable');
  });
});
