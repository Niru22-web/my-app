// Small in-memory limiter for sensitive endpoints (login, password reset, public registration).
// One API process today; if the API is ever scaled out, move this to a shared store.

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();

/** Returns seconds to wait if `key` has used up `max` attempts in `windowMs`, else 0 (and counts this attempt). */
export function hit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  if (b.count >= max) return Math.ceil((b.resetAt - now) / 1000);
  b.count++;
  return 0;
}

/** Clears a key (e.g. after a successful login). */
export const clear = (key: string) => buckets.delete(key);

// Keep the map small.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 10 * 60_000).unref();
