import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MembersPanel } from "@/components/manage/members-panel";
import { db } from "@/db";
import { graph, user } from "@/db/schema";
import { graphRole } from "@/lib/graph-access";
import { membersOf, pendingInvitesOn } from "@/lib/invites";
import { keysOf } from "@/lib/keys";
import { requireSession } from "@/lib/session";
import { graphPagesPath } from "../../filters";
import { ResourceHeader, resourceTabs } from "../../section-tabs";

export const metadata: Metadata = { title: "Graph members · Roam Publish" };

const fmt = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium" });

export default async function GraphMembersPage(props: PageProps<"/dashboard/[graph]/members">) {
  const { graph: graphName } = await props.params;
  const session = await requireSession(`/dashboard/${graphName}/members`);
  const g = await db.query.graph.findFirst({ where: eq(graph.name, decodeURIComponent(graphName)) });
  if (!g) notFound();
  const role = await graphRole(session.user.id, g.id);
  if (!role) notFound();
  const isOwner = role === "owner";

  const [members, invites, owner] = await Promise.all([
    membersOf("graph", g.id),
    isOwner ? pendingInvitesOn("graph", g.id) : [],
    db.query.user.findFirst({ where: eq(user.id, g.userId), columns: { email: true } }),
  ]);
  const rows = await Promise.all(
    members.map(async (m) => {
      const key = isOwner ? (await keysOf(m.userId)).find((k) => k.graphId === g.id) : undefined;
      return {
        userId: m.userId,
        email: m.email,
        name: m.name,
        detail: isOwner
          ? key
            ? `Extension connected${key.lastRequest ? ` · last used ${fmt(key.lastRequest)}` : ""}`
            : "No API key yet"
          : undefined,
      };
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={g.name}
        caption={isOwner ? "Invite the people you share this Roam graph with." : "People who publish from this graph."}
        tabs={resourceTabs(graphPagesPath(g.name), isOwner, true)}
        current={`${graphPagesPath(g.name)}/members`}
      />
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <MembersPanel
          type="graph"
          targetId={g.id}
          isOwner={isOwner}
          ownerEmail={owner?.email ?? ""}
          meId={session.user.id}
          members={rows}
          invites={invites.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        />
      </div>
    </div>
  );
}
