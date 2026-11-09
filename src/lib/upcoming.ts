/**
 * Upcoming changes (/updates/upcoming): breaking changes announced before they happen, so people can
 * get ready. Each waits for every extension in use to be new enough (/admin/extension), then ships as
 * the website's next major with a `Breaking:` bullet in CHANGELOG.md; remove it from here in that
 * same release.
 */
export type Upcoming = {
  /** Stable anchor on the page. */
  id: string;
  title: string;
  /** What changes and why. Markdown-lite, as in the changelog: **bold**, `code` and [links](https://…). */
  text: string;
  /** What people need to do before it happens. */
  action: string;
  /** The roam.pub version that makes the change. */
  version: string;
  /** It happens once every Roam Publish extension in use is this version or newer. */
  extension: string;
  /** And every one of them is somewhere Roam can encrypt pages (EXT_NEEDS_SEAL). */
  needsSeal?: boolean;
  /** When it was announced (YYYY-MM-DD). */
  announced: string;
};

export const UPCOMING: Upcoming[] = [];
