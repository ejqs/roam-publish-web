import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { pageViews, publicationView, type ViewCountry, type ViewsMode } from "@/db/schema";
import { MIN_SHOWN_VIEWS, totalViews } from "./views";

/** Visits to a password-protected page above which its managers get a heads-up in the footer. */
export const PASSWORD_WARN_VIEWS = 100;

export type ViewFooter = {
  total: number;
  umami: number;
  roam: number;
  /** Stored countries, most first, "other" last; null until looked up. */
  countries: ViewCountry[] | null;
  /** Flags next to the count. */
  flags: boolean;
  syncedAt: Date | null;
  /** Hidden from visitors by its setting; shown only because the viewer manages the page. */
  hidden: boolean;
  /** Under MIN_SHOWN_VIEWS: visitors see "< 10 views" and no breakdown. */
  few: boolean;
  /** The viewer manages the page and gets exact numbers. */
  manager: boolean;
  /** The page is behind a password and has had a lot of visits; managers only. */
  passwordWarning: boolean;
};

/**
 * What a page's footer shows about views for this reader, or null for nothing. Visitors see the
 * count when it's on ("< 10 views" while it's small); people who manage the page also see a hidden one.
 */
export async function loadViewFooter(opts: {
  mode: ViewsMode;
  countries: boolean;
  manager: boolean;
  passwordProtected: boolean;
  publicationId: string;
  entryId?: string;
}): Promise<ViewFooter | null> {
  const { mode, manager } = opts;
  if (mode === "off" || (mode === "hide" && !manager)) return null;
  const [row, roam] = await Promise.all([
    db.query.pageViews.findFirst({
      where: opts.entryId ? eq(pageViews.entryId, opts.entryId) : eq(pageViews.publicationId, opts.publicationId),
    }),
    db
      .select({ n: count() })
      .from(publicationView)
      .where(eq(publicationView.publicationId, opts.publicationId))
      .then(([r]) => r.n),
  ]);
  const umami = row?.views ?? 0;
  const total = totalViews({ umami, roam });
  const few = total < MIN_SHOWN_VIEWS;
  return {
    total,
    umami,
    roam,
    countries: row?.countries ?? null,
    flags: mode === "show" && !few && opts.countries,
    syncedAt: row?.syncedAt ?? null,
    hidden: mode === "hide",
    few,
    manager,
    passwordWarning: manager && opts.passwordProtected && umami >= PASSWORD_WARN_VIEWS,
  };
}
