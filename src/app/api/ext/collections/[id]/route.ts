import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collection, VIEWS_MODE } from "@/db/schema";
import { type CollectionSettings, updateCollectionAs } from "@/lib/collection-edits";
import { collectionsOf } from "@/lib/collections";
import { json, preflight } from "@/lib/cors";
import { requireExtKey } from "@/lib/ext-auth";
import { collectionUrl } from "@/lib/publications";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

type Ctx = RouteContext<"/api/ext/collections/[id]">;
type Coll = Awaited<ReturnType<typeof collectionsOf>>[number];

const appUrl = (path: string) => new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").toString();

/** Why the collection, or its new pages, can't be on Discover: the same conditions `updateCollectionAs` applies. */
function discoverBlocked(c: Pick<Coll, "indexAccess" | "indexable">) {
  if (c.indexAccess !== "open") return "The collection's page is protected, so it can't be on Discover.";
  if (!c.indexable) return "Turn on search engines for the collection to put it on Discover.";
}
const featuredBlocked = (c: Pick<Coll, "indexAccess" | "indexable" | "defaultAccess">) =>
  discoverBlocked(c) ?? (c.defaultAccess !== "open" ? "New pages here are protected, so they can't start on Discover." : undefined);

function view(c: Coll) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    url: collectionUrl(c.slug),
    settingsUrl: appUrl(`/dashboard/collections/${encodeURIComponent(c.slug)}/settings`),
    role: c.role,
    /** Only its owner changes its settings; members see them. */
    canEdit: c.role === "owner",
    // Changed on roam.pub only.
    indexAccess: c.indexAccess,
    defaultAccess: c.defaultAccess,
    hasPassword: !!c.passwordHash,
    encryptNewPages: c.encryptNewPages,
    showAuthors: c.showAuthors,
    showVisibility: c.showVisibility,
    views: c.views,
    showViewCountries: c.showViewCountries,
    pdfDownload: c.pdfDownload,
    indexable: c.indexable,
    searchListed: c.searchListed,
    /** New pages start on Discover. */
    featured: c.featured,
    /** The collection itself is on Discover. */
    discoverable: c.discoverable,
    rss: c.rss,
    pagesLeaveGraph: c.pagesLeaveGraph,
    discoverBlocked: discoverBlocked(c) ?? null,
    featuredBlocked: featuredBlocked(c) ?? null,
  };
}

async function collectionFor(req: Request, { params }: Ctx) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  const c = (await collectionsOf(ctx.userId)).find((x) => x.id === id);
  if (!c) return json(req, { error: "Join that collection on roam.pub first." }, 403);
  if (c.suspendedAt) return json(req, { error: "That collection isn't available." }, 403);
  return { ctx, c };
}

/** A collection's settings, for its owner or a member. Access, passwords and members are on roam.pub. */
export const GET = withRoute("GET /api/ext/collections/[id]", async (req: Request, rc: Ctx) => {
  const found = await collectionFor(req, rc);
  if (found instanceof Response) return found;
  return json(req, view(found.c));
});

const PatchBody = z
  .object({
    name: z.string(),
    description: z.string(),
    showAuthors: z.boolean(),
    showVisibility: z.boolean(),
    views: z.enum(VIEWS_MODE),
    showViewCountries: z.boolean(),
    pdfDownload: z.boolean(),
    indexable: z.boolean(),
    searchListed: z.boolean(),
    featured: z.boolean(),
    discoverable: z.boolean(),
    rss: z.boolean(),
    pagesLeaveGraph: z.boolean(),
  })
  .partial();

/**
 * Changes the settings sent, keeping the rest, through the same save as the website's settings
 * form. Owner only.
 */
export const PATCH = withRoute("PATCH /api/ext/collections/[id]", async (req: Request, rc: Ctx) => {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid settings" }, 400);
  const found = await collectionFor(req, rc);
  if (found instanceof Response) return found;
  const { ctx, c } = found;
  if (c.role !== "owner") return json(req, { error: "Only the collection's owner can change its settings." }, 403);
  const s = { ...view(c), ...parsed.data };
  // The website's save quietly turns these off when they can't be on; say why instead.
  const blocked = (s.discoverable && !c.discoverable && discoverBlocked(s)) || (s.featured && !c.featured && featuredBlocked(s));
  if (blocked) return json(req, { error: blocked }, 409);
  const input: CollectionSettings = {
    name: s.name,
    description: s.description,
    indexAccess: c.indexAccess,
    defaultAccess: c.defaultAccess,
    showAuthors: s.showAuthors,
    showVisibility: s.showVisibility,
    views: s.views,
    showViewCountries: s.showViewCountries,
    pdfDownload: s.pdfDownload,
    indexable: s.indexable,
    searchListed: s.searchListed,
    featured: s.featured,
    discoverable: s.discoverable,
    rss: s.rss,
    pagesLeaveGraph: s.pagesLeaveGraph,
    password: "",
    clearPassword: false,
  };
  const saved = await updateCollectionAs(ctx.userId, c.id, input);
  if (!saved.ok) return json(req, { error: saved.message }, 409);
  const after = (await db.query.collection.findFirst({ where: eq(collection.id, c.id) }))!;
  return json(req, view({ ...after, role: c.role }));
});
