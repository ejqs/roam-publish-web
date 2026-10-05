import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * The admin layout's check doesn't run when the client router fetches only the page segment (a
 * navigation inside /admin, or a forged request claiming one), so every admin page checks for itself.
 */
test("every admin page calls requireAdminPage", async () => {
  const unchecked: string[] = [];
  for (const f of new Glob("admin/**/page.tsx").scanSync({ cwd: "src/app" })) {
    const src = await Bun.file(`src/app/${f}`).text();
    const body = src.match(/^export default async function \w+\([^)]*\) \{\n(.*)$/m)?.[1] ?? "";
    if (!body.trimStart().startsWith("await requireAdminPage(")) unchecked.push(f);
  }
  expect(unchecked).toEqual([]);
});
