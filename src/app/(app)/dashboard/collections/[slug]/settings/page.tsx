import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { collectionEntry } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { requireSession } from "@/lib/session";
import { collectionPagesPath } from "../../../filters";
import { CollectionSettingsForm } from "./settings-form";

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold break-words">{c.name}</h1>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Collection settings</p>
          <div className="flex gap-2">
            <Link href={path} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Pages
            </Link>
            <Link href={`${path}/members`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Members
            </Link>
          </div>
        </div>
      </div>
      <CollectionSettingsForm
        collectionId={c.id}
        initial={{
          name: c.name,
          description: c.description,
          indexAccess: c.indexAccess,
          defaultAccess: c.defaultAccess,
          showAuthors: c.showAuthors,
          indexable: c.indexable,
          featured: c.featured,
          discoverable: c.discoverable,
        }}
        hasPassword={!!c.passwordHash}
        pageCount={pages?.n ?? 0}
      />
    </div>
  );
}
