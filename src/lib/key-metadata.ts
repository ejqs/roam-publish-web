/** The graph an API key was issued for. Older keys may hold their metadata stringified twice. */
export function keyGraphId(metadata: unknown): string | null {
  let m = metadata;
  for (let i = 0; i < 2 && typeof m === "string"; i++) {
    try {
      m = JSON.parse(m);
    } catch {
      return null;
    }
  }
  const id = (m as { graphId?: unknown } | null)?.graphId;
  return typeof id === "string" ? id : null;
}
