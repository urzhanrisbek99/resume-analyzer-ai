import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const r = (p: string) => resolve(import.meta.dirname, p);

export default defineConfig({
  plugins: [react()],
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
    environment: 'jsdom',
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
