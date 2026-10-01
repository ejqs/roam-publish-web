import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { slugify } from "./slug";

export function publicationUrl(graphName: string, slug: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/${encodeURIComponent(graphName)}/${slug}`;
}

export async function uniqueSlug(graphId: string, title: string) {
  const base = slugify(title);
  const taken = new Set(
    (
      await db
        .select({ slug: publication.slug })
        .from(publication)
        .where(and(eq(publication.graphId, graphId), like(publication.slug, `${base}%`)))
    ).map((r) => r.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
