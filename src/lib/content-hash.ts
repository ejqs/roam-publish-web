import { createHash } from "node:crypto";
import type { Node } from "@/db/app-schema";
import { stableStringify } from "./stable-stringify";

export function contentHash(input: { kind: string; title: string; tree: Node }) {
  return createHash("sha256")
    .update(stableStringify({ kind: input.kind, title: input.title, tree: input.tree }))
    .digest("hex");
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
