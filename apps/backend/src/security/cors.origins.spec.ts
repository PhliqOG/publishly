import { trustedFrontendOrigins } from './cors.origins';

describe('trusted frontend CORS origins', () => {
  it('allows the canonical Publishly origin and its www redirect host', () => {
    expect(
      trustedFrontendOrigins(
        'https://publishlyapi.com',
        'https://publishlyapi.com'
      )
    ).toEqual([
      'https://publishlyapi.com',
      'https://www.publishlyapi.com',
      'http://localhost:6274',
    ]);
  });

  it('does not create a www.www origin', () => {
    expect(
      trustedFrontendOrigins('https://www.example.com', undefined)
    ).toEqual(['https://www.example.com', 'http://localhost:6274']);
  });

  it('ignores an invalid optional frontend URL when deriving www', () => {
    expect(trustedFrontendOrigins('not a URL', undefined)).toEqual([
      'not a URL',
      'http://localhost:6274',
    ]);
  });
});
