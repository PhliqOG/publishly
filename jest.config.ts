import type { Config } from 'jest';

// Self-contained Jest setup (the previous config imported @nx/jest, which is
// not a dependency of this repo - it could never run).
//
// Two tiers:
//   unit         *.spec.ts        pure logic, no infra needed
//   integration  *.int.spec.ts    real Postgres/Redis (and for the API suite,
//                                 the running backend on :3000); each suite
//                                 skips itself with a clear message when its
//                                 infra is not reachable.

const moduleNameMapper = {
  '^@gitroom/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
  '^@gitroom/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
  '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
  '^@gitroom/nestjs-libraries/(.*)$':
    '<rootDir>/libraries/nestjs-libraries/src/$1',
  '^@gitroom/react/(.*)$': '<rootDir>/libraries/react-shared-libraries/src/$1',
  '^@gitroom/orchestrator/(.*)$': '<rootDir>/apps/orchestrator/src/$1',
};

const transform = {
  '^.+\\.tsx?$': [
    'ts-jest',
    {
      isolatedModules: true,
      tsconfig: {
        target: 'ES2021',
        module: 'CommonJS',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strictNullChecks: false,
        noImplicitAny: false,
        skipLibCheck: true,
        resolveJsonModule: true,
      },
    },
  ],
} as any;

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/libraries/**/*.spec.ts', '<rootDir>/apps/**/*.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '\\.int\\.spec\\.ts$', '/dist/'],
      moduleNameMapper,
      transform,
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/**/*.int.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/'],
      moduleNameMapper,
      transform,
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
  ],
};

export default config;
