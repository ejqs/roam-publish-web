// Simple in-memory fixed-window limiter. Fine for a single Railway replica.
const buckets = new Map<string, { count: number; resetAt: number }>();

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
