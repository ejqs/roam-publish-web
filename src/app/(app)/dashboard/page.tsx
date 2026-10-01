import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
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
import { graph, publication } from "@/db/schema";
import { publicationPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { unpublish } from "./actions";

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

  if (graphs.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
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
      {graphs.map((g) => {
        const rows = pubs.filter((p) => p.graphId === g.id);
        return (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle>{g.name}</CardTitle>
              <CardDescription>
                {rows.length} published · verified {g.verifiedAt.toLocaleDateString()}
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">Connected</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
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
                      <TableHead>Updated</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.id}>
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
                        <TableCell className="text-muted-foreground">
                          {p.updatedAt.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <form action={unpublish.bind(null, p.id)}>
                            <Button type="submit" variant="ghost" size="sm">
                              Unpublish
                            </Button>
                          </form>
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
