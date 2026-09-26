import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Feature-Sliced Design is enforced mechanically, not by convention.
 *
 * Layer order (a layer may only import from layers strictly below it):
 *   app -> views -> widgets -> features -> entities -> shared
 *
 * Two FSD invariants get special treatment:
 *   1. Public API: a slice may only be imported through its `index.ts`.
 *   2. Cross-imports: entity-to-entity access goes through the `@x` segment
 *      (FSD 2.1), never through the public API of the target entity.
 */
const fsdElements = [
  { type: 'app', pattern: 'app/**/*', mode: 'full' },
  // `entities-x` must precede `entities`: it is a more specific path.
  { type: 'entities-x', pattern: 'src/entities/*/@x/*', mode: 'full', capture: ['slice', 'target'] },
  { type: 'views', pattern: 'src/views/*', capture: ['slice'] },
  { type: 'widgets', pattern: 'src/widgets/*', capture: ['slice'] },
  { type: 'features', pattern: 'src/features/*', capture: ['slice'] },
  { type: 'entities', pattern: 'src/entities/*', capture: ['slice'] },
  { type: 'shared', pattern: 'src/shared/*', capture: ['segment'] },
];

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    name: 'project/typescript',
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    name: 'project/fsd-boundaries',
    plugins: { boundaries },
    settings: {
      'boundaries/include': ['app/**/*', 'src/**/*'],
      'boundaries/elements': fsdElements,
    },
    rules: {
      'boundaries/no-private': ['error', { allowUncles: false }],
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['views', 'widgets', 'features', 'entities', 'shared'] },
            { from: 'views', allow: ['widgets', 'features', 'entities', 'shared'] },
            { from: 'widgets', allow: ['features', 'entities', 'shared'] },
            { from: 'features', allow: ['entities', 'shared'] },
            // An entity may reach another entity only through its `@x` segment.
            {
              from: 'entities',
              allow: ['shared', ['entities-x', { slice: '!${from.slice}' }]],
            },
            // The `@x` segment describes one entity in terms of another, so it
            // may read the entity that owns it, plus shared.
            { from: 'entities-x', allow: ['shared', ['entities', { slice: '${from.slice}' }]] },
            { from: 'shared', allow: ['shared'] },
          ],
        },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            // Slices expose exactly one public API file.
            { target: ['views', 'widgets', 'features', 'entities'], allow: 'index.ts' },
            { target: ['entities-x'], allow: '*.ts' },
            // `shared` is a set of independent segments, each with its own API.
            { target: ['shared'], allow: ['*.ts', '*.tsx', 'index.ts', 'index.tsx'] },
            { target: ['app'], allow: '**' },
          ],
        },
      ],
    },
  },

  {
    name: 'project/tests',
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      'boundaries/element-types': 'off',
      'boundaries/entry-point': 'off',
      'boundaries/no-private': 'off',
      'no-console': 'off',
    },
  },

  {
    name: 'project/config-files',
    files: ['*.config.ts', '*.config.mjs', 'app/api/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
