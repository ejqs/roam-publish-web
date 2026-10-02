/**
 * Fills in `tags` and `search_text` for publications written before they existed, and redoes them
 * after a change to lib/tags.ts. Safe to rerun; only rows whose values change are written.
 *
 *   railway run bun run search:backfill
 */
import { asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { indexFields } from "@/lib/tags";

const BATCH = 200;
let after = "";
let seen = 0;
let changed = 0;
for (;;) {
  const rows = await db
    .select({
      id: publication.id,
      tree: publication.tree,
      tags: publication.tags,
      searchText: publication.searchText,
      tagsAdded: publication.tagsAdded,
      tagsHidden: publication.tagsHidden,
    })
    .from(publication)
    .where(gt(publication.id, after))
    .orderBy(asc(publication.id))
    .limit(BATCH);
  if (!rows.length) break;
  for (const r of rows) {
    const next = indexFields(r.tree, r);
    if (next.searchText !== r.searchText || next.tags.join("\n") !== r.tags.join("\n")) {
      await db.update(publication).set(next).where(eq(publication.id, r.id));
      changed++;
    }
  }
  seen += rows.length;
  after = rows[rows.length - 1].id;
}
console.log(`Checked ${seen} publication(s), updated ${changed}.`);
process.exit(0);
