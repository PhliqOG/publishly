import {
  PostValidationException,
  PostValidationExceptionFilter,
} from './posts.validation.exception';

describe('PostValidationExceptionFilter', () => {
  it('returns machine and human failure details together', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const filter = new PostValidationExceptionFilter();
    const exception = new PostValidationException({
      provider: 'tiktok',
      name: 'Creator',
      error: 'TikTok allows only private posts.',
      failureClass: 'user_action_needed',
      code: 'tiktok_self_only_unaudited',
      reason: 'TikTok allows only private posts.',
    });

    filter.catch(exception, {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as any);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      provider: 'tiktok',
      name: 'Creator',
      failureClass: 'user_action_needed',
      code: 'tiktok_self_only_unaudited',
      reason: 'TikTok allows only private posts.',
      message: 'TikTok allows only private posts.',
    });
  });
});
