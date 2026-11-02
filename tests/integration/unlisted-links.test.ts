import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import GraphRoute from "@/app/[graph]/[uid]/[[...slug]]/page";
import CPage from "@/app/c/[id]/[[...slug]]/page";
import LinkRoute from "@/app/l/[id]/[[...slug]]/page";
import { PublicationView } from "@/components/publication-view";
import { db } from "@/db";
import { collectionEntry, report } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { entryPlacePath, linkPath, placePath } from "@/lib/publications";
import { submitReport } from "@/server/actions/report";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { readGraphPage, redirectedTo } from "../helpers/read-page";
import { findElements, renderNested } from "../helpers/render";
import { resetRequest } from "../helpers/request";

let ipN = 0;
beforeEach(async () => {
  await resetDb();
  resetRequest({ ip: `198.51.100.${++ipN}` });
});

/** Where rendering `run` redirects to, or null when it renders. */
async function redirectOf(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (e) {
    const to = redirectedTo(e);
    if (to === null) throw e;
    return to;
  }
}

const graphRoute = (graph: string, uid: string, slug?: string[]) =>
  GraphRoute({ params: Promise.resolve({ graph, uid, slug }) } as never);
const linkRoute = (id: string, slug?: string[]) => LinkRoute({ params: Promise.resolve({ id, slug }) } as never);
const cRoute = (id: string, slug?: string[]) => CPage({ params: Promise.resolve({ id, slug }) } as never);

describe("addresses", () => {
  test("Unlisted pages get /l/{linkId}/{title}; others keep their graph address", () => {
    expect(linkPath("abc123defg", "My Notes")).toBe("/l/abc123defg/my-notes");
    expect(placePath("garden", { rootUid: "u1", title: "My Notes", visibility: "unlisted", linkId: "abc123defg" })).toBe(
      "/l/abc123defg/my-notes",
    );
    expect(placePath("garden", { rootUid: "u1", title: "My Notes", visibility: "public", linkId: "abc123defg" })).toBe(
      "/garden/u1/my-notes",
    );
    expect(entryPlacePath("shelf", { entryUid: "e1", listing: "unlisted" }, "My Notes")).toBe("/c/e1/my-notes");
    expect(entryPlacePath("shelf", { entryUid: "e1", listing: "listed" }, "My Notes")).toMatch(/^\/c\/shelf\/e1/);
  });
});

describe("an Unlisted page in a graph", () => {
  test("its old graph address leads to its /l/ address, which doesn't name the graph", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const pub = await makePublication(g.id, owner.id, { rootUid: "unl00001", title: "Draft Idea", visibility: "unlisted" });
    actAs(null);
    expect(await redirectOf(() => graphRoute(g.name, pub.rootUid, ["draft-idea"]))).toBe(`/l/${pub.linkId}/draft-idea`);
    const out = await linkRoute(pub.linkId, ["draft-idea"]);
    const view = findElements(out as never, PublicationView)[0];
    expect(view).toBeDefined();
    expect(view.props.breadcrumbs ?? null).toBeNull();
    expect(JSON.stringify(view.props)).not.toContain(g.name);
  });

  test("an /l/ address with an old title is corrected; an unknown one is not found", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const pub = await makePublication(g.id, owner.id, { title: "New Title", visibility: "unlisted" });
    actAs(null);
    expect(await redirectOf(() => linkRoute(pub.linkId, ["old-title"]))).toBe(`/l/${pub.linkId}/new-title`);
    await expect(linkRoute("zzzzzzzzzz")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  test("made Public, its /l/ address leads to its graph address", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const pub = await makePublication(g.id, owner.id, { rootUid: "pub00001", title: "Notes", visibility: "public" });
    actAs(null);
    expect(await redirectOf(() => linkRoute(pub.linkId))).toBe(`/${g.name}/pub00001/notes`);
    expect(await readGraphPage(g.name, pub.rootUid)).toBeDefined();
  });

  test("can be reported by its link alone", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const pub = await makePublication(g.id, owner.id, { visibility: "unlisted" });
    actAs(null);
    const f = new FormData();
    for (const [k, v] of Object.entries({ linkId: pub.linkId, reason: "spam", details: "x", email: "" })) f.set(k, v);
    const { reportReasons } = await import("@/lib/report-reasons");
    f.set("reason", reportReasons[0]);
    expect((await submitReport(null, f))?.ok).toBe(true);
    const [row] = await db.select().from(report);
    expect(row).toMatchObject({ graphId: g.id, publicationId: pub.id });
  });
});

describe("an Unlisted page in a collection", () => {
  test("lives at /c/{entryUid}/{title}, and its collection address leads there", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const c = await makeCollection(owner.id);
    const pub = await makePublication(g.id, owner.id, { title: "Draft Idea", visibility: "public" });
    const entry = (await addEntry(c.id, pub.id, owner.id))!;
    await db.update(collectionEntry).set({ listing: "unlisted" }).where(eq(collectionEntry.id, entry.id));
    actAs(null);
    const at = `/c/${entry.entryUid}/draft-idea`;
    expect(await redirectOf(async () => renderNested(await cRoute(c.slug, [entry.entryUid, "draft-idea"]), "EntryPage"))).toBe(at);
    const out = await renderNested(await cRoute(entry.entryUid, ["draft-idea"]), "EntryPage");
    const view = findElements(out as never, PublicationView)[0];
    expect(view).toBeDefined();
    expect(JSON.stringify(view.props)).not.toContain(c.slug);
    expect(JSON.stringify(view.props)).not.toContain(c.name);
  });
});
