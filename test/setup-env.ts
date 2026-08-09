// Test-environment defaults. Real values from a developer's .env take
// precedence when set; these keep the suites deterministic on a fresh machine.
process.env.TZ = 'UTC';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'test-jwt-secret-0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
process.env.NEXT_PUBLIC_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
process.env.BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000';
process.env.STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
process.env.ENABLE_TEST_PROVIDER = 'true';

// Integration tier: dedicated test database/redis DB index so suites never
// touch dev data. The DB itself is created on demand by prisma db push (see
// test/README or package.json test:integration:prepare).
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://publishly-local:publishly-local-pwd@localhost:5433/publishly-test-db';
process.env.TEST_REDIS_URL =
  process.env.TEST_REDIS_URL || 'redis://localhost:6380/5';
process.env.TEST_BACKEND_URL =
  process.env.TEST_BACKEND_URL || 'http://localhost:3000';
