import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { collectionEntry } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { requireSession } from "@/lib/session";
import { collectionPagesPath } from "../../../filters";
import { sealedPageTitles } from "@/lib/encryption";
import { CollectionSettingsForm } from "./settings-form";
import { ResourceHeader, resourceTabs } from "../../../section-tabs";

export const metadata: Metadata = { title: "Collection settings · Roam Publish" };

export default async function CollectionSettingsPage(props: PageProps<"/dashboard/collections/[slug]/settings">) {
  const { slug } = await props.params;
  const session = await requireSession(`/dashboard/collections/${slug}/settings`);
  const c = await loadCollection(decodeURIComponent(slug));
  if (!c) notFound();
  if ((await collectionRole(session.user.id, c.id)) !== "owner") notFound();
  const path = collectionPagesPath(c.slug);
  const [pages] = await db
    .select({ n: count() })
    .from(collectionEntry)
    .where(eq(collectionEntry.collectionId, c.id));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={c.name}
        caption="Collection settings"
        tabs={resourceTabs(path, true)}
        current={`${path}/settings`}
      />
      <CollectionSettingsForm
        collectionId={c.id}
        slug={c.slug}
        initial={{
          name: c.name,
          description: c.description,
          indexAccess: c.indexAccess,
          defaultAccess: c.defaultAccess,
          showAuthors: c.showAuthors,
          views: c.views,
          showViewCountries: c.showViewCountries,
          indexable: c.indexable,
          featured: c.featured,
          discoverable: c.discoverable,
          rss: c.rss,
        }}
        hasPassword={!!c.passwordHash}
        pageCount={pages?.n ?? 0}
        encryptedPages={await sealedPageTitles({ scope: "collection", id: c.id })}
      />
    </div>
  );
}
