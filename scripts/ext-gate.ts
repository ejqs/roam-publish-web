/**
 * Runs before every migration (`bun run db:migrate`, the production pre-deploy step): refuses a release
 * that needs a newer extension than anyone who used Roam Publish in the last 30 days has, so a
 * breaking change never reaches people before they've updated. Only production is held back;
 * elsewhere it warns. There's no override: wait for everyone to update (see /admin/extension and
 * /updates/upcoming).
 */
import { EXT_MIN_VERSION, EXT_NEEDS_SEAL } from "@/lib/ext-compat";
import { ACTIVE_DAYS, cantSeal, leftBehind } from "@/lib/ext-version";

const production = process.env.RAILWAY_ENVIRONMENT_NAME === "production";

/** A database from before versions (migration 0041) or encryption support (0043) were recorded has no one to leave behind. */
async function unlessNew<T>(f: () => Promise<T[]>): Promise<T[]> {
  try {
    return await f();
  } catch (e) {
    const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
    if (code === "42P01" || (EXT_NEEDS_SEAL && code === "42703")) return [];
    throw e;
  }
}

const behind = await unlessNew(() => leftBehind(EXT_MIN_VERSION));
const unsealed = EXT_NEEDS_SEAL ? await unlessNew(() => cantSeal()) : [];

if (behind.length) {
  const who = behind
    .map((r) => `  extension ${r.version ?? "older than 0.2.0"}: ${r.people} ${r.people === 1 ? "person" : "people"}, ${r.graphs} ${r.graphs === 1 ? "graph" : "graphs"}`)
    .join("\n");
  console.error(
    `This release needs extension ${EXT_MIN_VERSION} or newer, but people who used Roam Publish in the last ${ACTIVE_DAYS} days are on older ones:\n${who}\n` +
      (production ? "Not deploying. Ship it once they've all updated (/admin/extension)." : "This would stop a production deploy."),
  );
  if (production) process.exit(1);
}
if (unsealed.length) {
  const who = unsealed
    .map((r) => `  extension ${r.version ?? "older than 0.2.0"}: ${r.people} ${r.people === 1 ? "person" : "people"}, ${r.graphs} ${r.graphs === 1 ? "graph" : "graphs"}`)
    .join("\n");
  console.error(
    `This release needs every extension to encrypt pages in Roam, but people who used Roam Publish in the last ${ACTIVE_DAYS} days publish from where it can't (an older extension, or a Roam without X25519):\n${who}\n` +
      (production ? "Not deploying. Ship it once they all can (/admin/extension)." : "This would stop a production deploy."),
  );
  if (production) process.exit(1);
}
if (!behind.length && !unsealed.length)
  console.log(`Extension check: everyone active is on ${EXT_MIN_VERSION} or newer${EXT_NEEDS_SEAL ? " and can encrypt in Roam" : ""}.`);
process.exit(0);
