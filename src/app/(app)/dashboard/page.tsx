import { count, eq, inArray } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
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
import { ChangeLogIssues } from "./change-log-issues";
import { missingChangeLogBlocks } from "@/lib/changelog";
import { AddCollectionDialog } from "./collections/create-form";
import { type AccessCounts, accessCounts, collectionPagesPath, discoverBlocked, graphPagesPath } from "./filters";
import { ProfileCard } from "./profile-card";
import { LevelLegend, type ResourceItem, ResourceList } from "./resource-list";
import { SectionTabs } from "./section-tabs";

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
  const changeLogIssues = await missingChangeLogBlocks(session.user.id);
  const banners = (
    <>
      <AttentionBanners items={attentionItems({ graphs: owned, counts, me, invites: invites.length })} />
      <ChangeLogIssues issues={changeLogIssues} />
    </>
  );
  const nav = (
    <SectionTabs
      label="Dashboard sections"
      current="/dashboard"
      tabs={[
        { href: "/dashboard", label: "Overview" },
        { href: "/dashboard/keys", label: "API keys" },
        { href: "/dashboard/invites", label: "Invites", count: invites.length },
        { href: "/settings", label: "Settings" },
      ]}
    />
  );
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const sum = (k: "total" | "removed" | "discover") =>
    [...counts.values()].reduce((n, c) => n + c[k], 0);
  const published = sum("total") - sum("removed");
  const stat = (n: number, label: string) => (
    <span>
      <strong className="font-semibold text-foreground tabular-nums">{n.toLocaleString("en-US")}</strong> {label}
    </span>
  );
  const stats =
    graphs.length > 0 ? (
      <>
        {stat(published, published === 1 ? "page published" : "pages published")}
        {sum("discover") > 0 && stat(sum("discover"), "on Discover")}
        {stat(graphs.length, graphs.length === 1 ? "graph" : "graphs")}
        {collections.length > 0 && stat(collections.length, collections.length === 1 ? "collection" : "collections")}
      </>
    ) : undefined;
  const profileCard = (
    <ProfileCard
      username={me?.username ?? null}
      isPublic={me?.isPublic ?? false}
      bio={me?.bio ?? ""}
      hasGraph={owned.some((g) => !g.suspendedAt)}
      appUrl={appUrl}
      stats={stats}
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
      role: c.role === "owner" ? "Owner" : "Member",
      badges: c.suspendedAt ? <Badge variant="destructive">Suspended</Badge> : undefined,
      total,
      segments: [
        { level: "unlisted", n: n.unlisted, href: `${manageHref}?access=unlisted` },
        { level: "listed", n: n.listed, href: `${manageHref}?access=listed` },
        { level: "discover", n: n.discover, href: `${manageHref}?access=discover` },
      ],
      view: { href: collectionPath(c.slug), url: `${appUrl}${collectionPath(c.slug)}`, label: "View collection" },
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
  const collectionCards = (
    <ResourceList
      title="Collections"
      nameLabel="Collection"
      description={
        <p className="text-xs text-muted-foreground">Hand-picked sets of pages from any of your graphs.</p>
      }
      action={eligible && <AddCollectionDialog variant="default" />}
      items={collectionItems}
    />
  );

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
      role: g.role === "owner" ? "Owner" : "Member",
      total: c.total,
      segments: [
        { level: "unlisted", n: c.unlisted, href: `${pagesHref}?access=unlisted` },
        { level: "listed", n: c.public, href: `${pagesHref}?access=public` },
        {
          level: "discover",
          n: c.discover,
          href: `${pagesHref}?access=discover`,
          title: paused ? `Discover is paused: ${paused}` : undefined,
          suffix: paused ? " (paused)" : undefined,
        },
        { level: "removed", n: c.removed, href: `${pagesHref}?access=removed` },
      ],
      view: g.frontPage
        ? { href: graphPath(g.name), url: `${appUrl}${graphPath(g.name)}`, label: "Front page" }
        : undefined,
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

  const anyRemoved = graphs.some((g) => (counts.get(g.id)?.removed ?? 0) > 0);

  if (graphs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {nav}
      </div>
      {banners}
      {profileCard}
      <ResourceList
        title="Graphs"
        nameLabel="Graph"
        description={<LevelLegend levels={anyRemoved ? ["unlisted", "listed", "discover", "removed"] : undefined} />}
        action={
          <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
            <PlusIcon />
            Connect graph
          </Link>
        }
        items={graphItems}
      />
      {collectionCards}
    </div>
  );
}
