const APPEND_URL = (graph: string) =>
  `https://append-api.roamresearch.com/api/graph/${encodeURIComponent(graph)}/append-blocks`;

export type AppendResult = { ok: true } | { ok: false; message: string };

/** Append one block to a daily note page (date as MM-DD-YYYY) via Roam's Append API. */
export async function appendToDailyNote(
  graph: string,
  token: string,
  date: string,
  text: string,
): Promise<AppendResult> {
  let res: Response;
  try {
    res = await fetch(APPEND_URL(graph), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        location: { page: { title: { "daily-note-page": date } } },
        "append-data": [{ string: text }],
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Couldn't reach Roam. Please try again." };
  }
  if (res.ok) return { ok: true };

  const detail = await res
    .json()
    .then((b: { message?: string }) => b.message)
    .catch(() => undefined);
  switch (res.status) {
    case 400:
      return { ok: false, message: `Roam rejected the request${detail ? `: ${detail}` : ""}. Check the graph name.` };
    case 401:
      return { ok: false, message: "That token was rejected. Make sure you copied the whole token (it starts with roam-graph-token-)." };
    case 403:
      return { ok: false, message: "That token doesn't have permission to write to this graph. Create an append-only token for this graph." };
    case 429:
      return { ok: false, message: "Roam is rate-limiting this token. Wait a minute and try again." };
    default:
      return { ok: false, message: `Roam returned an error (${res.status}). Please try again.` };
  }
}
