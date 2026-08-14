import type { Config } from 'jest';

// Self-contained Jest setup (the previous config imported @nx/jest, which is
// not a dependency of this repo - it could never run).
//
// Three tiers:
//   unit         *.spec.ts        pure logic, no infra needed
//   integration  *.int.spec.ts    real Postgres/Redis (some legacy/API suites
//                                 may self-skip when their full stack is absent;
//                                 mandatory Bulk Scheduler gates never skip)
//   load         *.load.spec.ts   destructive only to exact, generated rows in
//                                 a database whose name is explicitly test/ci

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
      tsconfig: {
        isolatedModules: true,
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

const modulePathIgnorePatterns = [
  '<rootDir>[\\\\/]\\.building[\\\\/]',
  '<rootDir>[\\\\/]dist[\\\\/]',
  '<rootDir>[\\\\/]\\.next[\\\\/]',
];

const config: Config = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/libraries/**/*.spec.ts', '<rootDir>/apps/**/*.spec.ts'],
      testPathIgnorePatterns: [
        '/node_modules/',
        '/.building/',
        '\\.int\\.spec\\.ts$',
        '/dist/',
      ],
      moduleNameMapper,
      modulePathIgnorePatterns,
      transform,
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/**/*.int.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/.building/', '/dist/'],
      moduleNameMapper,
      modulePathIgnorePatterns,
      transform,
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
    {
      displayName: 'load',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/**/*.load.spec.ts'],
      testPathIgnorePatterns: ['/node_modules/', '/.building/', '/dist/'],
      moduleNameMapper,
      modulePathIgnorePatterns,
      transform,
      setupFiles: ['<rootDir>/test/setup-env.ts'],
    },
  ],
};

export default config;
