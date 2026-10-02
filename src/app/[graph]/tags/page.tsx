import { and, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { GateNotice } from "@/components/gate-notice";
import { RemovedNotice } from "@/components/removed-notice";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { publication } from "@/db/schema";
import { containerLock, gate } from "@/lib/gates";
import { graphRole } from "@/lib/graph-access";
import { graphPath, loadGraph } from "@/lib/graphs";
import { GRAPH_LIST, listHref, parseListState } from "@/lib/list-params";
import { tagCounts } from "@/lib/list-query";
import { livePublication } from "@/lib/moderation";
import { publicProfile } from "@/lib/profiles";
import { viewerId } from "@/lib/viewer";
import { cn } from "cn";

const MAX_TAGS = 500;

async function frontPageGraph(props: PageProps<"/[graph]/tags">) {
  const { graph: graphName } = await props.params;
  const g = await loadGraph(decodeURIComponent(graphName));
  return g?.frontPage ? g : null;
}

export async function generateMetadata(props: PageProps<"/[graph]/tags">): Promise<Metadata> {
  const g = await frontPageGraph(props);
  if (!g) return { title: "Not found" };
  if (g.takenDown) return { title: "Removed", robots: { index: false, follow: false } };
  return {
    title: `Tags · ${g.name}`,
    alternates: { canonical: `${graphPath(g.name)}/tags` },
    robots: g.indexable && g.indexAccess === "open" ? undefined : { index: false, follow: false },
  };
}

/** Every tag on a graph's listed pages, each linking to its pages on the front page. */
export default async function GraphTags(props: PageProps<"/[graph]/tags">) {
  const g = await frontPageGraph(props);
  if (!g) notFound();
  if (g.takenDown) return <RemovedNotice what="graph" />;
  const path = graphPath(g.name);
  const me = await viewerId();
  const role = me ? await graphRole(me, g.id) : null;
  const blocker = await gate(g.indexAccess, containerLock({ ...g, kind: "graph" }), {
    member: !!role,
    manager: false,
    signedIn: !!me,
  });
  if (blocker) return <GateNotice blocker={blocker} what="graph" next={`${path}/tags`} />;
  const alphabetical = (await props.searchParams).sort === "az";

  const visible = and(
    eq(publication.graphId, g.id),
    eq(publication.inGraph, true),
    eq(publication.visibility, "public"),
    livePublication,
  );
  const [tags, owner] = await Promise.all([
    tagCounts(sql`from ${publication}`, visible, MAX_TAGS),
    g.showOwner ? publicProfile(g.userId) : null,
  ]);
  if (alphabetical) tags.sort((a, b) => a.tag.localeCompare(b.tag));
  const tagHref = (t: string) => listHref(GRAPH_LIST, path, parseListState(GRAPH_LIST, {}), { tags: [t] });
  const segment = (on: boolean) =>
    cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-none first:rounded-l-sm last:rounded-r-sm", on && "bg-muted font-medium");

  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 left-4 flex items-center justify-end gap-1">
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          <Breadcrumbs
            items={[
              ...(owner ? [{ label: `@${owner.username}`, href: `/u/${owner.username}` }] : []),
              { label: g.name, href: path },
              { label: "Tags" },
            ]}
          />
          <h1 className="mb-1 text-[32px] sm:text-[42px] leading-tight font-semibold break-words">Tags</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {tags.length} {tags.length === 1 ? "tag" : "tags"} on pages in {g.name}
          </p>
          {tags.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No tags yet</EmptyTitle>
                <EmptyDescription>Pages get tags from #tags and Tags:: in Roam.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <div className="inline-flex rounded-sm shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)]" role="group" aria-label="Order tags">
                  <Link href={`${path}/tags`} aria-current={!alphabetical ? "true" : undefined} className={segment(!alphabetical)}>
                    Most used
                  </Link>
                  <Link href={`${path}/tags?sort=az`} aria-current={alphabetical ? "true" : undefined} className={segment(alphabetical)}>
                    A–Z
                  </Link>
                </div>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 border-t text-sm sm:grid-cols-3">
                {tags.map(({ tag, n }) => (
                  <li key={tag} className="border-b">
                    <Link href={tagHref(tag)} className="flex justify-between gap-2 py-2 hover:underline">
                      <span className="truncate text-roam-ref">#{tag}</span>
                      <span className="text-muted-foreground tabular-nums">{n}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
