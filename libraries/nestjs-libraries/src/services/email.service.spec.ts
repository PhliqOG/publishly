import { EmailService } from './email.service';

describe('EmailService', () => {
  const originalProvider = process.env.EMAIL_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
    jest.restoreAllMocks();
  });

  it('does not contact Temporal when email is disabled', async () => {
    delete process.env.EMAIL_PROVIDER;
    const getRawClient = jest.fn();
    const service = new EmailService({
      client: { getRawClient },
    } as any);

    await service.sendEmail(
      'person@example.com',
      'Subject',
      '<p>Body</p>',
      'top'
    );

    expect(getRawClient).not.toHaveBeenCalled();
  });

  it('queues the workflow when an email provider is configured', async () => {
    process.env.EMAIL_PROVIDER = 'resend';
    const signalWithStart = jest.fn().mockResolvedValue(undefined);
    const getRawClient = jest.fn(() => ({ workflow: { signalWithStart } }));
    const service = new EmailService({
      client: { getRawClient },
    } as any);

    await service.sendEmail(
      'person@example.com',
      'Subject',
      '<p>Body</p>',
      'top'
    );

    expect(getRawClient).toHaveBeenCalledTimes(1);
    expect(signalWithStart).toHaveBeenCalledTimes(1);
  });
});
