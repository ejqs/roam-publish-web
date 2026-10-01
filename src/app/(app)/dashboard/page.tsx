import { count, eq, inArray } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
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
import { ACCESS, ACCESS_LABELS, type AccessCounts, accessCounts, discoverBlocked, graphPagesPath } from "./filters";
import { ProfileCard } from "./profile-card";

const EMPTY: AccessCounts = { unlisted: 0, public: 0, discover: 0, removed: 0 };

export default async function DashboardPage() {
  const session = await requireSession("/dashboard");
  const graphs = await db
    .select()
    .from(graph)
    .where(eq(graph.userId, session.user.id))
    .orderBy(graph.name);
  // Only counts here; the pages themselves are listed per graph at /dashboard/[graph].
  const [me, countRows] = await Promise.all([
    db.query.profile.findFirst({ where: eq(profile.userId, session.user.id) }),
    graphs.length
      ? db
          .select({ graphId: publication.graphId, total: count(), ...accessCounts })
          .from(publication)
          .where(inArray(publication.graphId, graphs.map((g) => g.id)))
          .groupBy(publication.graphId)
      : [],
  ]);
  const counts = new Map(countRows.map(({ graphId, ...c }) => [graphId, c]));
  const banners = <AttentionBanners items={attentionItems({ graphs, counts, me })} />;
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
        const c = counts.get(g.id) ?? { ...EMPTY, total: 0 };
        const pagesHref = graphPagesPath(g.name);
        const paused = c.discover > 0 && discoverBlocked(g);
        return (
          <Card key={g.id} id={`graph-${g.id}`} className="scroll-mt-4">
            <CardHeader>
              <CardTitle>
                <Link href={pagesHref} className="hover:underline">
                  {g.name}
                </Link>
              </CardTitle>
              <CardDescription>
                {c.total} published
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
              {c.total === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing published yet. Right-click a page or block in Roam and choose Publish.
                </p>
              ) : (
                <>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ACCESS.filter((a) => a !== "removed" || c.removed > 0).map((a) => (
                      <li key={a}>
                        <Link
                          href={`${pagesHref}?access=${a}`}
                          className="flex flex-col rounded-md border px-3 py-2 hover:bg-muted/50"
                        >
                          <span className="text-xs text-muted-foreground">
                            {ACCESS_LABELS[a]}
                            {a === "discover" && paused && " (paused)"}
                          </span>
                          <span
                            className={`text-xl font-semibold tabular-nums ${a === "removed" ? "text-destructive" : ""}`}
                          >
                            {c[a].toLocaleString("en-US")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {paused && (
                    <p className="text-xs text-muted-foreground">Discover is paused: {paused}</p>
                  )}
                  <Link
                    href={pagesHref}
                    className={buttonVariants({ variant: "outline", size: "sm", className: "self-start" })}
                  >
                    Manage pages
                    <ChevronRightIcon />
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
