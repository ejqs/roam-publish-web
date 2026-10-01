import type { Node } from "@/db/app-schema";
import { cn } from "@/lib/utils";
import { blockComponent, type PageLinks, RoamText } from "./markup";

type ViewType = Node["viewType"];

const headingClass = {
  1: "text-[28px] font-semibold leading-tight",
  2: "text-[22px] font-semibold leading-snug",
  3: "text-lg font-semibold",
} as const;

const alignClass = {
  left: "",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
} as const;

const textClass = (node: Node) =>
  cn("break-words whitespace-pre-wrap", node.heading && headingClass[node.heading], node.align && alignClass[node.align]);

function Marker({ node, viewType, n }: { node: Node; viewType: ViewType; n: number }) {
  if (viewType === "document") return null;
  if (viewType === "numbered") {
    return (
      <span
        aria-hidden
        className={cn(
          "absolute left-0 w-6 pr-1.5 text-right leading-[1.6] text-roam-bullet tabular-nums",
          node.heading === 1 ? "top-[6px]" : node.heading === 2 ? "top-[4px]" : node.heading === 3 ? "top-[3px]" : "top-0.5",
        )}
      >
        {n}.
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-2 size-[5px] rounded-full bg-roam-bullet",
        node.heading === 1 ? "top-[16px]" : node.heading === 2 ? "top-[13px]" : node.heading === 3 ? "top-[11px]" : "top-[9px]",
      )}
    />
  );
}

type Cell = { node: Node; rowSpan: number };

/** Roam tables: each child of the table block is a row, and each block's children are the next column. */
function tableRows(node: Node): Cell[][] {
  if (!node.children.length) return [[{ node, rowSpan: 1 }]];
  const rows = node.children.flatMap(tableRows);
  rows[0] = [{ node, rowSpan: rows.length }, ...rows[0]];
  return rows;
}

function Table({ rows, links }: { rows: Node[]; links: PageLinks }) {
  const body = rows.flatMap(tableRows);
  return (
    <div className="my-1 overflow-x-auto">
      <table className="border-collapse">
        <tbody>
          {body.map((cells, r) => (
            <tr key={r}>
              {cells.map((c) => (
                <td
                  key={c.node.uid}
                  rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
                  className={cn("min-w-24 border border-border px-2 py-1 align-top leading-[1.6]", textClass(c.node))}
                >
                  <RoamText text={c.node.string} links={links} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Embed({ node, links }: { node: Node; links: PageLinks }) {
  return (
    <div className="my-1 rounded-sm border border-border bg-muted/40 py-1 pr-2">
      {node.string ? (
        <BlockList nodes={[node]} links={links} />
      ) : (
        <BlockList nodes={node.children} links={links} viewType={node.viewType} />
      )}
    </div>
  );
}

function Block({ node, links, viewType, n }: { node: Node; links: PageLinks; viewType: ViewType; n: number }) {
  const kind = blockComponent(node.string);
  return (
    <li className="relative pl-6">
      <Marker node={node} viewType={viewType} n={n} />
      <div className={cn("py-0.5 leading-[1.6]", textClass(node))}>
        <RoamText text={node.string} links={links} />
      </div>
      {node.embed && <Embed node={node.embed} links={links} />}
      {/* A table's children are its cells; a diagram's children are its source. */}
      {kind === "table" ? (
        <Table rows={node.children} links={links} />
      ) : (
        kind !== "diagram" &&
        node.children.length > 0 && <BlockList nodes={node.children} links={links} viewType={node.viewType} nested />
      )}
    </li>
  );
}

export function BlockList({
  nodes,
  links,
  nested,
  viewType,
}: {
  nodes: Node[];
  links: PageLinks;
  nested?: boolean;
  viewType?: ViewType;
}) {
  const List = viewType === "numbered" ? "ol" : "ul";
  return (
    <List
      className={cn("flex flex-col", nested && "ml-2", nested && viewType !== "document" && "border-l border-border/70")}
    >
      {nodes.map((n, i) => (
        <Block key={n.uid} node={n} links={links} viewType={viewType} n={i + 1} />
      ))}
    </List>
  );
}
