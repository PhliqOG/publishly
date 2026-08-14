const {
  containsPublicPlaceholder,
  headerPolicyIssues,
  isTemplateValue,
  normalizeOrigin,
  redactNetworkError,
  validateHealthBody,
  validateStatusBody,
} = require('../../../../scripts/live-launch-audit.lib.cjs');
const {
  parseArgs,
  usage,
} = require('../../../../scripts/audit-live-launch.cjs');
const {
  normalizeVerifierDatabaseUrl,
  parseArgs: parseSignupArgs,
} = require('../../../../scripts/verify-public-signup.cjs');

describe('live launch audit policy', () => {
  it('normalizes only pathless HTTPS production origins', () => {
    expect(normalizeOrigin('publishlyapi.com')).toBe('https://publishlyapi.com');
    expect(normalizeOrigin('https://publishlyapi.com')).toBe(
      'https://publishlyapi.com'
    );
    expect(() => normalizeOrigin('http://publishlyapi.com')).toThrow('HTTPS');
    expect(() => normalizeOrigin('https://publishlyapi.com/private')).toThrow(
      'must not include'
    );
    expect(() => normalizeOrigin('https://publishlyapi.com?token=unsafe')).toThrow(
      'must not include'
    );
  });

  it('detects launch placeholders without flagging ordinary legal prose', () => {
    expect(
      containsPublicPlaceholder(
        'Configure NEXT_PUBLIC_LEGAL_ENTITY_ADDRESS before deployment'
      )
    ).toBe(true);
    expect(containsPublicPlaceholder('Support details published at launch')).toBe(
      true
    );
    expect(
      containsPublicPlaceholder(
        'Publishly processes authorized business-account data under this policy.'
      )
    ).toBe(false);
  });

  it('recognizes template environment values', () => {
    expect(isTemplateValue('https://github.com/CHANGE_ME_ORG/publishly')).toBe(
      true
    );
    expect(isTemplateValue('https://media.publishlyapi.com')).toBe(false);
  });

  it('requires semantic health and status JSON', () => {
    expect(
      validateHealthBody(
        JSON.stringify({
          status: 'ok',
          checks: { database: true, redis: true },
        })
      )
    ).toBe(true);
    expect(
      validateHealthBody(
        JSON.stringify({
          status: 'ok',
          checks: { database: true, redis: false },
        })
      )
    ).toBe(false);
    expect(validateStatusBody('{"services":[]}')).toBe(true);
    expect(validateStatusBody('<html>not json</html>')).toBe(false);
  });

  it('reports missing browser-security headers', () => {
    const good = new Headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'strict-transport-security': 'max-age=31536000',
      'content-security-policy': "frame-ancestors 'none'",
    });
    expect(headerPolicyIssues(good)).toEqual([]);
    expect(headerPolicyIssues(new Headers())).toHaveLength(5);
  });

  it('redacts sensitive query values from network errors', () => {
    const redacted = redactNetworkError(
      new Error('GET https://example.test/?hub.verify_token=top-secret&x=1')
    );
    expect(redacted).not.toContain('top-secret');
    expect(redacted).toContain('<redacted>');
  });

  it('selects either a production env file or the deployed process environment', () => {
    expect(parseArgs(['--process-env', '--json'])).toMatchObject({
      processEnv: true,
      json: true,
    });
    expect(parseArgs(['--env', 'C:/secure/publishly.env'])).toMatchObject({
      processEnv: false,
      envFile: 'C:/secure/publishly.env',
    });
    expect(() =>
      parseArgs(['--process-env', '--env', 'C:/secure/publishly.env'])
    ).toThrow('mutually exclusive');
    expect(usage()).toContain('--process-env');
  });

  it('keeps the public signup verifier on the API database endpoint', () => {
    const localEnvironment = {
      DATABASE_URL: 'postgresql://user:password@localhost:5433/publishly',
    };
    normalizeVerifierDatabaseUrl(localEnvironment);
    expect(new URL(localEnvironment.DATABASE_URL).hostname).toBe('127.0.0.1');

    const deployedEnvironment = {
      DATABASE_URL: 'postgresql://user:password@postgres:5432/publishly',
    };
    normalizeVerifierDatabaseUrl(deployedEnvironment);
    expect(new URL(deployedEnvironment.DATABASE_URL).hostname).toBe('postgres');
    expect(parseSignupArgs(['--origin', 'https://publishlyapi.com'])).toEqual({
      origin: 'https://publishlyapi.com',
    });
  });
});
