import type { Node } from "@/db/app-schema";
import { cn } from "@/lib/utils";
import { type PageLinks, RoamText } from "./markup";

const headingClass = {
  1: "text-[28px] font-semibold leading-tight",
  2: "text-[22px] font-semibold leading-snug",
  3: "text-lg font-semibold",
} as const;

function Block({ node, links }: { node: Node; links: PageLinks }) {
  return (
    <li className="relative pl-6">
      <span
        aria-hidden
        className={cn(
          "absolute left-2 size-[5px] rounded-full bg-roam-bullet",
          node.heading === 1 ? "top-[16px]" : node.heading === 2 ? "top-[13px]" : node.heading === 3 ? "top-[11px]" : "top-[9px]",
        )}
      />
      <div className={cn("py-0.5 leading-[1.6] break-words whitespace-pre-wrap", node.heading && headingClass[node.heading])}>
        <RoamText text={node.string} links={links} />
      </div>
      {node.children.length > 0 && <BlockList nodes={node.children} links={links} nested />}
    </li>
  );
}

export function BlockList({ nodes, links, nested }: { nodes: Node[]; links: PageLinks; nested?: boolean }) {
  return (
    <ul className={cn("flex flex-col", nested && "ml-2 border-l border-border/70")}>
      {nodes.map((n) => (
        <Block key={n.uid} node={n} links={links} />
      ))}
    </ul>
  );
}
