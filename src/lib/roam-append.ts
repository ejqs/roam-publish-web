/** ROAM_APPEND_API points at a stand-in for local testing; production uses Roam's. */
const APPEND_URL = (graph: string) =>
  `${process.env.ROAM_APPEND_API ?? "https://append-api.roamresearch.com"}/api/graph/${encodeURIComponent(graph)}/append-blocks`;

export type AppendResult = { ok: true } | { ok: false; status: number; message: string };

type Location = { page: { title: string | { "daily-note-page": string } } } | { block: { uid: string } };

/** Append one block to a daily note page (date as MM-DD-YYYY) via Roam's Append API. */
export function appendToDailyNote(graph: string, token: string, date: string, text: string) {
  return append(graph, token, { page: { title: { "daily-note-page": date } } }, [text]);
}

/** Append blocks, in order, as the last children of an existing block. */
export function appendUnderBlock(graph: string, token: string, uid: string, texts: string[]) {
  return append(graph, token, { block: { uid } }, texts);
}

async function append(graph: string, token: string, location: Location, texts: string[]): Promise<AppendResult> {
  let res: Response;
  try {
    res = await fetch(APPEND_URL(graph), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ location, "append-data": texts.map((string) => ({ string })) }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, message: "Couldn't reach Roam. Please try again." };
  }
  if (res.ok) return { ok: true };

  const detail = await res
    .json()
    .then((b: { message?: string }) => b.message)
    .catch(() => undefined);
  const fail = (message: string): AppendResult => ({ ok: false, status: res.status, message });
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
