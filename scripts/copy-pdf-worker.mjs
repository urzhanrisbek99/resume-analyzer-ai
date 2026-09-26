/**
 * Copy the pdf.js worker into `public/` so the browser can load it from a
 * stable URL.
 *
 * The alternative -- `new URL('pdfjs-dist/build/pdf.worker.min.mjs',
 * import.meta.url)` -- relies on bundler-specific resolution of bare module
 * specifiers and silently produces a 404 when that resolution changes. Copying
 * the file is boring, explicit and survives bundler upgrades.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

const WORKER_ENTRY = 'pdfjs-dist/build/pdf.worker.min.mjs';
const DESTINATION = join(process.cwd(), 'public', 'pdf.worker.min.mjs');

try {
  const source = require.resolve(WORKER_ENTRY);
  await mkdir(dirname(DESTINATION), { recursive: true });
  await copyFile(source, DESTINATION);
  console.log(`[pdf-worker] ${source} -> public/pdf.worker.min.mjs`);
} catch (cause) {
  console.error(`[pdf-worker] failed to copy ${WORKER_ENTRY}:`, cause);
  process.exitCode = 1;
}
