/**
 * What the extension and roam.pub tell each other about versions (lib/ext-version.ts has the rest).
 *
 * Every API response names, in EXT_MIN_VERSION_HEADER, the oldest extension this website works with,
 * and an older extension (0.2.0 and later) asks the person to update. The extension sends its own
 * version in EXT_VERSION_HEADER from 0.2.0.
 *
 * EXT_MIN_VERSION is raised only by a release that removes something older extensions rely on, which
 * is also the only kind of release that bumps the website's major (CLAUDE.md, Extension compatibility).
 * It names the exact extension version needed; the two majors don't have to match. A production deploy
 * that raises it fails while anyone active in the last 30 days is on an older extension
 * (scripts/ext-gate.ts).
 */
export const EXT_VERSION_HEADER = "x-roam-publish-version";
export const EXT_MIN_VERSION_HEADER = "x-roam-publish-min-version";
export const EXT_MIN_VERSION = "0.0.0";
