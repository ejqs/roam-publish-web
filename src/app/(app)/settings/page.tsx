import { count, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { graphsOf } from "@/lib/graph-access";
import { requireSession } from "@/lib/session";
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Account-level actions you rarely need.</p>
      </div>
      <DeleteAccountCard
        email={session.user.email}
        graphs={owned.map((g) => g.name)}
        pages={pages}
        collections={collections.filter((c) => c.role === "owner").length}
      />
    </div>
  );
}
