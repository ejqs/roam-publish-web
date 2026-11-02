import GraphRoute from "@/app/[graph]/[uid]/[[...slug]]/page";
import LinkRoute from "@/app/l/[id]/[[...slug]]/page";

/** Where a page's `redirect()` was headed, or null when `e` isn't one. */
export function redirectedTo(e: unknown): string | null {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  return digest.split(";")[2] ?? null;
}

/**
 * A reader opening /{graph}/{uid}: what the page renders, following the redirect an Unlisted page
 * makes to its /l/{linkId} address, as a browser would.
 */
export async function readGraphPage(graph: string, uid: string) {
  try {
    return await GraphRoute({ params: Promise.resolve({ graph, uid }) } as never);
  } catch (e) {
    const to = redirectedTo(e);
    const id = to?.match(/^\/l\/([^/?]+)/)?.[1];
    if (!id) throw e;
    return LinkRoute({ params: Promise.resolve({ id }) } as never);
  }
}
