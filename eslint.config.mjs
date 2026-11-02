import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

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
  { type: 'app', pattern: 'app', partialMatch: false },
  // `entities-x` must precede `entities`: it is a more specific path.
  { type: 'entities-x', pattern: 'src/entities/*/@x', partialMatch: false, capture: ['slice'] },
  { type: 'views', pattern: 'src/views/*', capture: ['slice'] },
  { type: 'widgets', pattern: 'src/widgets/*', capture: ['slice'] },
  { type: 'features', pattern: 'src/features/*', capture: ['slice'] },
  { type: 'entities', pattern: 'src/entities/*', capture: ['slice'] },
  { type: 'shared', pattern: 'src/shared/*', capture: ['segment'] },
];

/** The files each element exposes to the layers above it. */
const publicApi = {
  app: '**',
  views: 'index.ts',
  widgets: 'index.ts',
  features: 'index.ts',
  entities: 'index.ts',
  'entities-x': '*.ts',
  // `shared` is a set of independent segments, each file its own API.
  shared: ['*.ts', '*.tsx'],
};

/** Which layers each layer may import, strictly downwards. */
const allowedLayers = {
  app: ['app', 'views', 'widgets', 'features', 'entities', 'shared'],
  views: ['widgets', 'features', 'entities', 'shared'],
  widgets: ['features', 'entities', 'shared'],
  features: ['entities', 'shared'],
  entities: ['shared'],
  'entities-x': ['shared'],
  shared: ['shared'],
};

const fsdPolicies = [
  ...Object.entries(allowedLayers).map(([from, targets]) => ({
    from: { element: { type: from } },
    allow: targets.map((type) => ({
      to: { element: { type, fileInternalPath: publicApi[type] } },
    })),
  })),
  // An entity reaches another entity only through that entity's `@x` segment.
  {
    from: { element: { type: 'entities' } },
    allow: {
      to: {
        element: {
          type: 'entities-x',
          captured: { slice: '!{{from.element.captured.slice}}' },
        },
      },
    },
  },
  // `@x` re-exports its owner's internals for one consumer, so it may read
  // any file of the entity it belongs to.
  {
    from: { element: { type: 'entities-x' } },
    allow: {
      to: {
        element: { type: 'entities', captured: { slice: '{{from.element.captured.slice}}' } },
      },
    },
  },
];

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
      'next-env.d.ts',
    ],
  },

  // eslint-config-next 16 ships native flat configs, so they are spread
  // directly. Routing them through FlatCompat crashes the config validator.
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    name: 'project/typescript',
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          // `typeof import('pdfjs-dist')` is how a dynamically imported module
          // is typed without loading it eagerly. Keep that legal.
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Invisible characters in source are unreviewable; escape them instead.
      'no-irregular-whitespace': ['error', { skipRegExps: false, skipStrings: false }],
      'no-control-regex': 'error',
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
      'boundaries/dependencies': ['error', { default: 'disallow', policies: fsdPolicies }],
    },
  },

  {
    name: 'project/tests',
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      'boundaries/dependencies': 'off',
      'no-console': 'off',
    },
  },

  {
    name: 'project/config-and-scripts',
    files: ['*.config.ts', '*.config.mjs', 'scripts/**/*.mjs', 'app/api/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
