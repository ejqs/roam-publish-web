import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { GraphName, RESERVED_GRAPH_NAMES, graphNameError } from "@/lib/graph-names";

/** Top-level URL segments the app serves: route folders, looking inside (group) folders. */
function topLevelRoutes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      if (e.name.startsWith("(")) return topLevelRoutes(join(dir, e.name));
      if (e.name.startsWith("[") || e.name.startsWith("_")) return [];
      return [e.name];
    });
}

describe("reserved graph names", () => {
  // A new route without an entry here would hide the front page of a graph with the same name.
  test("every top-level route is reserved", () => {
    const routes = topLevelRoutes(join(import.meta.dir, "../../src/app"));
    expect(routes.length).toBeGreaterThan(10);
    expect(routes.filter((r) => !RESERVED_GRAPH_NAMES.has(r))).toEqual([]);
  });

  for (const name of ["admin", "Admin", "UPDATES", "costs", "_next", " dashboard "])
    test(`refuses ${JSON.stringify(name)}`, () => {
      expect(GraphName.safeParse(name).success).toBe(false);
      expect(graphNameError(name)).toContain("roam.pub page");
    });

  test("allows ordinary names and doesn't flag an empty field", () => {
    for (const name of ["my-graph", "admin2", "Team_Notes"]) expect(graphNameError(name)).toBeNull();
    expect(graphNameError("")).toBeNull();
    expect(graphNameError("bad/name")).toContain("letters, numbers");
  });
});
