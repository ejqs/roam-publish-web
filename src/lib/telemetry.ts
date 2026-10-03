/**
 * Request telemetry: how often each entry point (route handler, server action) and each outside
 * service is called, how long it takes and how often it fails. Calls add to in-memory per-minute
 * buckets; the metrics-flush job (lib/jobs-registry.ts) writes them to `endpoint_metric`, which
 * /admin/status shows. Failures and slow calls also go to stdout as one JSON line each, so Railway's
 * log search can find them. In memory is fine for a single Railway replica, like lib/rate-limit.ts.
 */

export type MetricKind = "route" | "action" | "dep" | "page";

/** Upper bounds (ms) of the latency histogram's bins; the last bin takes everything slower. */
export const LATENCY_BINS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, Infinity];

/** A call slower than this is logged even when it worked. */
const SLOW_MS = 1000;
const ERROR_MAX = 500;
const MINUTE = 60_000;

export type Bucket = {
  name: string;
  kind: MetricKind;
  /** Start of the minute. */
  minute: Date;
  count: number;
  errors: number;
  sumMs: number;
  maxMs: number;
  hist: number[];
  /** 4xx answers by status: the caller's mistake, so not errors, but a spike means something broke. */
  rejected: Record<string, number>;
  lastError: string | null;
  lastErrorAt: Date | null;
};

const store = globalThis as unknown as { telemetryBuckets?: Map<string, Bucket> };
const buckets = (store.telemetryBuckets ??= new Map());

export const binOf = (ms: number) => LATENCY_BINS.findIndex((b) => ms <= b);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX);

/**
 * redirect(), notFound() and friends work by throwing. They're how a call ends, not failures.
 */
export function isControlFlow(e: unknown) {
  if (typeof e !== "object" || e === null || !("digest" in e)) return false;
  const d = String(e.digest);
  return d.startsWith("NEXT_") || d === "DYNAMIC_SERVER_USAGE" || d === "BAILOUT_TO_CLIENT_SIDE_RENDERING";
}

/** Adds one call. `error` is set for a failed call, `rejected` to the status of a refused one. */
export function record(
  name: string,
  kind: MetricKind,
  ms: number,
  error?: unknown,
  now = new Date(),
  rejected?: number,
) {
  const minute = new Date(Math.floor(now.getTime() / MINUTE) * MINUTE);
  const key = `${name}\u0000${minute.getTime()}`;
  let b = buckets.get(key);
  if (!b) {
    b = { name, kind, minute, count: 0, errors: 0, sumMs: 0, maxMs: 0, hist: LATENCY_BINS.map(() => 0), rejected: {}, lastError: null, lastErrorAt: null };
    buckets.set(key, b);
  }
  const rounded = Math.max(0, Math.round(ms));
  b.count++;
  b.sumMs += rounded;
  b.maxMs = Math.max(b.maxMs, rounded);
  b.hist[binOf(rounded)]++;
  if (rejected !== undefined) b.rejected[rejected] = (b.rejected[rejected] ?? 0) + 1;
  const failed = error !== undefined;
  if (failed) {
    b.errors++;
    b.lastError = errorText(error);
    b.lastErrorAt = now;
  }
  if (failed || rounded >= SLOW_MS) {
    const line = JSON.stringify({
      level: failed ? "error" : "warn",
      msg: failed ? `${name} failed` : `${name} slow`,
      metric: name,
      kind,
      ms: rounded,
      ...(failed ? { error: b.lastError } : {}),
    });
    if (failed) console.error(line);
    else console.warn(line);
  }
}

/**
 * Runs and times `fn`; a throw (other than redirect/notFound) counts as a failure and is rethrown.
 * `failed` names a failure in the result; `rejectedOf` gives the status of a refused call.
 */
async function timedCall<T>(
  name: string,
  kind: MetricKind,
  fn: () => Promise<T> | T,
  failed?: (r: T) => unknown,
  rejectedOf?: (r: T) => number | undefined,
) {
  const start = performance.now();
  let result: T;
  try {
    result = await fn();
  } catch (e) {
    record(name, kind, performance.now() - start, isControlFlow(e) ? undefined : e);
    throw e;
  }
  record(name, kind, performance.now() - start, failed?.(result) ?? undefined, new Date(), rejectedOf?.(result));
  return result;
}

/**
 * Wraps a route handler export: `export const GET = withRoute("GET /api/search", async (req) => ...)`.
 * A thrown error or a 5xx response counts as a failure; a 4xx is the caller's mistake, counted as rejected.
 */
export function withRoute<A extends unknown[]>(name: string, handler: (...args: A) => Response | Promise<Response>) {
  return (...args: A) =>
    timedCall(
      name,
      "route",
      () => handler(...args),
      (res) => (res.status >= 500 ? `HTTP ${res.status}` : undefined),
      rejectedStatus,
    );
}

/**
 * Wraps a server action's body: `return withAction("dashboard.setAccess", async () => {...})`.
 * Only a throw counts as a failure: an `{ error }` result is an answer to a bad input.
 */
export function withAction<T>(name: string, fn: () => Promise<T>) {
  return timedCall(`action ${name}`, "action", fn);
}

/** The status of a 4xx response, else undefined. */
export const rejectedStatus = (res: { status: number }) =>
  res.status >= 400 && res.status < 500 ? res.status : undefined;

/** Wraps a call to an outside service: `timed("roam-append", () => fetch(...))`. */
export function timed<T>(
  dep: string,
  fn: () => Promise<T>,
  failed?: (r: T) => unknown,
  rejectedOf?: (r: T) => number | undefined,
) {
  return timedCall(`dep ${dep}`, "dep", fn, failed, rejectedOf);
}

/**
 * Takes the buckets for minutes before `now`'s (or all of them with `all`) out of memory, for
 * the flush job. The current minute stays, so a bucket is written once, whole.
 */
export function drainBuckets(now = new Date(), all = false): Bucket[] {
  const current = Math.floor(now.getTime() / MINUTE) * MINUTE;
  const out: Bucket[] = [];
  for (const [key, b] of buckets) {
    if (all || b.minute.getTime() < current) {
      out.push(b);
      buckets.delete(key);
    }
  }
  return out;
}

/** Puts drained buckets back, when writing them failed, so the next flush tries again. */
export function restoreBuckets(drained: Bucket[]) {
  for (const b of drained) {
    const key = `${b.name}\u0000${b.minute.getTime()}`;
    const cur = buckets.get(key);
    if (!cur) {
      buckets.set(key, b);
      continue;
    }
    cur.count += b.count;
    cur.errors += b.errors;
    cur.sumMs += b.sumMs;
    cur.maxMs = Math.max(cur.maxMs, b.maxMs);
    b.hist.forEach((n, i) => (cur.hist[i] += n));
    for (const [status, n] of Object.entries(b.rejected)) cur.rejected[status] = (cur.rejected[status] ?? 0) + n;
    if (b.lastErrorAt && (!cur.lastErrorAt || b.lastErrorAt > cur.lastErrorAt)) {
      cur.lastError = b.lastError;
      cur.lastErrorAt = b.lastErrorAt;
    }
  }
}
