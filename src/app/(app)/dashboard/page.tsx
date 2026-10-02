import { count, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { profile, publication, publicationVote } from "@/db/schema";
import { graphsOf } from "@/lib/graph-access";
import { graphPath } from "@/lib/graphs";
import { pendingInvitesFor } from "@/lib/invites";
import { manageDataFor } from "@/lib/manage-data";
import { requireSession } from "@/lib/session";
import { AttentionBanners, attentionItems } from "./attention-banners";
import { ProfileCard } from "./profile-card";
import { PublicationList } from "./publication-list";

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const meId = session.user.id;
  const [graphs, invites] = await Promise.all([graphsOf(meId), pendingInvitesFor(meId)]);
  const owned = graphs.filter((g) => g.role === "owner");
  const pubs = graphs.length
    ? await db
        .select()
        .from(publication)
        .where(inArray(publication.graphId, graphs.map((g) => g.id)))
        .orderBy(desc(publication.updatedAt))
    : [];
  const discoverIds = pubs.filter((p) => p.discoverable).map((p) => p.id);
  const [me, voteRows, manage] = await Promise.all([
    db.query.profile.findFirst({ where: eq(profile.userId, session.user.id) }),
    discoverIds.length
      ? db
          .select({ id: publicationVote.publicationId, n: count() })
          .from(publicationVote)
          .where(inArray(publicationVote.publicationId, discoverIds))
          .groupBy(publicationVote.publicationId)
      : [],
    manageDataFor(meId, pubs.map((p) => p.id)),
  ]);
  const votes = new Map(voteRows.map((v) => [v.id, v.n]));
  const banners = (
    <AttentionBanners
      items={attentionItems({ graphs: owned, pubs: pubs.filter((p) => owned.some((g) => g.id === p.graphId)), me, invites: invites.length })}
    />
  );
  const nav = (
    <div className="flex flex-wrap gap-2">
      <Link href="/dashboard/keys" className={buttonVariants({ variant: "outline", size: "sm" })}>
        API keys
      </Link>
      <Link href="/dashboard/collections" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Collections
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
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
          Connect another graph
        </Link>
      </div>
      {nav}
      {banners}
      {profileCard}
      {graphs.map((g) => {
        const rows = pubs.filter((p) => p.graphId === g.id);
        const notListable = g.suspendedAt
          ? "This graph is suspended."
          : g.indexAccess !== "open"
            ? "This graph's front page is protected, so its pages can't go on Discover."
            : !g.frontPage
            ? "Turn on this graph's front page in Settings to use Discover."
            : !g.indexable
              ? "Turn on search engines in Settings to use Discover."
              : undefined;
        return (
          <Card key={g.id} id={`graph-${g.id}`} className="scroll-mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {g.name}
                {g.role === "member" && <Badge variant="outline">Member</Badge>}
              </CardTitle>
              <CardDescription>
                {rows.length} published · {rows.filter((p) => p.inGraph && p.visibility === "public").length} listed
                {g.frontPage && (
                  <>
                    {" · "}
                    <Link href={graphPath(g.name)} className="text-link hover:underline">
                      View front page
                    </Link>
                  </>
                )}
              </CardDescription>
              <CardAction className="flex gap-2">
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
            <CardContent className="flex flex-col gap-4">
              {g.suspendedAt && (
                <Alert variant="destructive">
                  <AlertTitle>This graph was suspended by a moderator</AlertTitle>
                  <AlertDescription>
                    Its pages are hidden and publishing is turned off.
                    {g.suspendedReason && <> Reason: {g.suspendedReason}</>}
                  </AlertDescription>
                </Alert>
              )}
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing published yet. Right-click a page or block in Roam and choose Publish.
                </p>
              ) : (
                <PublicationList g={g} rows={rows} votes={votes} discoverBlocked={notListable} manage={manage} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
