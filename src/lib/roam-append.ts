import { rejectedStatus, timed } from "./telemetry";

/** ROAM_APPEND_API points at a stand-in for local testing; production uses Roam's. */
const APPEND_URL = (graph: string) =>
  `${process.env.ROAM_APPEND_API ?? "https://append-api.roamresearch.com"}/api/graph/${encodeURIComponent(graph)}/append-blocks`;

export type AppendResult =
  | { ok: true }
  | { ok: false; status: number; message: string; /** From a 429's Retry-After. */ retryAfterMs?: number };

type Location =
  | { page: { title: string | { "daily-note-page": string } } }
  | { block: { uid: string }; "nest-under"?: { string: string } };

/** Append one block to a daily note page (date as MM-DD-YYYY) via Roam's Append API. */
export function appendToDailyNote(graph: string, token: string, date: string, text: string) {
  return append(graph, token, { page: { title: { "daily-note-page": date } } }, [text]);
}

/**
 * Append blocks, in order, as the last children of an existing block; with `nestUnder`, under its
 * child block with exactly that text instead, which Roam creates first if there isn't one.
 */
export function appendUnderBlock(graph: string, token: string, uid: string, texts: string[], nestUnder?: string) {
  return append(graph, token, { block: { uid }, ...(nestUnder && { "nest-under": { string: nestUnder } }) }, texts);
}

async function append(graph: string, token: string, location: Location, texts: string[]): Promise<AppendResult> {
  let res: Response;
  try {
    // A bad token or graph name (4xx) is the owner's to fix; Roam being down or limiting us is ours.
    res = await timed(
      "roam-append",
      () =>
        fetch(APPEND_URL(graph), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ location, "append-data": texts.map((string) => ({ string })) }),
          cache: "no-store",
        }),
      (r) => (r.status >= 500 || r.status === 429 ? `HTTP ${r.status}` : undefined),
      (r) => (r.status === 429 ? undefined : rejectedStatus(r)),
    );
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Roam. Please try again." };
  }
  if (res.ok) return { ok: true };

  const detail = await res
    .json()
    .then((b: { message?: string }) => b.message)
    .catch(() => undefined);
  const retryAfter = Number(res.headers.get("retry-after"));
  const fail = (message: string): AppendResult => ({
    ok: false,
    status: res.status,
    message,
    ...(res.status === 429 && retryAfter > 0 && { retryAfterMs: retryAfter * 1000 }),
  });
  switch (res.status) {
    case 400:
      return fail(`Roam rejected the request${detail ? `: ${detail}` : ""}. Check the graph name.`);
    case 401:
      return fail("That token was rejected. Make sure you copied the whole token (it starts with roam-graph-token-).");
    case 403:
      return fail("That token doesn't have permission to write to this graph. Create an append-only token for this graph.");
    case 429:
      return fail("Roam is rate-limiting this token. Wait a minute and try again.");
    default:
      return fail(`Roam returned an error (${res.status}). Please try again.`);
  }
}
