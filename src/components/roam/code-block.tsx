import * as React from "react";
import { CopyButton } from "@/components/copy-button";
import { CodeBlockClient } from "./code-block-client";
import { CODE_CLASS, highlight } from "./code-langs";
import { CodeFrame } from "./code-frame";
import { MermaidDiagram } from "./mermaid-diagram";

async function CodeBlockServer({ code, lang }: { code: string; lang: string }) {
  const source = code.replace(/\n$/, "");
  const { html, language, label } = await highlight(source, lang);
  const highlighted = (
    <div
      className={CODE_CLASS}
      // Shiki escapes the code; the markup is its own.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
  if (language === "mermaid") return <MermaidDiagram source={source} code={highlighted} />;
  return (
    <CodeFrame label={label} actions={<CopyButton text={source} label="Copy code" variant="ghost" size="icon-xs" />}>
      {highlighted}
    </CodeFrame>
  );
}

/**
 * A code block, highlighted. Server components highlight it before sending the page; a page
 * rendered in the browser (an encrypted one, decrypted there) can't wait on an async component,
 * so it gets the browser's version. React's server-components build has no useState, which tells
 * the two apart.
 */
export const CodeBlock: (p: { code: string; lang: string }) => React.ReactNode =
  "useState" in React ? CodeBlockClient : (CodeBlockServer as never);
