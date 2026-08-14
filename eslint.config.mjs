import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Next 16 exports flat-config arrays directly. Passing those arrays through
// FlatCompat (the previous setup) creates a circular plugin graph and makes
// ESLint crash before it examines a file.
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      '**/next-env.d.ts',
      '.building/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/prefer-as-const': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
      // This fork does not enable the experimental React Compiler. Next 16's
      // preset otherwise treats legacy upstream memoization patterns as 400+
      // compiler errors even though they are valid without the compiler.
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/use-memo': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
