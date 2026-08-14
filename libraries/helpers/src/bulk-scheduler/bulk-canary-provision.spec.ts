const {
  ProvisionError,
  REQUIRED_SCOPES,
  apiRequest,
  collectForbiddenIds,
  graphRequest,
  operatorEnvironment,
  seal,
  validateProviderSnapshot,
} = require('../../../../scripts/provision-bulk-canary.cjs');

function snapshot(overrides: Record<string, any> = {}) {
  return {
    permissions: {
      data: REQUIRED_SCOPES.map((permission: string) => ({
        permission,
        status: 'granted',
      })),
    },
    page: {
      id: 'page-test-1',
      name: 'Publishly Canary Page',
      access_token: 'page-secret',
      instagram_business_account: { id: 'ig-test-1' },
    },
    instagram: {
      id: 'ig-test-1',
      username: 'publishly_canary',
      name: 'Publishly Canary',
      account_type: 'BUSINESS',
    },
    publishingLimit: { data: [{ quota_usage: 0, config: { quota_total: 100 } }] },
    ...overrides,
  };
}

const expected = {
  pageId: 'page-test-1',
  instagramId: 'ig-test-1',
  label: 'Publishly Canary',
};

describe('Bulk Scheduler real-provider provisioning', () => {
  it('accepts an exact professional test destination with publishing scope and quota readback', () => {
    expect(validateProviderSnapshot(snapshot(), expected)).toMatchObject({
      pageId: 'page-test-1',
      instagramId: 'ig-test-1',
      label: 'Publishly Canary',
      accountType: 'BUSINESS',
      quotaUsage: 0,
    });
  });

  it.each([
    [
      'missing content publishing scope',
      () => {
        const value = snapshot();
        value.permissions.data = value.permissions.data.filter(
          (item: any) => item.permission !== 'instagram_content_publish'
        );
        return value;
      },
      'canary_provider_scope_missing',
    ],
    [
      'wrong linked Instagram account',
      () =>
        snapshot({
          page: {
            ...snapshot().page,
            instagram_business_account: { id: 'customer-ig' },
          },
        }),
      'canary_provider_link_mismatch',
    ],
    [
      'personal account type',
      () =>
        snapshot({
          instagram: { ...snapshot().instagram, account_type: 'PERSONAL' },
        }),
      'canary_provider_account_type_invalid',
    ],
    [
      'generic destination label',
      () =>
        snapshot({
          instagram: { ...snapshot().instagram, name: 'Agency Customer' },
        }),
      'canary_provider_label_mismatch',
    ],
    [
      'missing quota readback',
      () => snapshot({ publishingLimit: { data: [] } }),
      'canary_provider_publish_limit_unavailable',
    ],
  ])('rejects %s', (_name, source, code) => {
    expect(() => validateProviderSnapshot(source(), expected)).toThrow(
      expect.objectContaining({ code })
    );
  });

  it('rejects an otherwise valid destination present in the customer/store denylist', () => {
    expect(() =>
      validateProviderSnapshot(snapshot(), expected, new Set(['ig-test-1']))
    ).toThrow(
      expect.objectContaining({
        code: 'canary_provider_customer_destination_rejected',
      })
    );
  });

  it('extracts nested page and Instagram IDs without treating arbitrary strings as IDs', () => {
    const ids = collectForbiddenIds({
      pages: [{ pageId: 'page-customer' }],
      instagram: { instagram_id: 'ig-customer', label: 'not-an-id' },
    });
    expect([...ids].sort()).toEqual(['ig-customer', 'page-customer']);
  });

  it('seals provider tokens with authenticated randomized encryption', () => {
    const token = 'provider-token-must-not-appear';
    const first = seal(token, 'a'.repeat(80));
    const second = seal(token, 'a'.repeat(80));

    expect(first).toMatch(/^v2:[^:]+:[^:]+:[^:]+$/);
    expect(first).not.toContain(token);
    expect(first).not.toBe(second);
  });

  it('sends Graph credentials only in the Authorization header', async () => {
    const fetchImpl = jest.fn(async (url: string, options: any) => {
      expect(url).toBe('https://graph.facebook.com/v25.0/me/permissions');
      expect(url).not.toContain('secret-user-token');
      expect(options.headers.Authorization).toBe('Bearer secret-user-token');
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      graphRequest('/me/permissions', 'secret-user-token', fetchImpl)
    ).resolves.toEqual({ data: [] });
  });

  it('classifies API failures with a durable class, code, and reason', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        JSON.stringify({
          failureClass: 'recoverable',
          code: 'calendar_authority_busy',
          reason: 'The authority lease is busy; retry later.',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(
      apiRequest('/calendar/reservations/authority/batches', {
        authToken: 'jwt',
        organizationId: 'org',
      }, fetchImpl)
    ).rejects.toMatchObject<Partial<typeof ProvisionError>>({
      failureClass: 'recoverable',
      code: 'calendar_authority_busy',
      message: 'The authority lease is busy; retry later.',
    });
  });

  it('builds the exact one-post harness environment without placing secrets in paths', () => {
    const env = operatorEnvironment(
      {
        MAIN_URL: 'https://publishly-canary.trycloudflare.com',
        PUBLISHLY_BUILD_REVISION: `sha256:${'a'.repeat(64)}`,
        BULK_CANARY_ORGANIZATION_ID: 'org-canary',
        BULK_CANARY_TUPLE_ID: 'instagram.professional.reel.video',
        BULK_CANARY_INTEGRATION_ID: 'ig-canary',
      },
      'session-jwt',
      'Publishly Canary'
    );

    expect(env).toMatchObject({
      BULK_CANARY_AUTH_TOKEN: 'session-jwt',
      BULK_CANARY_EXPECTED_DESTINATION_LABEL: 'Publishly Canary',
      BULK_CANARY_CONFIRM:
        'publishly-real-canary:instagram.professional.reel.video:ig-canary',
    });
    expect(env.BULK_CANARY_MEDIA_FILE).not.toContain('session-jwt');
    expect(env.BULK_CANARY_EVIDENCE_FILE).not.toContain('session-jwt');
  });
});
