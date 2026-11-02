/**
 * In-memory fixed-window rate limiter. Correct for a single instance only;
 * multiple instances would need a shared store such as Redis.
 */

interface Window {
  count: number;
  /** Epoch milliseconds when the current window expires. */
  resetAt: number;
}

const WINDOW_MS = 60_000;
/** Bound the map so a flood of distinct keys cannot grow it without limit. */
const MAX_TRACKED_KEYS = 10_000;

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets, for the Retry-After header. */
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limitPerMinute: number, now = Date.now()): RateLimitResult {
  pruneExpired(now);

  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limitPerMinute - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const remaining = Math.max(0, limitPerMinute - existing.count);

  return {
    allowed: existing.count <= limitPerMinute,
    remaining,
    retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
  };
}

function pruneExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/** Prefers the forwarded header behind a proxy. Spoofable: fine for a cost guard only. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

/** Test seam: drop all counters between cases. */
export function resetRateLimits(): void {
  windows.clear();
}
