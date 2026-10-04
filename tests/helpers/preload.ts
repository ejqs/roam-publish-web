import { mock } from "bun:test";

/**
 * Runs before every test file. Points the app at the test database and stands in for the parts of
 * Next.js that only exist inside a request (headers, cookies, after, cache revalidation).
 */

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5433/roam_publish_test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.APPEND_TOKEN_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.ROAM_APPEND_API = "http://roam-append.test";
process.env.CHANGELOG_WORKER = "off";
process.env.JOBS = "off";
process.env.UMAMI_API_URL = "http://umami.test";
process.env.UMAMI_API_KEY = "test-umami-key";
// What's new never reaches GitHub from a test; tests that need it fake fetch.
process.env.EXTENSION_DEPOT_URL = "http://github.test/depot/roam-publish.json";
process.env.EXTENSION_CHANGELOG_URL = "http://github.test/{sha}/CHANGELOG.md";
process.env.EXTENSION_COMMITS_URL = "http://github.test/commits";
delete process.env.RESEND_API_KEY;

const { request } = await import("./request");

const realServer = await import("next/server");
mock.module("next/server", () => ({ ...realServer, after: (fn: () => unknown) => request.after.push(fn) }));

mock.module("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => (request.cookies.has(name) ? { name, value: request.cookies.get(name)! } : undefined),
    set: (name: string, value: string) => void request.cookies.set(name, value),
    delete: (name: string) => void request.cookies.delete(name),
    getAll: () => [...request.cookies].map(([name, value]) => ({ name, value })),
  }),
}));

const realCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...realCache,
  revalidatePath: () => {},
  revalidateTag: () => {},
  updateTag: () => {},
  // No incremental cache outside Next: run the function every time.
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// Keep test output readable: the dev email fallback logs every email.
const log = console.log;
console.log = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("\n[email]")) request.emails.push(args[0]);
  else log(...args);
};
