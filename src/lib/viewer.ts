import { headers } from "next/headers";
import { cache } from "react";
import type { Byline } from "@/components/publication-view";
import { auth } from "./auth";
import { publicProfile } from "./profiles";

/** The signed-in reader's id, or null. Reading the session makes the page per-request. */
export const viewerId = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
});

/** "By {Author name}" from the extension, else the publisher's public @username, else nothing. */
export async function bylineFor(
  pub: { authorName: string | null; publishedBy: string | null },
  show: boolean,
): Promise<Byline> {
  if (!show) return null;
  if (pub.authorName) return { label: pub.authorName };
  const profile = pub.publishedBy ? await publicProfile(pub.publishedBy) : null;
  return profile ? { label: `@${profile.username}`, href: `/u/${profile.username}` } : null;
}
