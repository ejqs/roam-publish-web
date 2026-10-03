import { count, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { graphsOf } from "@/lib/graph-access";
import { requireSession } from "@/lib/session";
import { DashboardShell } from "../dashboard/dashboard-shell";
import { DeleteAccountCard } from "../dashboard/delete-account";

export const metadata: Metadata = { title: "Settings · Roam Publish" };

/** Rarely used, irreversible account actions live here, away from the day-to-day dashboard. */
export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const [graphs, collections] = await Promise.all([graphsOf(session.user.id), collectionsOf(session.user.id)]);
  const owned = graphs.filter((g) => g.role === "owner");
  const [{ pages }] = owned.length
    ? await db
        .select({ pages: count() })
        .from(publication)
        .where(inArray(publication.graphId, owned.map((g) => g.id)))
    : [{ pages: 0 }];

  return (
    <DashboardShell
      current="/settings"
      userId={session.user.id}
      description="Account-level actions you rarely need."
      narrow
    >
      <DeleteAccountCard
        email={session.user.email}
        graphs={owned.map((g) => g.name)}
        pages={pages}
        collections={collections.filter((c) => c.role === "owner").length}
      />
    </DashboardShell>
  );
}
