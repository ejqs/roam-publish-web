import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  pageViews,
  passwordUnlock,
  type PlaceViews,
  publicationView,
  type ShowAuthor,
  type ViewCountry,
  type ViewsMode,
} from "@/db/schema";
import type { Lock } from "./gates";
import { MIN_SHOWN_VIEWS, totalViews } from "./views";

/** Successful password entries above which a page's managers get a heads-up in the footer. */
export const PASSWORD_WARN_UNLOCKS = 25;

/** What the popover's controls change: this page's own view settings, where the viewer may change them. */
export type ViewControlsData = {
  target: { kind: "graph"; publicationId: string } | { kind: "entry"; entryId: string };
  views: PlaceViews;
  showViewCountries: ShowAuthor;
  container: { label: string; views: ViewsMode; showViewCountries: boolean };
  listed: boolean;
};

export type ViewFooter = {
  /** Views are off for this page: only shown to someone who can turn them back on. */
  off: boolean;
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
  /**
   * Password-protected pages: successful entries of the password that opens it, since it was last
   * changed. Umami can't tell the password prompt from the page, so these are the page's views.
   */
  unlocks: number | null;
  /** Whose password that is. */
  lockScope: Lock["scope"] | null;
  /** The password has been entered more often than a privately shared page usually sees; managers only. */
  passwordWarning: boolean;
  controls: ViewControlsData | null;
};

/**
 * What a page's footer shows about views for this reader, or null for nothing. Visitors see the
 * count when it's on ("< 10 views" while it's small); people who manage the page also see a hidden one.
 */
export async function loadViewFooter(opts: {
  mode: ViewsMode;
  countries: boolean;
  manager: boolean;
  /** The password that opens this page, when it's password-protected. */
  lock: Lock | null;
  publicationId: string;
  entryId?: string;
  /** Set when the viewer may change this page's view settings. */
  controls?: ViewControlsData | null;
}): Promise<ViewFooter | null> {
  const { mode, manager } = opts;
  const controls = opts.controls ?? null;
  if (mode === "off")
    return controls
      ? {
          off: true,
          total: 0,
          umami: 0,
          roam: 0,
          countries: null,
          flags: false,
          syncedAt: null,
          hidden: true,
          few: false,
          manager,
          unlocks: null,
          lockScope: null,
          passwordWarning: false,
          controls,
        }
      : null;
  if (mode === "hide" && !manager) return null;
  const lock = opts.lock;
  const [row, roam, unlocks] = await Promise.all([
    db.query.pageViews.findFirst({
      where: opts.entryId ? eq(pageViews.entryId, opts.entryId) : eq(pageViews.publicationId, opts.publicationId),
    }),
    db
      .select({ n: count() })
      .from(publicationView)
      .where(eq(publicationView.publicationId, opts.publicationId))
      .then(([r]) => r.n),
    lock
      ? db
          .select({ n: passwordUnlock.unlocks })
          .from(passwordUnlock)
          .where(
            and(
              eq(passwordUnlock.scope, lock.scope),
              eq(passwordUnlock.targetId, lock.id),
              eq(passwordUnlock.passwordVersion, lock.version),
            ),
          )
          .then(([r]) => r?.n ?? 0)
      : null,
  ]);
  const umami = row?.views ?? 0;
  // Behind a password, only people who got in saw the page; Umami also counts the prompt.
  const total = unlocks === null ? totalViews({ umami, roam }) : Math.max(unlocks, roam);
  const few = total < MIN_SHOWN_VIEWS;
  return {
    off: false,
    total,
    umami,
    roam,
    countries: row?.countries ?? null,
    flags: mode === "show" && !few && opts.countries && unlocks === null,
    syncedAt: row?.syncedAt ?? null,
    hidden: mode === "hide",
    few,
    manager,
    unlocks,
    lockScope: lock?.scope ?? null,
    passwordWarning: manager && unlocks !== null && unlocks >= PASSWORD_WARN_UNLOCKS,
    controls,
  };
}
