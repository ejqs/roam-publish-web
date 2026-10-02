import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { graphPagesPath } from "@/app/(app)/dashboard/filters";
import { CopyButton } from "@/components/copy-button";
import { ACCESS_LABELS, LISTING_LABELS } from "@/components/manage/labels";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { collection, collectionEntry, graph, publication, shortlink } from "@/db/schema";
import { effectiveAccess } from "@/lib/gates";
import { canManage, graphRole } from "@/lib/graph-access";
import { primaryUrls } from "@/lib/places";
import { entryUrl, publicationUrl } from "@/lib/publications";
import { SHORT_ID, shortUrl } from "@/lib/shortlinks";
import { plainText } from "@/lib/slug";
import { viewerId } from "@/lib/viewer";

export const metadata: Metadata = { title: "Shortlink · Roam Publish", robots: { index: false, follow: false } };

const load = cache(async (id: string) => {
  if (!SHORT_ID.test(id)) return null;
  const [row] = await db
    .select({ link: shortlink, g: graph })
    .from(shortlink)
    .innerJoin(graph, eq(graph.id, shortlink.graphId))
    .where(eq(shortlink.id, id))
    .limit(1);
  if (!row) return null;
  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, row.g.id), eq(publication.rootUid, row.link.rootUid)),
  });
  return { ...row, pub };
});

/**
 * A page's permanent link. People in its graph see where the page lives now, with links to copy.
 * Everyone else goes to the first place anyone can read it (its graph, then its collections in the
 * order it was added), or, when every place is protected, to its main URL and that place's gate.
 */
export default async function ShortlinkPage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) notFound();
  const { g, pub } = data;

  const entries = pub
    ? await db
        .select({ entry: collectionEntry, c: collection })
        .from(collectionEntry)
        .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
        .where(eq(collectionEntry.publicationId, pub.id))
        .orderBy(asc(collectionEntry.addedAt))
    : [];
  const places = pub
    ? [
        ...(pub.inGraph
          ? [
              {
                key: "graph",
                where: `Graph · ${g.name}`,
                url: publicationUrl(g.name, pub.rootUid, pub.title),
                listing: pub.visibility === "unlisted" ? "Not listed" : pub.discoverable ? "Discover" : "Listed",
                access: ACCESS_LABELS[effectiveAccess({ ...g, kind: "graph" }, pub)],
                open: effectiveAccess({ ...g, kind: "graph" }, pub) === "open",
              },
            ]
          : []),
        ...entries.map(({ entry, c }) => ({
          key: entry.id,
          where: `Collection · ${c.name}`,
          url: entryUrl(c.slug, entry.entryUid, pub.title),
          listing: LISTING_LABELS[entry.listing],
          access: ACCESS_LABELS[effectiveAccess({ ...c, kind: "collection" }, entry)],
          open: !c.suspendedAt && effectiveAccess({ ...c, kind: "collection" }, entry) === "open",
        })),
      ]
    : [];
  const uid = await viewerId();
  const role = uid ? await graphRole(uid, g.id) : null;
  if (!role) {
    if (!pub || pub.removedAt || g.suspendedAt) notFound();
    redirect(places.find((p) => p.open)?.url ?? (await primaryUrls(g.name, [pub])).get(pub.id)!);
  }
  const link = shortUrl(id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12">
      <Card>
        <CardHeader>
          <CardDescription>Shortlink</CardDescription>
          <CardTitle className="text-xl break-words">
            {pub ? plainText(pub.title) : "Not published right now"}
          </CardTitle>
          <code className="truncate pt-1 text-sm text-muted-foreground">{link}</code>
          <p className="text-sm text-muted-foreground">
            Share the graph or collection links below. This shortlink sends visitors to the first public place
            this page lives, so where it leads can change.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!pub && (
            <p className="text-sm text-muted-foreground">
              This page or block from {g.name} isn&apos;t published. Publishing it again from Roam brings this
              link back.
            </p>
          )}
          {pub?.removedAt && (
            <p className="text-sm text-destructive">Removed by a moderator. Readers can&apos;t open it.</p>
          )}
          {places.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {places.map((p) => (
                <li key={p.key} className="flex items-center gap-3 p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {p.where}
                      <Badge variant="secondary">{p.listing}</Badge>
                      <Badge variant="outline">{p.access}</Badge>
                    </div>
                    <a href={p.url} className="truncate text-sm text-muted-foreground hover:underline">
                      {p.url}
                    </a>
                  </div>
                  <CopyButton text={p.url} />
                </li>
              ))}
            </ul>
          )}
          {pub && uid && canManage(role, uid, pub) && (
            <Link
              href={graphPagesPath(g.name)}
              className={buttonVariants({ variant: "outline", className: "self-start" })}
            >
              Manage on the dashboard
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
