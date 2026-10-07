import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { collectionEntry, publication } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { loadFolders } from "@/lib/front-page";
import { collectionPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { ArrangeForm } from "../../../arrange-form";
import { arrangeKey } from "../../../arrange-key";
import { collectionPagesPath } from "../../../filters";
import { ResourceHeader, resourceTabs } from "../../../section-tabs";

export const metadata: Metadata = { title: "Arrange collection · Roam Publish" };

export default async function CollectionArrangePage(props: PageProps<"/dashboard/collections/[slug]/arrange">) {
  const { slug } = await props.params;
  const session = await requireSession(`/dashboard/collections/${slug}/arrange`);
  const c = await loadCollection(decodeURIComponent(slug));
  if (!c) notFound();
  if ((await collectionRole(session.user.id, c.id)) !== "owner") notFound();
  const [folders, items] = await Promise.all([
    loadFolders({ collectionId: c.id }),
    // What the front page lists, in the collection's order.
    db
      .select({ id: collectionEntry.id, title: publication.title, kind: publication.kind, folderId: collectionEntry.folderId })
      .from(collectionEntry)
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .where(and(eq(collectionEntry.collectionId, c.id), ne(collectionEntry.listing, "unlisted"), isNull(publication.removedAt)))
      .orderBy(asc(collectionEntry.position), asc(collectionEntry.addedAt)),
  ]);
  const path = collectionPagesPath(c.slug);
  const saved = { layout: c.frontLayout, folders: folders.map(({ id, name, parentId }) => ({ id, name, parentId })), items };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 sm:pt-12">
      <ResourceHeader
        name={c.name}
        caption="Arrange the front page"
        view={{ href: collectionPath(c.slug), label: "View collection" }}
        tabs={resourceTabs(path, true)}
        current={`${path}/arrange`}
      />
      <div className="w-full max-w-3xl">
        <ArrangeForm key={arrangeKey(saved)} target={{ kind: "collection", id: c.id }} {...saved} />
      </div>
    </div>
  );
}
