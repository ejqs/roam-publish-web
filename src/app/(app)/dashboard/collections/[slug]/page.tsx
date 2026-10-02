import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MembersPanel } from "@/components/manage/members-panel";
import { db } from "@/db";
import { collectionEntry, publication, user } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { membersOf, pendingInvitesOn } from "@/lib/invites";
import { collectionPath, entryPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { EntryRow } from "./entry-row";
import { CollectionSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Collection · Roam Publish" };

export default async function CollectionDashboardPage(props: PageProps<"/dashboard/collections/[slug]">) {
  const { slug } = await props.params;
  const session = await requireSession(`/dashboard/collections/${slug}`);
  const c = await loadCollection(decodeURIComponent(slug));
  if (!c) notFound();
  const role = await collectionRole(session.user.id, c.id);
  if (!role) notFound();
  const isOwner = role === "owner";
  const me = session.user.id;

  const [members, invites, owner, entries] = await Promise.all([
    membersOf("collection", c.id),
    isOwner ? pendingInvitesOn("collection", c.id) : [],
    db.query.user.findFirst({ where: eq(user.id, c.ownerId), columns: { email: true } }),
    db
      .select({ entry: collectionEntry, title: publication.title, removedAt: publication.removedAt, addedByEmail: user.email })
      .from(collectionEntry)
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .leftJoin(user, eq(user.id, collectionEntry.addedBy))
      .where(eq(collectionEntry.collectionId, c.id))
      .orderBy(asc(collectionEntry.position), asc(collectionEntry.addedAt)),
  ]);
  const discoverBlocked = c.suspendedAt
    ? "This collection is suspended."
    : c.indexAccess !== "open"
      ? "The collection's page is protected, so it can't list pages on Discover."
      : !c.indexable
        ? "Turn on search engines to use Discover."
        : undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">{c.name}</h1>
        <Link href={collectionPath(c.slug)} className="text-sm text-link hover:underline">
          roam.pub{collectionPath(c.slug)}
        </Link>
        {c.suspendedAt && (
          <p className="text-sm text-destructive">
            Suspended by a moderator{c.suspendedReason ? `: ${c.suspendedReason}` : "."}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pages</h2>
        <p className="text-sm text-muted-foreground">
          Add pages from the dashboard or from a published page&apos;s Manage button. Where each page came from is only
          shown here.
        </p>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pages yet.</p>
        ) : (
          <ul className="divide-y rounded-sm border text-sm">
            {entries.map(({ entry, title, removedAt, addedByEmail }, i) => (
              <EntryRow
                key={entry.id}
                entryId={entry.id}
                title={title}
                path={entryPath(entry.entryUid, title)}
                origin={`${entry.originGraphName} · ${entry.originRootUid}`}
                addedBy={addedByEmail ?? "a former member"}
                removed={!!removedAt}
                canManage={isOwner || entry.addedBy === me}
                canReorder={isOwner}
                first={i === 0}
                last={i === entries.length - 1}
                state={{
                  access: entry.access,
                  hasOwnPassword: !!entry.passwordHash,
                  showAuthor: entry.showAuthor,
                  listing: entry.listing,
                }}
                container={{
                  label: c.name,
                  defaultAccess: c.defaultAccess,
                  hasPassword: !!c.passwordHash,
                  showAuthors: c.showAuthors,
                  discoverBlocked,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
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
          pageCount={entries.length}
        />
      )}
      <MembersPanel
        type="collection"
        targetId={c.id}
        isOwner={isOwner}
        ownerEmail={owner?.email ?? ""}
        meId={me}
        members={members}
        invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
      />
    </div>
  );
}
