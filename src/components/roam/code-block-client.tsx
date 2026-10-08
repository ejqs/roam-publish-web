"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { CODE_CLASS, highlight, typedLabel } from "./code-langs";
import { CodeFrame } from "./code-frame";
import { MermaidDiagram } from "./mermaid-diagram";

/**
 * A code block drawn in the browser, for pages decrypted there: plain at first, highlighted once
 * Shiki loads. Pages the server renders use the server's CodeBlock, highlighted from the start.
 */
export function CodeBlockClient({ code, lang }: { code: string; lang: string }) {
  const source = code.replace(/\n$/, "");
  const [done, setDone] = useState<{ html: string; label: string } | null>(null);
  useEffect(() => {
    let live = true;
    highlight(source, lang)
      .then((h) => live && setDone(h))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [source, lang]);
  const highlighted = done ? (
    // Shiki escapes the code; the markup is its own.
    <div className={CODE_CLASS} dangerouslySetInnerHTML={{ __html: done.html }} />
  ) : (
    <div className={CODE_CLASS}>{source}</div>
  );
  if (lang.trim().toLowerCase() === "mermaid") return <MermaidDiagram source={source} code={highlighted} />;
  return (
    <CodeFrame label={done?.label ?? typedLabel(lang)} actions={<CopyButton text={source} label="Copy code" variant="ghost" size="icon-xs" />}>
      {highlighted}
    </CodeFrame>
  );
}
