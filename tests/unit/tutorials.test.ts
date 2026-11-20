import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { TUTORIALS } from "@/lib/tutorials";

describe("tutorials", () => {
  test("each has its own anchor", () => {
    const ids = TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  test("a tutorial with a video has its clips and poster", () => {
    for (const t of TUTORIALS.filter((t) => t.video))
      for (const ext of ["mp4", "webm", "jpg"]) expect(existsSync(`public/tutorials/${t.id}.${ext}`)).toBe(true);
  });

  test("copy says visibility or access, never who can see or read it", () => {
    const text = TUTORIALS.flatMap((t) => [t.title, t.summary, ...t.steps]).join("\n");
    expect(text).not.toMatch(/who can (see|read)/i);
  });
});
