import { getSessionCookie } from "better-auth/cookies";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auth } from "@/lib/auth";

const noContent = () => new Response(null, { status: 204 });
/** Tells the beacon a signed-in request was handled, so it can stop sending for this page. */
const handled = () => new Response(null, { status: 202 });

/**
 * Records a page view from the client beacon. Cheapest exits first: a bad body or a missing session
 * cookie never touches the database. Neither status says whether a view was counted.
 */
export async function POST(req: Request) {
  const id = (await req.text()).trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return noContent();
  if (!getSessionCookie(req)) return noContent();

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return noContent();
  const viewer = session.user.id;

  // One statement: only public, live pages; never the owner's own; only viewers with a graph.
  await db.execute(sql`
    insert into publication_view (publication_id, user_id)
    select p.id, ${viewer}
    from publication p
    join graph g on g.id = p.graph_id
    where p.id = ${id}
      and p.visibility = 'public'
      and p.removed_at is null
      and g.user_id <> ${viewer}
      and exists (select 1 from graph mine where mine.user_id = ${viewer})
    on conflict do nothing
  `);
  return handled();
}
