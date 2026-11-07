import { beforeEach, expect, test } from "bun:test";
import GraphPagesPage from "@/app/(app)/dashboard/[graph]/page";
import { ListEmpty, ListToolbar } from "@/app/(app)/dashboard/list-toolbar";
import { PublicationList } from "@/app/(app)/dashboard/publication-list";
import OnlyInCollectionsPage from "@/app/(app)/dashboard/[graph]/collections-only/page";
import { OnlyInCollectionsLink } from "@/app/(app)/dashboard/section-tabs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { collectionEntry } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { findElements, textOf } from "../helpers/render";
import { resetRequest } from "../helpers/request";

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

const onlyOf = (graph: string, searchParams: Record<string, string> = {}) =>
  OnlyInCollectionsPage({ params: Promise.resolve({ graph }), searchParams: Promise.resolve(searchParams) } as never);
const pagesOf = (graph: string, searchParams: Record<string, string> = {}) =>
  GraphPagesPage({ params: Promise.resolve({ graph }), searchParams: Promise.resolve(searchParams) } as never);

test("a graph's Pages list leaves out pages shown only in collections, and doesn't count them", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id);
  const c = await makeCollection(owner.id);
  const shown = await makePublication(g.id, owner.id, { rootUid: "shown0001", title: "In the graph", visibility: "public" });
  const both = await makePublication(g.id, owner.id, { rootUid: "both00001", title: "In both", visibility: "public" });
  const only = await makePublication(g.id, owner.id, { rootUid: "only00001", title: "Only in a collection", inGraph: false });
  await addEntry(c.id, both.id, owner.id);
  await addEntry(c.id, only.id, owner.id);
  // Unlisted in its collection: the Unlisted tab lists it, so the section leaves it out.
  const hidden = await makePublication(g.id, owner.id, { rootUid: "unl000001", title: "Unlisted in a collection", inGraph: false });
  const e = await addEntry(c.id, hidden.id, owner.id);
  await db.update(collectionEntry).set({ listing: "unlisted" }).where(eq(collectionEntry.id, e!.id));
  actAs(owner);

  const cases: Record<string, string>[] = [{}, { access: "public" }, { q: "collection" }];
  for (const params of cases) {
    const out = await pagesOf(g.name, params);
    const [list] = findElements(out, PublicationList) as { props: { rows: { id: string }[] } }[];
    const ids = list?.props.rows.map((r) => r.id) ?? [];
    expect(ids).not.toContain(only.id);
    if (!("q" in params)) expect(ids.sort()).toEqual([shown.id, both.id].sort());
  }
  const [toolbar] = findElements(await pagesOf(g.name), ListToolbar) as { props: { counts: Record<string, number> } }[];
  expect(toolbar.props.counts.all).toBe(2);
  expect(toolbar.props.counts.public).toBe(2);

  // The list links to their own page, which counts and lists them, without the Unlisted one.
  const [link] = findElements(await pagesOf(g.name), OnlyInCollectionsLink) as { props: { n: number; href: string } }[];
  expect(link.props.n).toBe(1);
  expect(link.props.href).toBe(`/dashboard/${g.name}/collections-only`);
  const own = await onlyOf(g.name);
  const [ownToolbar] = findElements(own, ListToolbar) as { props: { counts: Record<string, number> } }[];
  expect(ownToolbar.props.counts).toEqual({ all: 1, [c.slug]: 1 });
  expect(textOf(own)).toContain("Only in a collection");
  expect(textOf(own)).not.toContain("Unlisted in a collection");
  expect(textOf(own)).not.toContain("In the graph");
  const [empty] = findElements(await onlyOf(g.name, { access: c.slug, q: "nothing like it" }), ListEmpty) as { props: { filtered: boolean } }[];
  expect(empty.props.filtered).toBe(true);
});
