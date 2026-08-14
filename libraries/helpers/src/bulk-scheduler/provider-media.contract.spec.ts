import {
  fingerprintProviderMediaCapability,
  hashProviderMediaCapability,
  parseProviderMediaCapability,
  parseProviderMediaRange,
  parsePrivateAdapterMediaPath,
  privateAdapterMediaPath,
  privateAdapterMediaRequest,
  providerMediaBaseUrl,
  PROVIDER_MEDIA_INTERNAL_HEADER,
  providerMediaUrl,
  redactProviderMediaSecrets,
  safeProviderMediaFilename,
} from './provider-media.contract';

const capability = `pmg_${'a'.repeat(32)}.${'B'.repeat(43)}`;

describe('provider media capability contract', () => {
  it('accepts only the fixed opaque capability format and hashes it irreversibly', () => {
    expect(parseProviderMediaCapability(capability)).toEqual({
      grantId: `pmg_${'a'.repeat(32)}`,
      secret: 'B'.repeat(43),
    });
    expect(hashProviderMediaCapability(capability)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashProviderMediaCapability(capability)).not.toContain('B'.repeat(10));
    expect(fingerprintProviderMediaCapability(capability)).toMatch(/^[a-f0-9]{12}$/);
    expect(parseProviderMediaCapability(`${capability}x`)).toBeNull();
    expect(parseProviderMediaCapability('pmg_known.public-object-key')).toBeNull();
  });

  it('redacts capabilities from request paths and provider request evidence', () => {
    const url = `https://api.publishly.test/provider-media/${capability}`;
    expect(redactProviderMediaSecrets(`/provider-media/${capability}`)).toBe(
      '/provider-media/[redacted]'
    );
    expect(
      redactProviderMediaSecrets(
        `provider failed video_url=${url}&access_token=unrelated`
      )
    ).toBe(
      'provider failed video_url=https://api.publishly.test/provider-media/[redacted]&access_token=unrelated'
    );
    expect(redactProviderMediaSecrets(url)).not.toContain(capability);
  });

  it('supports one bounded normal, open-ended, or suffix range', () => {
    expect(parseProviderMediaRange(undefined, 1000, true)).toBeNull();
    expect(parseProviderMediaRange('bytes=10-19', 1000, true)).toEqual({
      start: 10,
      end: 19,
    });
    expect(parseProviderMediaRange('bytes=990-', 1000, true)).toEqual({
      start: 990,
      end: 999,
    });
    expect(parseProviderMediaRange('bytes=-25', 1000, true)).toEqual({
      start: 975,
      end: 999,
    });
    expect(parseProviderMediaRange('bytes=0-5000', 1000, true)).toEqual({
      start: 0,
      end: 999,
    });
  });

  it.each([
    ['bytes=0-1,4-5', true, 'provider_media_range_invalid'],
    ['bytes=1000-', true, 'provider_media_range_unsatisfiable'],
    ['items=0-10', true, 'provider_media_range_invalid'],
    ['bytes=0-10', false, 'provider_media_range_not_allowed'],
  ])('rejects unsafe range %s', (header, allowed, code) => {
    expect(() => parseProviderMediaRange(header, 1000, allowed)).toThrow(code);
  });

  it('builds only credential-free HTTPS provider origins outside local development', () => {
    expect(
      providerMediaBaseUrl({ PROVIDER_MEDIA_BASE_URL: 'https://api.test/' })
    ).toBe('https://api.test');
    expect(
      providerMediaUrl(capability, {
        PROVIDER_MEDIA_BASE_URL: 'https://api.test',
      })
    ).toBe(`https://api.test/provider-media/${capability}/video.mp4`);
    expect(() =>
      providerMediaBaseUrl({ PROVIDER_MEDIA_BASE_URL: 'http://api.test' })
    ).toThrow(/HTTPS/);
    expect(() =>
      providerMediaBaseUrl({
        PROVIDER_MEDIA_BASE_URL: 'https://user:pass@api.test?secret=yes',
      })
    ).toThrow(/credentials/);
    expect(
      providerMediaBaseUrl({ PROVIDER_MEDIA_BASE_URL: 'http://localhost:3000' })
    ).toBe('http://localhost:3000');
  });

  it('unwraps direct-adapter media only for the configured capability origin and adds internal auth', () => {
    const environment = {
      PROVIDER_MEDIA_BASE_URL: 'https://api.publishly.test/api',
      BULK_PRIVATE_INTERNAL_TOKEN: 'internal-only-token-that-is-long-enough',
    };
    const url = providerMediaUrl(capability, environment);
    expect(url).toMatch(/\/video\.mp4$/);
    const wrapped = privateAdapterMediaPath(url);
    expect(parsePrivateAdapterMediaPath(wrapped, environment)).toBe(url);
    expect(privateAdapterMediaRequest(wrapped, environment)).toEqual({
      url,
      headers: {
        [PROVIDER_MEDIA_INTERNAL_HEADER]:
          'internal-only-token-that-is-long-enough',
      },
    });
    const attacker = privateAdapterMediaPath(
      `https://attacker.test/provider-media/${capability}`
    );
    expect(parsePrivateAdapterMediaPath(attacker, environment)).toBeNull();
    expect(privateAdapterMediaRequest(attacker, environment)).toEqual({
      url: attacker,
      headers: {},
    });
  });

  it('rejects missing or weak direct-adapter internal credentials', () => {
    const environment = {
      PROVIDER_MEDIA_BASE_URL: 'https://api.publishly.test',
      BULK_PRIVATE_INTERNAL_TOKEN: 'short',
    };
    const wrapped = privateAdapterMediaPath(
      providerMediaUrl(capability, environment)
    );
    expect(() => privateAdapterMediaRequest(wrapped, environment)).toThrow(
      /at least 32/
    );
  });

  it('sanitizes content-disposition filenames', () => {
    expect(safeProviderMediaFilename('../../launch video\r\nX: bad.mov')).toBe(
      'launch_video_X_bad.mov.mp4'
    );
    expect(safeProviderMediaFilename('clip.mp4')).toBe('clip.mp4');
  });
});
