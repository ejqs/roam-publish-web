import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MembersPanel } from "@/components/manage/members-panel";
import { db } from "@/db";
import { user } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { membersOf, pendingInvitesOn } from "@/lib/invites";
import { requireSession } from "@/lib/session";
import { collectionPagesPath } from "../../../filters";
import { ResourceHeader, resourceTabs } from "../../../section-tabs";

export const metadata: Metadata = { title: "Collection members · Roam Publish" };

export default async function CollectionMembersPage(props: PageProps<"/dashboard/collections/[slug]/members">) {
  const { slug } = await props.params;
  const session = await requireSession(`/dashboard/collections/${slug}/members`);
  const c = await loadCollection(decodeURIComponent(slug));
  if (!c) notFound();
  const role = await collectionRole(session.user.id, c.id);
  if (!role) notFound();
  const isOwner = role === "owner";
  const path = collectionPagesPath(c.slug);

  const [members, invites, owner] = await Promise.all([
    membersOf("collection", c.id),
    isOwner ? pendingInvitesOn("collection", c.id) : [],
    db.query.user.findFirst({ where: eq(user.id, c.ownerId), columns: { email: true } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={c.name}
        caption={isOwner ? "Invite people to add pages to this collection." : "People who add pages to this collection."}
        tabs={resourceTabs(path, isOwner)}
        current={`${path}/members`}
      />
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <MembersPanel
          type="collection"
          targetId={c.id}
          isOwner={isOwner}
          ownerEmail={owner?.email ?? ""}
          meId={session.user.id}
          members={members}
          invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
