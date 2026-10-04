import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { updateGraphSettings } from "@/app/(app)/dashboard/actions";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { resetDb } from "../helpers/db";
import { actAs, makeGraph, makeUser } from "../helpers/factories";

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
