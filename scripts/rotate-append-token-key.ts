/**
 * Re-encrypts every stored Roam append-only token with the current APPEND_TOKEN_KEY, reading old
 * ones with APPEND_TOKEN_KEY_PREVIOUS. Tokens neither key can open are dropped and their graph is
 * marked invalid, so the owner is asked for a new one. Run after deploying the new key:
 *
 *   railway run bun run tokens:rotate
 */
import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { encryptToken, openToken } from "@/lib/append-token";

const rows = await db
  .select({ id: graph.id, enc: graph.appendTokenEnc })
  .from(graph)
  .where(isNotNull(graph.appendTokenEnc));

let rotated = 0;
let current = 0;
let lost = 0;
for (const r of rows) {
  const opened = openToken(r.enc!);
  if (!opened) {
    await db.update(graph).set({ appendTokenEnc: null, appendTokenStatus: "invalid" }).where(eq(graph.id, r.id));
    lost++;
  } else if (opened.current) {
    current++;
  } else {
    await db.update(graph).set({ appendTokenEnc: encryptToken(opened.token) }).where(eq(graph.id, r.id));
    rotated++;
  }
}
console.log(`Re-encrypted ${rotated}, already on the current key ${current}, unreadable (owners asked for a new token) ${lost}.`);
if (rotated + current === rows.length) console.log("All stored tokens use the current key. APPEND_TOKEN_KEY_PREVIOUS can be removed.");
process.exit(0);
