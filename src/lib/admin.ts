import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_USER_IDS, auth, type Session } from "./auth";
import { requireSession } from "./session";

export function isAdmin(user: Session["user"] | undefined | null) {
  if (!user) return false;
  return user.role === "admin" || ADMIN_USER_IDS.includes(user.id);
}

/** For admin pages: log in first, then 404 for anyone who isn't an admin. */
export async function requireAdminPage(next: string) {
  const session = await requireSession(next);
  if (!isAdmin(session.user)) notFound();
  return session;
}

/** For admin server actions. Throws so a forged call never falls through to a write. */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdmin(session.user)) throw new Error("Not authorized");
  return session;
}
