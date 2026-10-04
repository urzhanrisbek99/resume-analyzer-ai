/**
 * A fixed-window rate limiter held in process memory.
 *
 * Deliberately the simplest thing that works for a single instance. It is not
 * correct across a horizontally scaled deployment -- each instance would keep
 * its own counters -- and the honest fix there is a shared store such as Redis
 * or the platform's own limiter. For a tool whose expensive path is one
 * optional model call, the trade is worth naming rather than over-building.
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

/**
 * The caller identity.
 *
 * Behind a proxy the socket address is the proxy, so the forwarded header is
 * preferred. It is client-controlled and therefore spoofable -- acceptable for
 * a cost guard, not for anything security-bearing.
 */
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
