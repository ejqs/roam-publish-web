"use client";

import { CodeIcon, WorkflowIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useId, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { CodeFrame } from "./code-frame";

/**
 * A Mermaid diagram drawn in the browser, with its source a click away. `code` is the highlighted
 * source, shown until the diagram is drawn and whenever it can't be.
 */
export function MermaidDiagram({ source, code }: { source: string; code: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const id = `mermaid-${useId().replace(/[^\w-]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        // Strict: no click handlers or raw HTML from the page author.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          // Greys that sit with the site's palette, at its body text size.
          theme: resolvedTheme === "dark" ? "dark" : "neutral",
          fontFamily: "inherit",
          themeVariables: { fontSize: "14px" },
        });
        const { svg } = await mermaid.render(id, source);
        if (live) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        // Mermaid leaves its error drawing in the page; take it back out.
        document.getElementById(`d${id}`)?.remove();
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [id, source, resolvedTheme]);

  const drawn = svg && !failed;
  return (
    <CodeFrame
      label={failed ? "Mermaid · couldn't draw this diagram" : "Mermaid"}
      actions={
        <>
          {drawn && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setShowCode(!showCode)}
              aria-label={showCode ? "Show diagram" : "Show code"}
              title={showCode ? "Show diagram" : "Show code"}
              aria-pressed={showCode}
            >
              {showCode ? <WorkflowIcon /> : <CodeIcon />}
            </Button>
          )}
          <CopyButton text={source} label="Copy code" variant="ghost" size="icon-xs" />
        </>
      }
    >
      {drawn && !showCode ? (
        <div
          className="flex justify-center overflow-x-auto bg-card p-3 [&_svg]:h-auto [&_svg]:max-w-full"
          // Mermaid sanitizes its own output under securityLevel "strict".
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        code
      )}
    </CodeFrame>
  );
}
