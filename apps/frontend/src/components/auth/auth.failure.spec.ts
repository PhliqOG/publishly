import {
  authNetworkFailure,
  readAuthFailure,
} from '@gitroom/frontend/components/auth/auth.failure';

describe('authentication failure messages', () => {
  it('preserves a concrete reason returned by the API', async () => {
    await expect(
      readAuthFailure(
        { status: 400, text: async () => 'Invalid user name or password' },
        'Sign in failed'
      )
    ).resolves.toBe('Invalid user name or password');
  });

  it('supplies a reason when the API returns an empty body', async () => {
    await expect(
      readAuthFailure(
        { status: 503, text: async () => '   ' },
        'Sign in failed'
      )
    ).resolves.toBe('Sign in failed (HTTP 503).');
  });

  it('supplies a reason when the response body cannot be read', async () => {
    await expect(
      readAuthFailure(
        {
          status: 502,
          text: async () => {
            throw new Error('socket closed');
          },
        },
        'Account creation failed'
      )
    ).resolves.toBe('Account creation failed (HTTP 502).');
  });

  it('explains network failures instead of leaving a spinner running', () => {
    expect(authNetworkFailure('sign in')).toContain('API could not be reached');
    expect(authNetworkFailure('create your account')).toContain(
      'API could not be reached'
    );
  });
});
