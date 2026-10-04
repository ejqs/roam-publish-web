import { timed } from "./telemetry";

/**
 * The operator's Umami Cloud site: the tracking script's website id, and a small client for the
 * read API used by the view count sync (lib/view-sync.ts).
 */

/** Site-wide analytics for the operator only; users don't get their own tracking. */
export const UMAMI_WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || "a5f2f055-8e64-4811-a90f-75bf43ee9058";

const PAGE_SIZE = 500;
/** Stops a runaway pager: 100 pages is 50,000 paths. */
const MAX_PAGES = 100;

/** Umami Cloud's limit per API key: 50 calls every 15 seconds, or 12,000 an hour. */
export const UMAMI_LIMIT = { calls: 50, windowMs: 15_000 };
/** The share of that limit the sync uses by default, leaving room for anything else on the key. */
export const UMAMI_HEADROOM = 0.8;

const WINDOWS_PER_HOUR = (60 * 60_000) / UMAMI_LIMIT.windowMs;

/** Calls the sync may make in any 15 seconds: UMAMI_CALLS_PER_HOUR spread evenly, or 80% of the limit (40). */
export function umamiCallsPerWindow() {
  const n = Number(process.env.UMAMI_CALLS_PER_HOUR);
  if (Number.isInteger(n) && n > 0) return Math.max(1, Math.floor(n / WINDOWS_PER_HOUR));
  return Math.floor(UMAMI_LIMIT.calls * UMAMI_HEADROOM);
}

/** Calls the sync may make in an hour (9,600 by default). */
export const umamiCallsPerHour = () => umamiCallsPerWindow() * WINDOWS_PER_HOUR;

/** How long to wait before another call, given when recent calls went out, to stay within `limit` per window. */
export function throttleDelay(sent: number[], now: number, limit: number, windowMs = UMAMI_LIMIT.windowMs) {
  const recent = sent.filter((t) => t > now - windowMs);
  if (recent.length < limit) return 0;
  return recent[recent.length - limit] + windowMs - now;
}

/** When this process's recent calls went out, across every client, so jobs share the window. */
const sent: number[] = [];

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && sent[0] <= now - UMAMI_LIMIT.windowMs) sent.shift();
    const wait = throttleDelay(sent, now, umamiCallsPerWindow());
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  sent.push(Date.now());
}

/** Why the sync can't run here, or null when it can. */
export function umamiDisabledReason(): string | null {
  if (process.env.UMAMI_SYNC === "off") return "UMAMI_SYNC=off";
  if (!process.env.UMAMI_API_KEY) return "no UMAMI_API_KEY";
  return null;
}

/** Umami answered 429. The job stops and tries again later. */
export class UmamiRateLimited extends Error {
  constructor() {
    super("Umami rate limit (429)");
  }
}

/** One row of a metrics breakdown: `x` is the path, country code, etc.; `y` the number of views. */
export type Metric = { x: string | null; y: number };

export type MetricType = "path" | "country";

/** Counts its calls, so each job run can report how much of the API budget it spent. */
export class UmamiClient {
  calls = 0;
  private base = (process.env.UMAMI_API_URL || "https://api.umami.is/v1").replace(/\/+$/, "");

  /** One page of `GET /websites/:id/metrics`. `filters` are Umami's own, e.g. `{ path: "/a/b" }`. */
  async metrics(
    type: MetricType,
    startAt: Date,
    endAt: Date,
    { filters = {}, limit = PAGE_SIZE, offset = 0 }: { filters?: Record<string, string>; limit?: number; offset?: number } = {},
  ): Promise<Metric[]> {
    const q = new URLSearchParams({
      type,
      startAt: String(startAt.getTime()),
      endAt: String(endAt.getTime()),
      limit: String(limit),
      offset: String(offset),
      ...filters,
    });
    await throttle();
    this.calls++;
    const res = await timed(
      "umami",
      () =>
        fetch(`${this.base}/websites/${encodeURIComponent(UMAMI_WEBSITE_ID)}/metrics?${q}`, {
          headers: { "x-umami-api-key": process.env.UMAMI_API_KEY ?? "", accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        }),
      (r) => (r.ok ? undefined : `HTTP ${r.status}`),
    );
    if (res.status === 429) throw new UmamiRateLimited();
    if (!res.ok) throw new Error(`Umami ${type} metrics: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error(`Umami ${type} metrics: unexpected response`);
    return body
      .filter((m): m is Metric => !!m && typeof m === "object" && typeof (m as Metric).y === "number")
      .map((m) => ({ x: typeof m.x === "string" ? m.x : null, y: m.y }));
  }

  /** Every row of a breakdown, page by page. */
  async allMetrics(type: MetricType, startAt: Date, endAt: Date, filters: Record<string, string> = {}) {
    const out: Metric[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = await this.metrics(type, startAt, endAt, { filters, offset: page * PAGE_SIZE });
      out.push(...rows);
      if (rows.length < PAGE_SIZE) return { rows: out, complete: true };
    }
    return { rows: out, complete: false };
  }
}
