import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

const r = (p: string) => resolve(import.meta.dirname, p);

/**
 * No React plugin here on purpose.
 *
 * `@vitejs/plugin-react` pulls in its own Vite (currently the rolldown build),
 * whose plugin types no longer match the Vite that Vitest resolves. Tests need
 * nothing the plugin provides except the JSX transform -- no fast refresh, no
 * HMR -- so esbuild handles JSX directly and the version conflict disappears.
 *
 * The default environment is `node`: the scoring engine is pure TypeScript and
 * running it inside a simulated browser would only make the suite slower. Files
 * that genuinely need a DOM opt in with `@vitest-environment happy-dom`.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: {
      '@/views': r('./src/views'),
      '@/widgets': r('./src/widgets'),
      '@/features': r('./src/features'),
      '@/entities': r('./src/entities'),
      '@/shared': r('./src/shared'),
      '@/tests': r('./tests'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/index.ts', 'src/**/*.test.{ts,tsx}', 'src/**/ui/**'],
      // The scoring engine is the product. Hold it to a real bar.
      thresholds: {
        'src/entities/analysis/**': { statements: 85, branches: 75, functions: 85, lines: 85 },
      },
    },
  },
});
