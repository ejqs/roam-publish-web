import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { db } from "@/db";
import { graph, publication, user } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { liveGraph, livePublication } from "@/lib/moderation";
import { publicationPath } from "@/lib/publications";
import { plainText } from "@/lib/slug";

/** Opted-in graphs and their latest public pages. Renders nothing until someone opts in. */
export async function Featured() {
  await connection();
  const graphs = await db
    .select({ id: graph.id, name: graph.name })
    .from(graph)
    .innerJoin(user, eq(user.id, graph.userId))
    .where(
      and(eq(graph.featured, true), eq(graph.frontPage, true), eq(graph.indexable, true), liveGraph),
    )
    .orderBy(graph.name);
  if (graphs.length === 0) return null;

  const names = new Map(graphs.map((g) => [g.id, g.name]));
  const recent = await db
    .select({
      graphId: publication.graphId,
      rootUid: publication.rootUid,
      title: publication.title,
    })
    .from(publication)
    .where(
      and(
        inArray(publication.graphId, graphs.map((g) => g.id)),
        eq(publication.visibility, "public"),
        livePublication,
      ),
    )
    .orderBy(desc(publication.updatedAt))
    .limit(10);

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-20 md:grid-cols-[1fr_2fr]">
      <div>
        <h2 className="mb-3 text-lg font-semibold">Featured graphs</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {graphs.map((g) => (
            <li key={g.id}>
              <Link href={graphPath(g.name)} className="text-link hover:underline">
                {g.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {recent.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Recently updated</h2>
          <ul className="flex flex-col divide-y border-y text-sm">
            {recent.map((p) => {
              const graphName = names.get(p.graphId)!;
              return (
                <li key={`${p.graphId}:${p.rootUid}`} className="flex items-baseline gap-3 py-2">
                  <Link
                    href={publicationPath(graphName, p.rootUid, p.title)}
                    className="min-w-0 flex-1 truncate text-link hover:underline"
                  >
                    {plainText(p.title) || "Untitled"}
                  </Link>
                  <span className="shrink-0 text-muted-foreground">{graphName}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
