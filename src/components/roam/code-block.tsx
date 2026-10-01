import { bundledLanguages, bundledLanguagesAlias, getSingletonHighlighter } from "shiki";

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

function resolveLang(lang: string) {
  const l = lang.trim().toLowerCase();
  const name = aliases[l] ?? l;
  return name in bundledLanguages || name in bundledLanguagesAlias ? name : "text";
}

export async function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const language = resolveLang(lang);
  const highlighter = await getSingletonHighlighter({ themes: ["github-light", "github-dark"] });
  if (language !== "text") await highlighter.loadLanguage(language as keyof typeof bundledLanguages);
  const html = highlighter.codeToHtml(code.replace(/\n$/, ""), {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
  });
  return (
    <div
      className="roam-code my-1 overflow-x-auto rounded-sm bg-muted p-3 font-mono text-[13px] leading-normal whitespace-pre"
      // Shiki escapes the code; the markup is its own.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
