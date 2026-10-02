import { count, eq, inArray } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { db } from "@/db";
import { collectionEntry, ENTRY_LISTING, profile, publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { canReceiveInvite, graphsOf } from "@/lib/graph-access";
import { graphPath } from "@/lib/graphs";
import { pendingInvitesFor } from "@/lib/invites";
import { collectionPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { AttentionBanners, attentionItems } from "./attention-banners";
import { LISTING_LABELS } from "@/components/manage/choice";
import { AddCollectionDialog } from "./collections/create-form";
import { ACCESS, ACCESS_LABELS, type AccessCounts, accessCounts, discoverBlocked, graphPagesPath } from "./filters";
import { ProfileCard } from "./profile-card";

const EMPTY: AccessCounts = { unlisted: 0, public: 0, discover: 0, removed: 0 };

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  // Graphs you own, then graphs you were invited to publish from.
  const [graphs, invites, collections, eligible] = await Promise.all([
    graphsOf(session.user.id),
    pendingInvitesFor(session.user.id),
    collectionsOf(session.user.id),
    canReceiveInvite(session.user.id),
  ]);
  const owned = graphs.filter((g) => g.role === "owner");
  // Only counts here; the pages themselves are listed per graph at /dashboard/[graph].
  const [me, countRows, entryRows] = await Promise.all([
    db.query.profile.findFirst({ where: eq(profile.userId, session.user.id) }),
    graphs.length
      ? db
          .select({ graphId: publication.graphId, total: count(), ...accessCounts })
          .from(publication)
          .where(inArray(publication.graphId, graphs.map((g) => g.id)))
          .groupBy(publication.graphId)
      : [],
    collections.length
      ? db
          .select({ collectionId: collectionEntry.collectionId, listing: collectionEntry.listing, n: count() })
          .from(collectionEntry)
          .where(inArray(collectionEntry.collectionId, collections.map((c) => c.id)))
          .groupBy(collectionEntry.collectionId, collectionEntry.listing)
      : [],
  ]);
  const entryCounts = new Map<string, Record<(typeof ENTRY_LISTING)[number], number>>();
  for (const r of entryRows) {
    const c = entryCounts.get(r.collectionId) ?? { unlisted: 0, listed: 0, discover: 0 };
    c[r.listing] = r.n;
    entryCounts.set(r.collectionId, c);
  }
  const counts = new Map(countRows.map(({ graphId, ...c }) => [graphId, c]));
  const banners = (
    <AttentionBanners items={attentionItems({ graphs: owned, counts, me, invites: invites.length })} />
  );
  const nav = (
    <div className="flex flex-wrap gap-2">
      <Link href="/dashboard/keys" className={buttonVariants({ variant: "outline", size: "sm" })}>
        API keys
      </Link>
      <Link href="/dashboard/invites" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Invites{invites.length > 0 && ` (${invites.length})`}
      </Link>
    </div>
  );
  const profileCard = (
    <ProfileCard
      username={me?.username ?? null}
      isPublic={me?.isPublic ?? false}
      bio={me?.bio ?? ""}
      hasGraph={owned.some((g) => !g.suspendedAt)}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
    />
  );

  const collectionCards = collections.map((c) => {
    const n = entryCounts.get(c.id) ?? { unlisted: 0, listed: 0, discover: 0 };
    const total = n.unlisted + n.listed + n.discover;
    const manageHref = `/dashboard/collections/${c.slug}`;
    return (
      <Card key={c.id} id={`collection-${c.id}`} className="scroll-mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link href={manageHref} className="hover:underline">
              {c.name}
            </Link>
            <Badge variant="secondary">Collection</Badge>
            {c.role === "member" && <Badge variant="outline">Member</Badge>}
            {c.suspendedAt && <Badge variant="destructive">Suspended</Badge>}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link href={manageHref} className="text-link hover:underline">
              {total.toLocaleString("en-US")} {total === 1 ? "page" : "pages"}
            </Link>
            {total > 0 &&
              ENTRY_LISTING.map((l) => (
                <span key={l} className="contents">
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    {n[l].toLocaleString("en-US")} {l === "discover" ? "on Discover" : LISTING_LABELS[l].toLowerCase()}
                  </span>
                </span>
              ))}
            <span aria-hidden>·</span>
            <Link href={collectionPath(c.slug)} className="text-link hover:underline">
              View collection
            </Link>
          </CardDescription>
          <CardAction>
            <Link href={manageHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {c.role === "owner" ? "Manage" : "Open"}
              <ChevronRightIcon />
            </Link>
          </CardAction>
        </CardHeader>
      </Card>
    );
  });

  if (graphs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
        {banners}
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No graphs connected yet</EmptyTitle>
            <EmptyDescription>
              Start with your personal graph. To publish from a shared graph, ask its owner to invite you.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/onboarding" className={buttonVariants()}>
              Connect a graph
            </Link>
          </EmptyContent>
        </Empty>
        {nav}
        {profileCard}
        {collectionCards}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex flex-wrap justify-end gap-2">
          {eligible && <AddCollectionDialog />}
          <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
            Connect another graph
          </Link>
        </div>
      </div>
      {nav}
      {banners}
      {profileCard}
      {graphs.map((g) => {
        const c = counts.get(g.id) ?? { ...EMPTY, total: 0 };
        const pagesHref = graphPagesPath(g.name);
        const paused = c.discover > 0 && discoverBlocked(g);
        return (
          <Card key={g.id} id={`graph-${g.id}`} className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link href={pagesHref} className="hover:underline">
                  {g.name}
                </Link>
                {g.role === "member" && <Badge variant="outline">Member</Badge>}
              </CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Link href={pagesHref} className="text-link hover:underline">
                  {c.total.toLocaleString("en-US")} published
                </Link>
                {c.total > 0 &&
                  ACCESS.filter((a) => a !== "removed" || c.removed > 0).map((a) => (
                    <span key={a} className="contents">
                      <span aria-hidden>·</span>
                      <Link
                        href={`${pagesHref}?access=${a}`}
                        title={a === "discover" && paused ? `Discover is paused: ${paused}` : undefined}
                        className={`tabular-nums hover:underline ${a === "removed" ? "text-destructive" : "text-link"}`}
                      >
                        {c[a].toLocaleString("en-US")} {a === "discover" ? "on Discover" : ACCESS_LABELS[a].toLowerCase()}
                        {a === "discover" && paused && " (paused)"}
                      </Link>
                    </span>
                  ))}
                {g.frontPage && (
                  <>
                    <span aria-hidden>·</span>
                    <Link href={graphPath(g.name)} className="text-link hover:underline">
                      View front page
                    </Link>
                  </>
                )}
              </CardDescription>
              <CardAction className="flex flex-wrap justify-end gap-2">
                {c.total > 0 && (
                  <Link href={pagesHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Manage pages
                    <ChevronRightIcon />
                  </Link>
                )}
                <Link
                  href={`/dashboard/${encodeURIComponent(g.name)}/members`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Members
                </Link>
                {g.role === "owner" && (
                  <Link
                    href={`/dashboard/${encodeURIComponent(g.name)}/settings`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Settings
                  </Link>
                )}
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 empty:hidden">
              {g.suspendedAt && (
                <Alert variant="destructive">
                  <AlertTitle>This graph was suspended by a moderator</AlertTitle>
                  <AlertDescription>
                    Its pages are hidden and publishing is turned off.
                    {g.suspendedReason && <> Reason: {g.suspendedReason}</>}
                  </AlertDescription>
                </Alert>
              )}
              {c.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing published yet. Right-click a page or block in Roam and choose Publish.
                </p>
              ) : (
                paused && <p className="text-xs text-muted-foreground">Discover is paused: {paused}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
      {collectionCards}
    </div>
  );
}
