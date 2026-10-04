import type { ReactNode } from "react";
import type { Node } from "@/db/app-schema";
import { cn } from "@/lib/utils";
import { blockComponent, isOnlyComponent, isOnlyComponents, type PageLinks, RoamText } from "./markup";
import { bulletClass, childrenClass, rowClass } from "./outline";

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
          "absolute left-0 w-[1.875em] pr-[0.375em] text-right leading-[1.6] text-roam-bullet tabular-nums",
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
        bulletClass,
        node.heading === 1
          ? "top-[15.5px]"
          : node.heading === 2
            ? "top-[12.5px]"
            : node.heading === 3
              ? "top-[10.5px]"
              : undefined,
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

function Kanban({ columns, links }: { columns: Node[]; links: PageLinks }) {
  return (
    <div className="my-1 flex gap-3 overflow-x-auto pb-1">
      {columns.map((col) => (
        <div key={col.uid} className="w-60 shrink-0 rounded-sm bg-muted p-2">
          <div className="mb-2 px-1 font-semibold break-words whitespace-pre-wrap">
            <RoamText text={col.string} links={links} />
          </div>
          <div className="flex flex-col gap-2">
            {col.children.map((card) => (
              <div
                key={card.uid}
                className="rounded-sm border border-border bg-card px-2 py-1.5 leading-[1.6] break-words whitespace-pre-wrap"
              >
                <RoamText text={card.string} links={links} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Embed({ node, links }: { node: Node; links: PageLinks }) {
  return (
    <div className="my-0.5 rounded-sm border border-border bg-muted/40 py-1 pr-2">
      {node.title !== undefined && (
        <div className="px-3 pt-1 pb-2 text-[28px] leading-tight font-semibold break-words">
          <RoamText text={`[[${node.title}]]`} links={links} />
        </div>
      )}
      {node.string ? (
        <BlockList nodes={[node]} links={links} />
      ) : (
        <BlockList nodes={node.children} links={links} viewType={node.viewType} />
      )}
    </div>
  );
}

/** Marks where a block's `asides` node is rendered inline, e.g. an asterisk with a popup. */
export const ASIDE_MARK = "[*]";

function Block({
  node,
  links,
  viewType,
  n,
  aside,
  asides,
}: {
  node: Node;
  links: PageLinks;
  viewType: ViewType;
  n: number;
  aside?: ReactNode;
  asides?: Record<string, ReactNode>;
}) {
  const kind = blockComponent(node.string);
  // Tables and kanban boards are drawn from the block's children; a diagram's children are its source.
  const special =
    kind === "table" ? (
      <Table rows={node.children} links={links} />
    ) : kind === "kanban" ? (
      <Kanban columns={node.children} links={links} />
    ) : null;
  const embeds = [node.embed, ...(node.moreEmbeds ?? [])].filter((e): e is Node => !!e);
  const embed = embeds.length > 0 && embeds.map((e, i) => <Embed key={`${e.uid}-${i}`} node={e} links={links} />);
  // Like Roam, a block that is only a table, board or embed(s) shows it in place of its text.
  const showText = !(
    (isOnlyComponent(node.string) && (special || embed)) ||
    (embeds.length > 1 && isOnlyComponents(node.string))
  );
  return (
    <li className={rowClass}>
      <Marker node={node} viewType={viewType} n={n} />
      {showText && (
        <div className={cn("py-0.5 leading-[1.6]", textClass(node))}>
          {/* Like Roam, an empty or whitespace-only block still takes a full line. */}
          {aside && node.string.includes(ASIDE_MARK) ? (
            <>
              <RoamText text={node.string.slice(0, node.string.indexOf(ASIDE_MARK))} links={links} />
              {aside}
              <RoamText text={node.string.slice(node.string.indexOf(ASIDE_MARK) + ASIDE_MARK.length)} links={links} />
            </>
          ) : node.string.trim() ? (
            <RoamText text={node.string} links={links} />
          ) : (
            "\u00a0"
          )}
        </div>
      )}
      {embed}
      {special}
      {!kind && node.children.length > 0 && (
        <BlockList nodes={node.children} links={links} viewType={node.viewType ?? viewType} asides={asides} nested />
      )}
    </li>
  );
}

export function BlockList({
  nodes,
  links,
  nested,
  viewType,
  asides,
}: {
  nodes: Node[];
  links: PageLinks;
  nested?: boolean;
  viewType?: ViewType;
  /** Inline content for blocks containing {@link ASIDE_MARK}, keyed by block uid. */
  asides?: Record<string, ReactNode>;
}) {
  const List = viewType === "numbered" ? "ol" : "ul";
  return (
    <List
      className={cn("flex flex-col", nested && childrenClass, nested && viewType === "document" && "border-transparent")}
    >
      {nodes.map((n, i) => (
        <Block key={n.uid} node={n} links={links} viewType={viewType} n={i + 1} aside={asides?.[n.uid]} asides={asides} />
      ))}
    </List>
  );
}
