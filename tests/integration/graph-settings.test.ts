import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { updateGraphAccess, updateGraphDisplay, updateGraphSettings } from "@/server/actions/dashboard";
import { updateCollection } from "@/server/actions/collections";
import { updateGraphPlace } from "@/server/actions/places";
import { db } from "@/db";
import { collection, graph, graphDefaultCollection, publication } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { hashPassword } from "@/lib/gates";
import { offersPdf, PDF_STYLE_DEFAULTS } from "@/lib/pdf";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";

beforeEach(resetDb);

const read = (id: string) => db.query.graph.findFirst({ where: eq(graph.id, id) });

// The Settings tab saves the description and the Sharing tab the listing switches: neither may
// reset what the other owns.
test("saving one tab's settings keeps the other's", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { frontPage: true, indexable: true, rss: true });
  actAs(owner);

  expect((await updateGraphSettings(g.id, { description: "Notes" }))?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ description: "Notes", frontPage: true, rss: true });

  expect((await updateGraphSettings(g.id, { indexable: false }))?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ description: "Notes", indexable: false, frontPage: true });
});

test("turning off the front page still turns off the feed", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { frontPage: true, indexable: true, rss: true });
  actAs(owner);

  expect((await updateGraphSettings(g.id, { frontPage: false }))?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ frontPage: false, rss: false });
});

test("only the owner can change them", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { description: "Mine" });
  actAs(await makeUser());

  expect((await updateGraphSettings(g.id, { description: "Theirs" }))?.ok).toBe(false);
  expect(await read(g.id)).toMatchObject({ description: "Mine" });
});

// Search only reaches an open front page, so locking hides these switches without forgetting them.
test("locking a graph keeps its search settings for when it opens again", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { indexable: true, searchListed: true, passwordHash: hashPassword("graph-password-1") });
  actAs(owner);
  const res = await updateGraphAccess(g.id, {
    indexAccess: "password",
    defaultAccess: "password",
    encryptNewPages: false,
    password: "",
    clearPassword: false,
  });
  expect(res?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ indexAccess: "password", indexable: true, searchListed: true });
});

// The Settings tab's display section: how pages look never changes who can see them.
test("display settings save without touching access", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { frontPage: false, indexAccess: "password", passwordHash: hashPassword("graph-password-1") });
  const mine = await makeCollection(owner.id);
  const theirs = await makeCollection((await makeUser()).id);
  actAs(owner);
  const res = await updateGraphDisplay(g.id, {
    showAuthors: true,
    views: "hide",
    showViewCountries: false,
    showOwner: false,
    hideUnlistedBreadcrumbs: true,
    rss: true,
    newPagesInGraph: false,
    defaultCollections: [mine.id, theirs.id],
  });
  expect(res?.ok).toBe(true);
  // No front page, so no feed; access and the password stay as they were.
  expect(await read(g.id)).toMatchObject({
    showAuthors: true,
    views: "hide",
    hideUnlistedBreadcrumbs: true,
    newPagesInGraph: false,
    rss: false,
    indexAccess: "password",
    passwordHash: g.passwordHash,
  });
  const kept = await db.select().from(graphDefaultCollection).where(eq(graphDefaultCollection.graphId, g.id));
  expect(kept.map((r) => r.collectionId)).toEqual([mine.id]);
});

describe("collection settings", () => {
  const save = (c: typeof collection.$inferSelect, extra: Record<string, unknown> = {}) =>
    updateCollection(c.id, {
      name: c.name,
      description: "",
      indexAccess: "open",
      defaultAccess: "open",
      showAuthors: true,
      views: "show",
      showViewCountries: true,
      indexable: true,
      searchListed: true,
      featured: true,
      encryptNewPages: false,
      discoverable: false,
      rss: false,
      password: "",
      clearPassword: false,
      ...extra,
    });
  const readC = (id: string) => db.query.collection.findFirst({ where: eq(collection.id, id) });

  test("locking keeps its search settings, and turns off new pages on Discover", async () => {
    const owner = await makeUser();
    const c = await makeCollection(owner.id, { passwordHash: hashPassword("collection-pw-1") });
    actAs(owner);
    expect((await save(c, { indexAccess: "password", defaultAccess: "password" })).ok).toBe(true);
    expect(await readC(c.id)).toMatchObject({ indexable: true, searchListed: true, featured: false });
  });

  test("List new pages on Discover starts added pages on Discover", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const c = await makeCollection(owner.id);
    actAs(owner);
    expect((await save(c)).ok).toBe(true);
    expect((await readC(c.id))!.featured).toBe(true);
    const entry = await addEntry(c.id, (await makePublication(g.id, owner.id)).id, owner.id);
    expect(entry).toMatchObject({ listing: "discover" });
  });
});

test("PDF download saves with its style, and a page can override it", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id);
  const pub = await makePublication(g.id, owner.id);
  actAs(owner);
  const pdfStyle = { ...PDF_STYLE_DEFAULTS, font: "serif" as const, link: false, enforced: true };
  const res = await updateGraphDisplay(g.id, {
    showAuthors: false,
    views: "show",
    showViewCountries: true,
    pdfDownload: true,
    pdfStyle,
    showOwner: true,
    hideUnlistedBreadcrumbs: true,
    rss: false,
    newPagesInGraph: true,
    defaultCollections: [],
  });
  expect(res?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ pdfDownload: true, pdfStyle });

  expect((await updateGraphPlace(pub.id, { pdfDownload: "off" })).ok).toBe(true);
  const row = await db.query.publication.findFirst({ where: eq(publication.id, pub.id) });
  expect(row?.pdfDownload).toBe("off");
  expect(offersPdf((await read(g.id))!, row!)).toBe(false);
});

test("a collection's PDF download saves with its style", async () => {
  const owner = await makeUser();
  const c = await makeCollection(owner.id);
  actAs(owner);
  const res = await updateCollection(c.id, {
    name: c.name,
    description: "",
    indexAccess: "open",
    defaultAccess: "open",
    showAuthors: true,
    views: "show",
    showViewCountries: true,
    pdfDownload: true,
    pdfStyle: { ...PDF_STYLE_DEFAULTS, size: "large" },
    indexable: true,
    searchListed: true,
    featured: false,
    encryptNewPages: false,
    discoverable: false,
    rss: false,
    password: "",
    clearPassword: false,
  });
  expect(res.ok).toBe(true);
  const row = await db.query.collection.findFirst({ where: eq(collection.id, c.id) });
  expect(row).toMatchObject({ pdfDownload: true, pdfStyle: { size: "large" } });
});
