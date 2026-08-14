import { publicApiUrl } from './public-api-url';

describe('public website API URL', () => {
  it('uses the same-origin API prefix when no build-time origin exists', () => {
    expect(publicApiUrl('/public/status', '')).toBe('/api/public/status');
    expect(publicApiUrl('public/status', '')).toBe('/api/public/status');
  });

  it('normalizes an explicit local or production API origin', () => {
    expect(publicApiUrl('/public/status', 'http://localhost:3000/')).toBe(
      'http://localhost:3000/public/status'
    );
    expect(publicApiUrl('public/status', 'https://publishly.test/api/')).toBe(
      'https://publishly.test/api/public/status'
    );
  });
});
