import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canReceiveInvite } from "@/lib/graph-access";
import { pendingInvitesFor } from "@/lib/invites";
import { requireSession } from "@/lib/session";
import { InviteActions } from "./invite-actions";

export const metadata: Metadata = { title: "Invites · Roam Publish" };

export default async function InvitesPage() {
  const session = await requireSession("/dashboard/invites");
  const [invites, eligible] = await Promise.all([
    pendingInvitesFor(session.user.id),
    canReceiveInvite(session.user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Invites</h1>
      </div>
      {!eligible && invites.length > 0 && (
        <p className="text-sm text-muted-foreground">
          To accept, connect a graph of your own first (<Link href="/onboarding" className="text-link hover:underline">connect a graph</Link>).
        </p>
      )}
      {invites.length === 0 && <p className="text-sm text-muted-foreground">No invites waiting.</p>}
      {invites.map((i) => (
        <Card key={i.id}>
          <CardHeader>
            <CardTitle>
              {i.kind === "transfer" ? "Take over " : "Join "}
              {i.targetType === "graph" ? "the graph " : "the collection "}
              {i.targetName}
            </CardTitle>
            <CardDescription>
              From {i.inviter?.email ?? "its owner"}.{" "}
              {i.kind === "transfer"
                ? "You'd become the owner; they'd stay on as a member."
                : i.targetType === "graph"
                  ? "You'd get your own API key to publish from this graph, and manage the pages you publish."
                  : "You'd be able to add pages you publish to this collection."}{" "}
              Expires {i.expiresAt.toLocaleDateString("en-US", { dateStyle: "medium" })}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteActions inviteId={i.id} disabled={!eligible} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
