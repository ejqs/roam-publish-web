import { getSessionCookie } from "better-auth/cookies";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { graph, publication, publicationVote, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { listedPublication } from "@/lib/discover";
import { rateLimit } from "@/lib/rate-limit";

/** Why the reader can't vote, or null when they can. */
export type VoteBlocker = "signin" | "nograph" | "owner" | null;
export type VoteState = { count: number; voted: boolean; blocker: VoteBlocker };

const ID = /^[0-9a-f-]{36}$/i;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const notFound = () => json({ error: "not_found" }, 404);

async function viewerId(req: Request) {
  if (!getSessionCookie(req)) return null;
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

/** Count and the reader's own state for a page listed on Discover; null when it isn't listed. */
async function voteState(id: string, viewer: string | null): Promise<VoteState | null> {
  const [row] = await db
    .select({
      count: sql<number>`(select count(*) from ${publicationVote} where ${publicationVote.publicationId} = ${publication.id})`.mapWith(Number),
      voted: viewer
        ? sql<boolean>`exists (select 1 from ${publicationVote} where ${publicationVote.publicationId} = ${publication.id} and ${publicationVote.userId} = ${viewer})`
        : sql<boolean>`false`,
      own: viewer ? sql<boolean>`${graph.userId} = ${viewer}` : sql<boolean>`false`,
      hasGraph: viewer
        ? sql<boolean>`exists (select 1 from graph mine where mine.user_id = ${viewer})`
        : sql<boolean>`false`,
    })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(and(eq(publication.id, id), listedPublication));
  if (!row) return null;
  const blocker: VoteBlocker = !viewer ? "signin" : row.own ? "owner" : !row.hasGraph ? "nograph" : null;
  return { count: row.count, voted: row.voted, blocker };
}

/** The upvote count and whether this reader voted or can vote. Signed-out readers only get the count. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID.test(id)) return notFound();
  const state = await voteState(id, await viewerId(req));
  return state ? json(state) : notFound();
}

/** Upvotes a page. Same voters as /api/views: signed in, owns a graph, not the page's owner. */
export async function POST(req: Request) {
  return change(req, async (id, viewer) => {
    // One statement, so a page that stops being listed between check and insert never gets a vote.
    await db.execute(sql`
      insert into ${publicationVote} (publication_id, user_id)
      select ${publication.id}, ${viewer}
      from ${publication}
      join ${graph} on ${graph.id} = ${publication.graphId}
      join ${user} on ${user.id} = ${graph.userId}
      where ${publication.id} = ${id}
        and ${listedPublication}
        and ${graph.userId} <> ${viewer}
        and exists (select 1 from graph mine where mine.user_id = ${viewer})
      on conflict do nothing
    `);
  });
}

/** Takes back the reader's upvote. */
export async function DELETE(req: Request) {
  return change(req, (id, viewer) =>
    db
      .delete(publicationVote)
      .where(and(eq(publicationVote.publicationId, id), eq(publicationVote.userId, viewer)))
      .then(() => {}),
  );
}

async function change(req: Request, apply: (id: string, viewer: string) => Promise<void>) {
  const id = (await req.text()).trim();
  if (!ID.test(id)) return notFound();
  const viewer = await viewerId(req);
  if (!viewer) return json({ error: "signin" }, 401);
  if (!rateLimit(`vote:${viewer}`, 30, 60 * 1000)) return json({ error: "rate_limited" }, 429);

  await apply(id, viewer);
  const state = await voteState(id, viewer);
  if (!state) return notFound();
  return json(state, state.blocker ? 403 : 200);
}
