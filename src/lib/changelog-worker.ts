import { flushChangeLog } from "./changelog";

const TICK_MS = 5_000;
const started = globalThis as unknown as { changeLogWorker?: boolean };

/**
 * Sends queued change log entries every few seconds for as long as the server runs. Runs never
 * overlap in one process; across processes, flushChangeLog's claims keep entries from being sent twice.
 */
export function startChangeLogWorker() {
  if (started.changeLogWorker || process.env.CHANGELOG_WORKER === "off") return;
  started.changeLogWorker = true;
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    flushChangeLog()
      .catch((e) => console.error("change log send failed", e))
      .finally(() => (running = false));
  }, TICK_MS).unref();
}
