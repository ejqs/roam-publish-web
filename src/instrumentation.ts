export async function register() {
  // Background jobs (change log sender, Umami view sync) need Node and a long-running server.
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/job-worker").then((m) => m.startJobWorker());
}
