import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { collectionsOf } from "@/lib/collections";
import { canReceiveInvite } from "@/lib/graph-access";
import { collectionPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { collectionPagesPath } from "@/lib/dashboard-filters";
import { AddCollectionDialog } from "./create-form";

export const metadata: Metadata = { title: "Collections · Roam Publish" };

export default async function CollectionsPage() {
  const session = await requireSession("/dashboard/collections");
  const [collections, eligible] = await Promise.all([
    collectionsOf(session.user.id),
    canReceiveInvite(session.user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">Collections</h1>
        <p className="text-sm text-muted-foreground">
          A collection gathers pages from any of your graphs, and from the people you invite, at roam.pub/c/name.
        </p>
      </div>
      {eligible ? (
        <div>
          <AddCollectionDialog variant="default" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Verify your email and <Link href="/onboarding" className="text-link hover:underline">connect a graph</Link> of
          your own to start a collection.
        </p>
      )}
      {collections.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {c.name}
              {c.role === "member" && <Badge variant="outline">Member</Badge>}
              {c.suspendedAt && <Badge variant="destructive">Suspended</Badge>}
            </CardTitle>
            <CardDescription>
              <Link href={collectionPath(c.slug)} className="text-link hover:underline">
                roam.pub{collectionPath(c.slug)}
              </Link>
            </CardDescription>
            <CardAction className="flex flex-wrap justify-end gap-2">
              <Link href={collectionPagesPath(c.slug)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Manage pages
              </Link>
              <Link
                href={`${collectionPagesPath(c.slug)}/members`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Members
              </Link>
              {c.role === "owner" && (
                <Link
                  href={`${collectionPagesPath(c.slug)}/settings`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Settings
                </Link>
              )}
            </CardAction>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
