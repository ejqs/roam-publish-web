import type { Metric } from "@/lib/umami";

export type UmamiCall = { type: string; startAt: number; endAt: number; params: URLSearchParams; key: string | null };

/**
 * A stand-in for Umami's metrics API. `answer` gets each call and returns its rows, or a number for
 * an HTTP status with no rows.
 */
export function fakeUmami(answer: (call: UmamiCall) => Metric[] | number) {
  const calls: UmamiCall[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== new URL(process.env.UMAMI_API_URL!).origin) return real(input, init);
    const params = url.searchParams;
    const call = {
      type: params.get("type") ?? "",
      startAt: Number(params.get("startAt")),
      endAt: Number(params.get("endAt")),
      params,
      key: new Headers(init?.headers).get("x-umami-api-key"),
    };
    calls.push(call);
    const out = answer(call);
    return typeof out === "number"
      ? new Response("{}", { status: out })
      : new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}
