/**
 * For when APPEND_TOKEN_KEY and the database may both have leaked: forget every stored Roam
 * append-only token. Each graph is marked invalid, so its owner sees a dashboard banner asking for
 * a new token. Owners should also revoke the old one in Roam (Settings → Graph → API tokens).
 *
 *   railway run bun run tokens:revoke-all
 */
import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { graph } from "@/db/schema";

const cleared = await db
  .update(graph)
  .set({ appendTokenEnc: null, appendTokenStatus: "invalid" })
  .where(isNotNull(graph.appendTokenEnc))
  .returning({ name: graph.name });
console.log(`Cleared ${cleared.length} stored token(s).`);
process.exit(0);
