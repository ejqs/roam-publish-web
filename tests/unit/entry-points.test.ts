import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Every route handler and server action reports to /admin/status (lib/telemetry.ts). This fails
 * when one is added without its wrapper, so no entry point goes unwatched.
 */
const files = (pattern: string) => [...new Glob(pattern).scanSync({ cwd: "src/app" })].map((f) => `src/app/${f}`);

describe("entry points are instrumented", () => {
  test("route handlers use withRoute (CORS preflights aside)", async () => {
    const bare: string[] = [];
    for (const f of files("**/route.ts")) {
      const src = await Bun.file(f).text();
      for (const m of src.matchAll(/^export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b(.*)$/gm))
        if (!m[2].includes("withRoute(")) bare.push(`${f} ${m[1]}`);
      if (/^export const \{/m.test(src)) bare.push(`${f} (destructured export)`);
    }
    expect(bare).toEqual([]);
  });

  test("server actions wrap their body in withAction", async () => {
    const bare: string[] = [];
    for (const f of files("**/*.ts")) {
      const src = await Bun.file(f).text();
      if (!/^["']use server["']/m.test(src)) continue;
      for (const m of src.matchAll(/^export async function (\w+)[^]*?\{\n(.*)$/gm))
        if (!m[2].trimStart().startsWith("return withAction(")) bare.push(`${f} ${m[1]}`);
      for (const m of src.matchAll(/^export const (\w+)/gm)) bare.push(`${f} ${m[1]} (const export)`);
    }
    expect(bare).toEqual([]);
  });
});
