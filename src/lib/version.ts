import pkg from "../../package.json";

/**
 * The website's version: the top release in CHANGELOG.md, kept in package.json (a test holds them together).
 * A release with a New change bumps the minor version, one with only Improved or Fixed bumps the patch.
 */
export const SITE_VERSION: string = pkg.version;
