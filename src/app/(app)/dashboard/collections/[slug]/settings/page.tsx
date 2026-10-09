import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { collectionEntry } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { requireSession } from "@/lib/session";
import { collectionPagesPath } from "@/lib/dashboard-filters";
import { lockKeyOf, sealedPageTitles } from "@/lib/encryption";
import { CollectionSettingsForm } from "./settings-form";
import { ResourceHeader, resourceTabs } from "../../../section-tabs";
import { PinCard } from "@/components/manage/pin-card";
import { collectionPageLink, pinBlocked } from "@/lib/pin-rules";
import { pinOf } from "@/lib/pins";
import { collectionUrl } from "@/lib/publications";

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
  const pin = await pinOf({ kind: "collection", collectionId: c.id });
  const pinned = pinBlocked(collectionPageLink(c.name), pin);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={c.name}
        caption="Collection settings"
        tabs={resourceTabs(path, true)}
        current={`${path}/settings`}
      />
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <PinCard
          title="Collection link"
          path={new URL(collectionUrl(c.slug)).pathname}
          target={{ kind: "collection", collectionId: c.id }}
          pin={pin}
          blocks={`It can't be moved to Password or Members while it's pinned, its password stays as it is, and ${c.name} can't be deleted.`}
        />
        <CollectionSettingsForm
          pinned={pinned ? { reason: pinned, from: c.indexAccess } : undefined}
          collectionId={c.id}
          slug={c.slug}
          initial={{
            name: c.name,
            description: c.description,
            indexAccess: c.indexAccess,
            defaultAccess: c.defaultAccess,
            encryptNewPages: c.encryptNewPages,
            pagesLeaveGraph: c.pagesLeaveGraph,
            showAuthors: c.showAuthors,
            views: c.views,
            showViewCountries: c.showViewCountries,
            indexable: c.indexable,
            searchListed: c.searchListed,
            featured: c.featured,
            discoverable: c.discoverable,
            rss: c.rss,
          }}
          hasPassword={!!c.passwordHash}
          canEncrypt={!!c.passwordHash && !!(await lockKeyOf(db, { scope: "collection", id: c.id }))}
          pageCount={pages?.n ?? 0}
          encryptedPages={await sealedPageTitles({ scope: "collection", id: c.id })}
        />
      </div>
    </div>
  );
}
