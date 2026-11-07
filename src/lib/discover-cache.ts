import "server-only";
import { revalidateTag, updateTag } from "next/cache";
import { DISCOVER_TAG } from "@/lib/discover";

/**
 * Where a change runs. Next.js only allows `updateTag` in a Server Action; a Route Handler (the
 * extension API) throws on it and must use `revalidateTag`.
 */
export type CacheFrom = "action" | "route";

/** Drops Discover's cached lists so the change shows on its next load. */
export function expireDiscover(from: CacheFrom) {
  if (from === "action") updateTag(DISCOVER_TAG);
  // expire: 0, so the next visit waits for fresh lists instead of seeing the old ones.
  else revalidateTag(DISCOVER_TAG, { expire: 0 });
}
