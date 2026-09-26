/**
 * Identifier helpers.
 *
 * Analysis output is snapshot-tested, so identifiers must be reproducible for
 * the same input. `stableId` derives an id from content; `randomId` is only for
 * throwaway client-side keys where reproducibility does not matter.
 */

/** FNV-1a: small, fast, dependency-free, good enough for non-crypto ids. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic id: identical parts always produce the identical id. */
export function stableId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}_${fnv1a(parts.join('\u0000')).toString(36)}`;
}

export function randomId(prefix: string): string {
  const source =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return `${prefix}_${source.replace(/-/g, '').slice(0, 12)}`;
}
