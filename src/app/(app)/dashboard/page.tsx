import { desc, eq, inArray } from "drizzle-orm";
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
import { db } from "@/db";
import { graph, profile, publication } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { requireSession } from "@/lib/session";
import { AttentionBanners, attentionItems } from "./attention-banners";
import { ProfileCard } from "./profile-card";
import { PublicationList } from "./publication-list";

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const graphs = await db
    .select()
    .from(graph)
    .where(eq(graph.userId, session.user.id))
    .orderBy(graph.name);
  const pubs = graphs.length
    ? await db
        .select()
        .from(publication)
        .where(inArray(publication.graphId, graphs.map((g) => g.id)))
        .orderBy(desc(publication.updatedAt))
    : [];
  const me = await db.query.profile.findFirst({ where: eq(profile.userId, session.user.id) });
  const banners = <AttentionBanners items={attentionItems({ graphs, pubs, me })} />;
  const profileCard = (
    <ProfileCard
      username={me?.username ?? null}
      isPublic={me?.isPublic ?? false}
      bio={me?.bio ?? ""}
      hasGraph={graphs.some((g) => !g.suspendedAt)}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}
    />
  );

  if (graphs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No graphs connected yet</EmptyTitle>
            <EmptyDescription>Connect a Roam graph to start publishing.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link href="/onboarding" className={buttonVariants()}>
              Connect a graph
            </Link>
          </EmptyContent>
        </Empty>
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
      {banners}
      {profileCard}
      {graphs.map((g) => {
        const rows = pubs.filter((p) => p.graphId === g.id);
        const notListable = g.suspendedAt
          ? "This graph is suspended."
          : !g.frontPage
            ? "Turn on this graph's front page in Settings to use Discover."
            : !g.indexable
              ? "Turn on search engines in Settings to use Discover."
              : undefined;
        return (
          <Card key={g.id} id={`graph-${g.id}`} className="scroll-mt-4">
            <CardHeader>
              <CardTitle>{g.name}</CardTitle>
              <CardDescription>
                {rows.length} published · {rows.filter((p) => p.visibility === "public").length} public
                {g.frontPage && (
                  <>
                    {" · "}
                    <Link href={graphPath(g.name)} className="text-link hover:underline">
                      View front page
                    </Link>
                  </>
                )}
              </CardDescription>
              <CardAction>
                <Link
                  href={`/dashboard/${encodeURIComponent(g.name)}/settings`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Settings
                </Link>
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
                <PublicationList g={g} rows={rows} discoverBlocked={notListable} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
