import type { Instrumentation } from "next";

export async function register() {
  // Background jobs (change log sender, Umami view sync, metrics flush) need Node and a long-running server.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/job-worker").then((m) => m.startJobWorker());
}

/**
 * Server errors Next caught. Route handlers and server actions record their own (lib/telemetry.ts
 * wrappers), so this only counts errors while rendering a page or in the proxy.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (context.routeType === "route" || context.routeType === "action") return;
  const { isControlFlow, record } = await import("./lib/telemetry");
  if (isControlFlow(err)) return;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  const message = err instanceof Error ? err.message : String(err);
  record(`page ${context.routePath}`, "page", 0, digest ? `${message} (digest ${digest})` : message);
};
