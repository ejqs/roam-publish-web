import { SITE_VERSION } from "./version";

/**
 * What the extension and roam.pub tell each other about versions (lib/ext-version.ts has the rest).
 *
 * The website and the extension are compatible while they share a major version. A breaking change
 * to what the extension relies on goes: the website adds the new shape beside the old one, the
 * extension moves to it as its next major, then the website drops the old shape as its own next
 * major once everyone has updated (CLAUDE.md). The extension sends its version in EXT_VERSION_HEADER from 0.2.0.
 * Every API response names the oldest extension this website works with, `{major}.0.0`, in
 * EXT_MIN_VERSION_HEADER, and an older extension (0.2.0 and later) asks the person to update. Before
 * raising the major, check /admin/extension so nobody is left behind by surprise.
 */
export const EXT_VERSION_HEADER = "x-roam-publish-version";
export const EXT_MIN_VERSION_HEADER = "x-roam-publish-min-version";
export const EXT_MIN_VERSION = `${SITE_VERSION.split(".")[0]}.0.0`;
