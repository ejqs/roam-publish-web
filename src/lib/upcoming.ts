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
  /** When it was announced (YYYY-MM-DD). */
  announced: string;
};

export const UPCOMING: Upcoming[] = [
  {
    id: "password-pages-encrypted-in-roam",
    title: "Password pages must be encrypted in Roam",
    text:
      "From extension 0.2.0, Password pages are encrypted in Roam before they're published, so roam.pub never sees " +
      "their text. Older extensions still send the text, and roam.pub encrypts it when it arrives. roam.pub will " +
      "stop accepting that, so every Password page is end-to-end encrypted.",
    action:
      "Update Roam Publish to 0.2.0 or newer in Roam: Settings → Roam Depot → Installed extensions. Anyone else " +
      "who publishes to your graphs needs to update too. After the change, an older extension asks to be " +
      "updated instead of publishing.",
    version: "1.0.0",
    extension: "0.2.0",
    announced: "2026-10-08",
  },
];
