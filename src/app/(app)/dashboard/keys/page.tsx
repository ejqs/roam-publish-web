import type { Metadata } from "next";
import Link from "next/link";
import { KeyReveal } from "@/components/key-reveal";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { graphsOf } from "@/lib/graph-access";
import { keysOf } from "@/lib/keys";
import { requireSession } from "@/lib/session";
import { revokeKey } from "./actions";

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">API keys</h1>
        <p className="text-sm text-muted-foreground">
          The Roam Publish extension publishes with your key for that graph. Paste it in Roam under Settings → Roam
          Publish → API key. Lost it? Regenerate it here.
        </p>
      </div>
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
              {key && (
                <form action={revokeKey.bind(null, g.id)}>
                  <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                    Revoke
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
