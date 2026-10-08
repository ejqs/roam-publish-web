import { bundledLanguages, bundledLanguagesAlias, bundledLanguagesInfo, getSingletonHighlighter } from "shiki";
import { CopyButton } from "@/components/copy-button";
import { CodeFrame } from "./code-frame";
import { MermaidDiagram } from "./mermaid-diagram";

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

/** What a code block's header calls its language: Shiki's name for it, else what the author typed. */
export function languageLabel(lang: string) {
  const name = resolveLang(lang);
  if (name === "text") return lang.trim() && !aliases[lang.trim().toLowerCase()] ? lang.trim() : "Plain text";
  return bundledLanguagesInfo.find((l) => l.id === name || l.aliases?.includes(name))?.name ?? lang.trim();
}

export async function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const language = resolveLang(lang);
  const source = code.replace(/\n$/, "");
  const highlighter = await getSingletonHighlighter({ themes: ["github-light", "github-dark"] });
  if (language !== "text") await highlighter.loadLanguage(language as keyof typeof bundledLanguages);
  const html = highlighter.codeToHtml(source, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
  });
  const highlighted = (
    <div
      className="roam-code overflow-x-auto p-3 font-mono text-[13px] leading-normal whitespace-pre"
      // Shiki escapes the code; the markup is its own.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
  if (language === "mermaid") return <MermaidDiagram source={source} code={highlighted} />;
  return (
    <CodeFrame label={languageLabel(lang)} actions={<CopyButton text={source} label="Copy code" variant="ghost" size="icon-xs" />}>
      {highlighted}
    </CodeFrame>
  );
}
