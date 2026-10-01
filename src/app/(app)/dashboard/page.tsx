import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { graph, profile, publication } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { publicationPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { setVisibility, unpublish } from "./actions";
import { AttentionBanners, attentionItems } from "./attention-banners";
import { ProfileCard } from "./profile-card";

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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Visibility</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id} id={`pub-${p.id}`} className="scroll-mt-4">
                        <TableCell className="max-w-xs truncate">
                          <Link
                            href={publicationPath(g.name, p.rootUid, p.title)}
                            className="text-link hover:underline"
                          >
                            {p.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.kind}</Badge>
                        </TableCell>
                        <TableCell>
                          {p.removedAt ? (
                            <Badge variant="destructive" title={p.removedReason ?? undefined}>
                              Removed by moderator
                            </Badge>
                          ) : (
                            <form
                              action={setVisibility.bind(
                                null,
                                p.id,
                                p.visibility === "public" ? "unlisted" : "public",
                              )}
                              className="flex items-center gap-1.5"
                            >
                              <Badge variant={p.visibility === "public" ? "secondary" : "outline"}>
                                {p.visibility}
                              </Badge>
                              <Button type="submit" variant="link" size="sm" className="h-auto px-0">
                                {p.visibility === "public" ? "Unlist" : "Make public"}
                              </Button>
                            </form>
                          )}
                          {p.removedAt && p.removedReason && (
                            <p className="mt-1 max-w-xs text-xs whitespace-normal text-muted-foreground">
                              {p.removedReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.updatedAt.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {!p.removedAt && (
                            <form action={unpublish.bind(null, p.id)}>
                              <Button type="submit" variant="ghost" size="sm">
                                Unpublish
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
