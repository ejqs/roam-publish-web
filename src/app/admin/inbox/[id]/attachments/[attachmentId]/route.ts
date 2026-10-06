import { isAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { inboxClient } from "@/lib/inbox";
import { withRoute } from "@/lib/telemetry";

const notFound = () => new Response("Not found", { status: 404 });

/** Sends an admin to an attachment's short-lived Resend link, so the link itself never sits in a page. */
export const GET = withRoute(
  "GET /admin/inbox/[id]/attachments/[attachmentId]",
  async (req: Request, ctx: RouteContext<"/admin/inbox/[id]/attachments/[attachmentId]">) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session || !isAdmin(session.user)) return notFound();
    const { id, attachmentId } = await ctx.params;
    const res = await inboxClient.attachmentUrl(id, attachmentId);
    return res.ok ? Response.redirect(res.data, 302) : notFound();
  },
);
