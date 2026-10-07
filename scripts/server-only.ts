import { plugin } from "bun";

/**
 * Server code is marked `import "server-only"` so Next.js fails the build if a Client Component pulls it in. Next
 * resolves that import to an empty module on the server; Bun (tests and scripts) runs outside Next, so it does here.
 */
plugin({
  name: "server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});
