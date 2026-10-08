import type { BundledLanguage, bundledLanguages, bundledLanguagesAlias, bundledLanguagesInfo } from "shiki";

type Shiki = {
  bundledLanguages: typeof bundledLanguages;
  bundledLanguagesAlias: typeof bundledLanguagesAlias;
  bundledLanguagesInfo: typeof bundledLanguagesInfo;
};

// Roam's language picker names that Shiki spells differently.
const aliases: Record<string, string> = {
  "c++": "cpp",
  "c#": "csharp",
  "f#": "fsharp",
  "objective-c": "objective-c",
  "plain text": "text",
  plaintext: "text",
  text: "text",
};

export function resolveLang(shiki: Shiki, lang: string) {
  const l = lang.trim().toLowerCase();
  const name = aliases[l] ?? l;
  return (name in shiki.bundledLanguages || name in shiki.bundledLanguagesAlias ? name : "text") as BundledLanguage | "text";
}

/** What a code block's header calls its language: Shiki's name for it, else what the author typed. */
export function languageLabel(shiki: Shiki, lang: string) {
  const name = resolveLang(shiki, lang);
  if (name === "text") return lang.trim() && !aliases[lang.trim().toLowerCase()] ? lang.trim() : "Plain text";
  return shiki.bundledLanguagesInfo.find((l) => l.id === name || l.aliases?.includes(name))?.name ?? lang.trim();
}

/** A label before Shiki has loaded in the browser: what the author typed. */
export const typedLabel = (lang: string) => (lang.trim() && !aliases[lang.trim().toLowerCase()] ? lang.trim() : "Plain text");

/** Highlights code for both themes, the same on the server and in the browser. */
export async function highlight(code: string, lang: string) {
  const shiki = await import("shiki");
  const language = resolveLang(shiki, lang);
  const highlighter = await shiki.getSingletonHighlighter({ themes: ["github-light", "github-dark"] });
  if (language !== "text") await highlighter.loadLanguage(language);
  const html = highlighter.codeToHtml(code, { lang: language, themes: { light: "github-light", dark: "github-dark" } });
  return { html, language, label: languageLabel(shiki, lang) };
}

export const CODE_CLASS = "roam-code overflow-x-auto p-3 font-mono text-[13px] leading-normal whitespace-pre";
