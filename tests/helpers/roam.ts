/** A stand-in for Roam's Append API: records calls and answers with `status`. */
export function fakeRoam(status = 200) {
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(process.env.ROAM_APPEND_API!)) return real(input, init);
    calls.push({ url, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return new Response(status === 200 ? "{}" : JSON.stringify({ message: "nope" }), { status });
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}
