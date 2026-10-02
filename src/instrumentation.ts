export async function register() {
  // The change log sender needs Node (database, crypto) and a long-running server.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/changelog-worker").then((m) => m.startChangeLogWorker());
}
