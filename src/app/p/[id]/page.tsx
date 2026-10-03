import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { graphPagesPath } from "@/app/(app)/dashboard/filters";
import { CopyButton } from "@/components/copy-button";
import { ACCESS_LABELS, LISTING_LABELS } from "@/components/manage/labels";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { pageHistory } from "@/lib/changelog";
import { collection, collectionEntry, graph, publication, shortlink } from "@/db/schema";
import { effectiveAccess } from "@/lib/gates";
import { canManage, graphRole } from "@/lib/graph-access";
import { entryUrl, publicationUrl } from "@/lib/publications";
import { SHORT_ID } from "@/lib/shortlinks";
import { plainText } from "@/lib/slug";
import { bylineFor, viewerId } from "@/lib/viewer";

/** `[label](url)` and bare URLs in a history entry, as links. */
const LINKS = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

function EntryText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINKS)) {
    parts.push(text.slice(last, m.index));
    const url = m[2] ?? m[3];
    parts.push(
      <a key={m.index} href={url} className="break-all underline underline-offset-2 hover:text-foreground">
        {m[1] ?? url}
      </a>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export const metadata: Metadata = { title: "Roam Publish Status", robots: { index: false, follow: false } };

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
 * A page's status link, for people in its graph: where the page lives now, with links to copy, and
 * its history (the change log, also written into Roam when the graph has a token). Signed-out
 * visitors are sent to log in; anyone else signed in gets a 404, never the page itself.
 */
export default async function ShortlinkPage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  const data = await load(id);
  if (!data) notFound();
  const { g, pub } = data;
  const uid = await viewerId();
  if (!uid) redirect(`/login?next=${encodeURIComponent(`/p/${id}`)}`);
  const role = await graphRole(uid, g.id);
  if (!role) notFound();

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
                listing: pub.visibility === "unlisted" ? "Unlisted" : pub.discoverable ? "Discoverable" : "Listed",
                access: ACCESS_LABELS[effectiveAccess({ ...g, kind: "graph" }, pub)],
              },
            ]
          : []),
        ...entries.map(({ entry, c }) => ({
          key: entry.id,
          where: `Collection · ${c.name}`,
          url: entryUrl(c.slug, entry.entryUid, pub.title),
          listing: LISTING_LABELS[entry.listing],
          access: ACCESS_LABELS[effectiveAccess({ ...c, kind: "collection" }, entry)],
        })),
      ]
    : [];
  const history = await pageHistory(data.link.id);
  const byline = pub ? await bylineFor(pub, true) : null;
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: g.timeZone ?? "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const at = (d: Date) => when.format(d) + (g.timeZone ? "" : " UTC");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:py-12">
      <Card>
        <CardHeader>
          <CardDescription>Roam Publish Status</CardDescription>
          <CardTitle className="text-xl break-words">
            {pub ? plainText(pub.title) : "Not published right now"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {[
              pub && `Last updated ${at(pub.updatedAt)}`,
              `First published ${at(data.link.createdAt)}`,
              byline && `By ${byline.label}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-sm text-muted-foreground">
            Only your graph&apos;s members see this page. Share one of the links below.
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
          {pub && canManage(role, uid, pub) && (
            <Link
              href={graphPagesPath(g.name)}
              className={buttonVariants({ variant: "outline", className: "self-start" })}
            >
              Manage on the dashboard
            </Link>
          )}
        </CardContent>
        <CardFooter className="block p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-(--card-spacing) py-3 text-sm font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              History
              {history.length > 0 && <span className="font-normal">({history.length})</span>}
            </summary>
            <div className="px-(--card-spacing) pb-(--card-spacing)">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet. Changes are recorded from now on.</p>
              ) : (
                <ol className="flex flex-col divide-y rounded-lg border bg-card">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-col gap-0.5 p-3 text-sm sm:flex-row sm:gap-3">
                      <time
                        dateTime={h.createdAt.toISOString()}
                        className="shrink-0 text-muted-foreground tabular-nums sm:w-44"
                      >
                        {when.format(h.createdAt)}
                      </time>
                      <span className="min-w-0 break-words">
                        <EntryText text={h.text} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </details>
        </CardFooter>
      </Card>
    </main>
  );
}
