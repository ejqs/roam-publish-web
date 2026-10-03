// Simple in-memory fixed-window limiter. Fine for a single Railway replica.
const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Drops windows that have ended. Some keys hold IP addresses, and the privacy policy promises they
 * last no longer than their window (15 minutes at most), so this runs every minute rather than
 * waiting for the same key to come back. Returns how many were dropped.
 */
export function sweepRateLimits(now = Date.now()) {
  let dropped = 0;
  for (const [key, b] of buckets)
    if (b.resetAt <= now) {
      buckets.delete(key);
      dropped++;
    }
  return dropped;
}

// unref: the timer alone never keeps a process (a build, a test run, a script) alive.
setInterval(sweepRateLimits, 60_000).unref?.();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

/**
 * The client's address as our proxy saw it, for rate limiting. X-Real-IP is set by the proxy; the
 * first X-Forwarded-For entry is whatever the client sent, so only the last one (added by the
 * proxy) is used. Same order as better-auth's ipAddressHeaders in auth.ts.
 */
export function clientIp(headers: Headers) {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}
