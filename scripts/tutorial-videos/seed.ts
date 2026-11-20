// Seeds the local database for the roam.pub clips. Run with bun test so it gets the test preload
// (signed-in cookies via the magic link): see README.md. SEED=new makes a user with no graph instead.
import { test } from "bun:test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profile, publication } from "@/db/schema";
import { contentHash } from "@/lib/content-hash";
import { makeCollection, makeGraph, makePublication, makeUser } from "../../tests/helpers/factories";

const tree = (uid: string, items: [string, string[]?][]) => ({
  uid,
  string: "",
  children: items.map(([s, kids = []], i) => ({
    uid: `${uid}${i}`,
    string: s,
    children: kids.map((k, j) => ({ uid: `${uid}${i}k${j}`, string: k, children: [] })),
  })),
});

test("seed", async () => {
  if (process.env.SEED === "new") {
    const u = await makeUser({ email: `new${Date.now()}@example.com` });
    writeFileSync(`${tmpdir()}/tutorial-seed-new-cookie.txt`, u.cookie);
    return;
  }
  const u = await makeUser({ email: "ej@example.com" });
  await db.insert(profile).values({ userId: u.id, username: "ejqs", isPublic: true });
  const g = await makeGraph(u.id, { name: "ejqs" });
  const pages: [string, [string, string[]?][]][] = [
    ["The Dispossessed", [["Author:: [[Ursula K. Le Guin]]"], ["Anarres and Urras are two answers #essay", ["Shevek's walls, from the [[Hainish Cycle]]", "Odo: true voyage is return"]], ["The ending doesn't resolve anything"]]],
    ["Reading notes", [["Notes on [[Deep Work]] and [[Spaced repetition]]"], ["Started [[The Dispossessed]] again"]]],
    ["Deep Work", [["Work in long blocks, without switching."]]],
    ["Journal 2026", [["Private notes for the book club."]]],
  ];
  for (const [i, [title, items]] of pages.entries()) {
    const rootUid = `tut${i}aaaaa`;
    const t = tree(rootUid, items);
    const row = await makePublication(g.id, u.id, { rootUid, title, tree: t, contentHash: contentHash({ kind: "page", title, tree: t }) });
    if (title !== "Journal 2026") await db.update(publication).set({ visibility: "public" }).where(eq(publication.id, row.id));
  }
  await makeCollection(u.id, { name: "Book club", slug: "book-club" });
  writeFileSync(`${tmpdir()}/tutorial-seed-cookie.txt`, u.cookie);
});
