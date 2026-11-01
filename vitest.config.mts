import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

const r = (p: string) => resolve(import.meta.dirname, p);

/**
 * No React plugin here on purpose.
 *
 * `@vitejs/plugin-react` pulls in its own Vite, whose plugin types no longer
 * match the Vite that Vitest resolves. Tests need nothing the plugin provides
 * except the JSX transform -- no fast refresh, no HMR -- so the bundler's own
 * transformer handles JSX and the version conflict disappears.
 *
 * The file is `.mts` because it is ESM: loaded as CommonJS, the import syntax
 * is a warning today and an error in a coming major.
 *
 * The default environment is `node`: the scoring engine is pure TypeScript and
 * running it inside a simulated browser would only make the suite slower. Files
 * that genuinely need a DOM opt in with `@vitest-environment happy-dom`.
 */
export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  resolve: {
    alias: [
      { find: '@/app', replacement: r('./app') },
      { find: '@/views', replacement: r('./src/views') },
      { find: '@/widgets', replacement: r('./src/widgets') },
      { find: '@/features', replacement: r('./src/features') },
      { find: '@/entities', replacement: r('./src/entities') },
      { find: '@/shared', replacement: r('./src/shared') },
      { find: '@/tests', replacement: r('./tests') },

      /*
       * pdf.js ships a legacy build for runtimes without the newest language
       * features, and Node 20 is one: the modern build reaches for iterator
       * helpers and `Promise.withResolvers`, both of which arrived in Node 22.
       * Browsers have had both for far longer, so the application imports the
       * modern build and only the tests resolve elsewhere.
       *
       * Anchored, because a plain string alias matches by prefix and would
       * rewrite `pdfjs-dist/legacy/...` into a path inside itself.
       */
      { find: /^pdfjs-dist$/, replacement: r('./node_modules/pdfjs-dist/legacy/build/pdf.mjs') },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
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
