import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { DashboardLink } from "@/components/dashboard-link";
import { ManageLink } from "@/components/manage-link";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { db } from "@/db";
import { graph, profile, user, usernameAlias } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { hasVerifiedGraph } from "@/lib/profiles";
import { viewerId } from "@/lib/viewer";

/** Current username for a former one, if it was renamed. */
const resolveAlias = cache(async (username: string) => {
  const alias = await db.query.usernameAlias.findFirst({ where: eq(usernameAlias.username, username) });
  if (!alias) return null;
  const p = await db.query.profile.findFirst({ where: eq(profile.userId, alias.userId) });
  return p?.username ?? null;
});

const load = cache(async (username: string) => {
  const p = await db.query.profile.findFirst({ where: eq(profile.username, username) });
  if (!p?.isPublic) return null;
  const owner = await db.query.user.findFirst({ where: eq(user.id, p.userId), columns: { banned: true } });
  if (owner?.banned) return null;
  // Profiles need a live, verified graph behind them; the name stays reserved meanwhile.
  if (!(await hasVerifiedGraph(p.userId))) return null;
  const graphs = await db
    .select({ name: graph.name, indexable: graph.indexable })
    .from(graph)
    .where(and(eq(graph.userId, p.userId), eq(graph.frontPage, true), isNull(graph.suspendedAt)))
    .orderBy(graph.name);
  return { p, graphs };
});

export async function generateMetadata(props: PageProps<"/u/[username]">): Promise<Metadata> {
  const username = decodeURIComponent((await props.params).username).toLowerCase();
  const data = await load(username);
  if (!data) return { title: "Not found" };
  return {
    title: `@${data.p.username}`,
    description: data.p.bio || undefined,
    robots: data.graphs.some((g) => g.indexable) ? undefined : { index: false },
  };
}

export default async function ProfilePage(props: PageProps<"/u/[username]">) {
  const username = decodeURIComponent((await props.params).username).toLowerCase();
  const data = await load(username);
  if (!data) {
    const current = await resolveAlias(username);
    if (current) permanentRedirect(`/u/${current}`);
    notFound();
  }
  const { p, graphs } = data;
  const mine = (await viewerId()) === p.userId;

  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 flex items-center gap-1">
          <DashboardLink />
          {mine && <ManageLink href="/dashboard#profile" />}
          <ReportAbuseButton target={{ username: p.username }} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          <h1 className="text-[42px] leading-tight font-semibold break-words">@{p.username}</h1>
          {p.bio && <p className="mt-2 text-muted-foreground break-words">{p.bio}</p>}
          <h2 className="mt-8 mb-2 text-sm font-medium text-muted-foreground">
            {graphs.length === 1 ? "Graph" : "Graphs"}
          </h2>
          {graphs.length === 0 ? (
            <p className="text-muted-foreground">No public graphs yet.</p>
          ) : (
            <ul className="flex flex-col divide-y border-y">
              {graphs.map((g) => (
                <li key={g.name}>
                  <Link href={graphPath(g.name)} className="block py-3 text-link hover:underline">
                    {g.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
