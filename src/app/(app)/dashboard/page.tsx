import { count, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { LISTING_LABELS } from "@/components/manage/labels";
import { AddCollectionDialog } from "./collections/create-form";
import { ACCESS, ACCESS_LABELS, type AccessCounts, accessCounts, collectionPagesPath, discoverBlocked, graphPagesPath } from "./filters";
import { ProfileCard } from "./profile-card";
import { type ResourceItem, ResourceList } from "./resource-list";

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
      <Link href="/dashboard/advanced" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Advanced
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

  const collectionItems: ResourceItem[] = collections.map((c) => {
    const n = entryCounts.get(c.id) ?? { unlisted: 0, listed: 0, discover: 0 };
    const total = n.unlisted + n.listed + n.discover;
    const manageHref = collectionPagesPath(c.slug);
    return {
      id: c.id,
      anchor: `collection-${c.id}`,
      name: c.name,
      manageHref,
      badges: (
        <>
          {c.role === "member" && <Badge variant="outline">Member</Badge>}
          {c.suspendedAt && <Badge variant="destructive">Suspended</Badge>}
        </>
      ),
      summary: { label: `${total.toLocaleString("en-US")} ${total === 1 ? "page" : "pages"}`, href: manageHref },
      stats: ENTRY_LISTING.filter((l) => n[l] > 0).map((l) => ({
        label: `${n[l].toLocaleString("en-US")} ${l === "discover" ? "on Discover" : LISTING_LABELS[l].toLowerCase()}`,
      })),
      viewHref: collectionPath(c.slug),
      viewLabel: "View collection",
      membersHref: `${manageHref}/members`,
      settingsHref: c.role === "owner" ? `${manageHref}/settings` : undefined,
      canManage: total > 0,
      note:
        total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pages yet. Add pages from a graph&apos;s list or a published page&apos;s Manage button.
          </p>
        ) : undefined,
    };
  });
  const collectionCards = <ResourceList title="Collections" items={collectionItems} />;

  const graphItems: ResourceItem[] = graphs.map((g) => {
    const c = counts.get(g.id) ?? { ...EMPTY, total: 0 };
    const pagesHref = graphPagesPath(g.name);
    const paused = c.discover > 0 && discoverBlocked(g);
    const base = `/dashboard/${encodeURIComponent(g.name)}`;
    return {
      id: g.id,
      anchor: `graph-${g.id}`,
      name: g.name,
      manageHref: pagesHref,
      badges: g.role === "member" ? <Badge variant="outline">Member</Badge> : undefined,
      summary: { label: `${c.total.toLocaleString("en-US")} published`, href: pagesHref },
      stats: ACCESS.filter((a) => c[a] > 0).map((a) => ({
        label: `${c[a].toLocaleString("en-US")} ${a === "discover" ? "on Discover" : ACCESS_LABELS[a].toLowerCase()}${a === "discover" && paused ? " (paused)" : ""}`,
        href: `${pagesHref}?access=${a}`,
        tone: a === "removed" ? ("destructive" as const) : undefined,
        title: a === "discover" && paused ? `Discover is paused: ${paused}` : undefined,
      })),
      viewHref: g.frontPage ? graphPath(g.name) : undefined,
      viewLabel: "View front page",
      membersHref: `${base}/members`,
      settingsHref: g.role === "owner" ? `${base}/settings` : undefined,
      canManage: c.total > 0,
      note:
        g.suspendedAt || c.total === 0 || paused ? (
          <>
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
          </>
        ) : undefined,
    };
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
      <ResourceList title="Graphs" items={graphItems} />
      {collectionCards}
    </div>
  );
}
