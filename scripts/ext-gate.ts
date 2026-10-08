/**
 * Runs before every migration (`bun run db:migrate`, the production pre-deploy step): refuses a release
 * that needs a newer extension than anyone who used Roam Publish in the last 30 days has, so a
 * breaking change never reaches people before they've updated. Only production is held back;
 * elsewhere it warns. There's no override: wait for everyone to update (see /admin/extension and
 * /updates/upcoming).
 */
import { EXT_MIN_VERSION } from "@/lib/ext-compat";
import { ACTIVE_DAYS, leftBehind } from "@/lib/ext-version";

const production = process.env.RAILWAY_ENVIRONMENT_NAME === "production";

let behind: Awaited<ReturnType<typeof leftBehind>>;
try {
  behind = await leftBehind(EXT_MIN_VERSION);
} catch (e) {
  // A database from before versions were recorded (migration 0041) has no one to leave behind.
  if ((e as { code?: string; cause?: { code?: string } }).cause?.code === "42P01" || (e as { code?: string }).code === "42P01") behind = [];
  else throw e;
}

if (behind.length) {
  const who = behind
    .map((r) => `  extension ${r.version ?? "older than 0.2.0"}: ${r.people} ${r.people === 1 ? "person" : "people"}, ${r.graphs} ${r.graphs === 1 ? "graph" : "graphs"}`)
    .join("\n");
  console.error(
    `This release needs extension ${EXT_MIN_VERSION} or newer, but people who used Roam Publish in the last ${ACTIVE_DAYS} days are on older ones:\n${who}\n` +
      (production ? "Not deploying. Ship it once they've all updated (/admin/extension)." : "This would stop a production deploy."),
  );
  if (production) process.exit(1);
} else console.log(`Extension check: everyone active is on ${EXT_MIN_VERSION} or newer.`);
process.exit(0);
