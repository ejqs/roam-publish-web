import { beforeEach, expect, test } from "bun:test";
import GraphPagesPage from "@/app/(app)/dashboard/[graph]/page";
import { ListToolbar } from "@/app/(app)/dashboard/list-toolbar";
import { PublicationList } from "@/app/(app)/dashboard/publication-list";
import { addEntry } from "@/lib/collections";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { findElements } from "../helpers/render";
import { resetRequest } from "../helpers/request";

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

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
});
