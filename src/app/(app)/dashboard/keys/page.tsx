import type { Metadata } from "next";
import Link from "next/link";
import { KeyReveal } from "@/components/key-reveal";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { graphsOf } from "@/lib/graph-access";
import { keysOf } from "@/lib/keys";
import { requireSession } from "@/lib/session";
import { DashboardShell } from "../dashboard-shell";
import { RevokeKeyButton } from "./revoke-button";

export const metadata: Metadata = { title: "API keys · Roam Publish" };

const fmt = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium" });

/**
 * One key per graph, tied to the account rather than a device. Lost a key? Regenerate it here and
 * paste the new one in Roam; the old one stops working.
 */
export default async function KeysPage() {
  const session = await requireSession("/dashboard/keys");
  const [graphs, keys] = await Promise.all([graphsOf(session.user.id), keysOf(session.user.id)]);

  return (
    <DashboardShell
      current="/dashboard/keys"
      userId={session.user.id}
      description={
        <>
          The Roam Publish extension publishes with your key for that graph. Paste it in Roam under Settings → Roam
          Publish → API key. Lost it? Regenerate it here.
        </>
      }
      narrow
    >
      {graphs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 text-sm">
            <p>Connect a graph first, or accept an invite to someone else&apos;s.</p>
            <Link href="/onboarding" className={buttonVariants()}>
              Connect a graph
            </Link>
          </CardContent>
        </Card>
      )}
      {graphs.map((g) => {
        const key = keys.find((k) => k.graphId === g.id);
        return (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {g.name}
                {g.role === "member" && <Badge variant="outline">Member</Badge>}
              </CardTitle>
              <CardDescription>
                {key
                  ? `Key ${key.start ?? "rp_"}… created ${fmt(key.createdAt)}${key.lastRequest ? `, last used ${fmt(key.lastRequest)}` : ", never used"}.`
                  : "No key yet."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start gap-2">
              {g.suspendedAt ? (
                <p className="text-sm text-muted-foreground">This graph was suspended by a moderator.</p>
              ) : (
                <KeyReveal graphId={g.id} hasKey={!!key} />
              )}
              {key && <RevokeKeyButton graphId={g.id} graphName={g.name} />}
            </CardContent>
          </Card>
        );
      })}
    </DashboardShell>
  );
}
