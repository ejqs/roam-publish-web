import Link from "next/link";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { PrivacyBadges } from "@/components/privacy-badges";
import type { PrivacyNote } from "@/components/privacy-icons";
import { BlockList } from "@/components/roam/block-tree";
import { PageThread } from "@/components/roam/collapsible-row";
import { PageOutlineAside, PageOutlineDetails } from "@/components/roam/page-outline";
import { blockComponent, type PageLinks, RoamText } from "@/components/roam/markup";
import type { Node } from "@/db/app-schema";
import { headingsOf, zoomPath } from "@/lib/headings";
import { zoomHref } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import { cn } from "cn";

const componentName = { table: "Table", kanban: "Kanban board", diagram: "Diagram" } as const;

/**
 * A block as a breadcrumb: its plain text, cut short so a long block doesn't take the whole trail. A block that is
 * only a table, board or embed is named after it.
 */
const crumbLabel = (n: Node) => {
  const kind = blockComponent(n.string);
  const t =
    plainText(n.string) ||
    (kind && componentName[kind]) ||
    (n.embed && (n.embed.title ?? plainText(n.embed.string))) ||
    "Untitled";
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t;
};

/** Whether any of these blocks can be folded. */
const foldable = (nodes: Node[]) => nodes.some((n) => !blockComponent(n.string) && n.children.length > 0);

export type Byline = { label: string; href?: string } | null;

/** What a page's body shows besides its tree. Plain data, so the browser can render an encrypted page's body too. */
export type BodyProps = {
  kind: "page" | "block";
  title: string;
  tags: string[];
  /** This page's own address, for leaving a zoomed-in view. */
  path: string;
  /** The block the reader zoomed into (`?block=`), if any. */
  zoom?: string;
  crumbs: Crumb[] | null;
  byline: Byline;
  /** Whether it's protected or not listed, told to the reader next to the title. */
  privacy: PrivacyNote[];
};

/**
 * A published page's title, trail and blocks: everything drawn from its tree. No server-only parts,
 * so an encrypted page renders the same in the reader's browser once it's decrypted there.
 */
export function PublicationBody({
  kind,
  title,
  tags,
  path,
  zoom,
  crumbs,
  byline,
  privacy,
  tree,
  links,
}: BodyProps & { tree: Node; links: PageLinks }) {
  const top = kind === "page" ? tree.children : [tree];
  // Zoomed into a block below the top, like Roam: that block alone, under a trail back up the page.
  const zoomed = zoom && zoom !== tree.uid ? zoomPath(top, zoom) : null;
  const zoomNode = zoomed?.at(-1);
  const zoomViewType = zoomed && zoomed.length > 1 ? zoomed.at(-2)!.viewType : kind === "page" ? tree.viewType : undefined;
  // An outline only helps once there's more than one heading to move between.
  const headings = headingsOf(zoomNode ? zoomNode.children : top);
  const outline = headings.length > 1 ? headings : null;
  // The page's top-level blocks, with a thread line to fold them all when any can fold.
  const pageBlocks = (nodes: Node[], viewType: Node["viewType"]) => {
    const list = <BlockList nodes={nodes} links={links} viewType={viewType} anchors />;
    return foldable(nodes) ? <PageThread>{list}</PageThread> : list;
  };
  const tagHref = links.tagHref;
  const tagLine =
    kind === "page" && tagHref && tags.length > 0 ? (
      <p data-pdf-tags className="mb-6 flex flex-wrap gap-x-2 text-sm">
        {tags.map((t) => (
          <Link key={t} href={tagHref(t)} className="text-roam-ref hover:underline">
            #{t}
          </Link>
        ))}
      </p>
    ) : null;
  return (
    <>
      {outline && (
        <PageOutlineAside headings={outline} className="absolute top-16 right-full bottom-16 hidden w-60 pr-6 xl:block pdf:hidden" />
      )}
      {zoomed && zoomNode ? (
        <>
          {/* One trail: the site's crumbs, the page (leaving the zoom), then the blocks above this one. */}
          <Breadcrumbs
            className="mb-3"
            items={[
              ...(crumbs ?? [{ label: plainText(kind === "page" ? title : tree.string) || "Untitled" }]).map((c, i, all) =>
                i === all.length - 1 ? { ...c, href: path } : c,
              ),
              ...zoomed.slice(0, -1).map((n) => ({ label: crumbLabel(n), href: zoomHref(n.uid) })),
              { label: crumbLabel(zoomNode) },
            ]}
          />
          {outline && <PageOutlineDetails headings={outline} className="mb-4 xl:hidden pdf:hidden" />}
          {zoomNode.embed || blockComponent(zoomNode.string) ? (
            <BlockList nodes={[{ ...zoomNode, collapsed: undefined }]} links={links} viewType={zoomViewType} anchors />
          ) : (
            <>
              {/* Like Roam, the block zoomed into reads as the title, with its children below it. */}
              <h1 className="mb-6 text-[26px] sm:text-[32px] leading-tight font-semibold break-words whitespace-pre-wrap">
                <RoamText text={zoomNode.string} links={links} />
                <span data-pdf-skip className="pdf:hidden">
                  <PrivacyBadges notes={privacy} className="ml-2 inline-flex flex-wrap gap-1 align-middle" />
                </span>
              </h1>
              {pageBlocks(zoomNode.children, zoomNode.viewType)}
            </>
          )}
        </>
      ) : kind === "page" ? (
        <>
          {crumbs && <Breadcrumbs items={crumbs} className="pdf:hidden" />}
          <h1 className="mb-2 text-[32px] sm:text-[42px] leading-tight font-semibold break-words">
            {title}
            <span data-pdf-skip className="pdf:hidden">
              <PrivacyBadges notes={privacy} className="ml-2 inline-flex flex-wrap gap-1 align-middle" />
            </span>
          </h1>
          <BylineLine byline={byline} className={cn(tagLine ? "mb-2" : "mb-6", "pdf:hidden")} />
          {tagLine}
          {!byline && !tagLine && <div className="mb-4 pdf:hidden" />}
          {outline && <PageOutlineDetails headings={outline} className="mb-4 xl:hidden pdf:hidden" />}
          {pageBlocks(tree.children, tree.viewType)}
        </>
      ) : (
        <>
          {crumbs && <Breadcrumbs items={crumbs} className="pdf:hidden" />}
          <PrivacyBadges notes={privacy} className="mb-3 flex flex-wrap gap-1 pdf:hidden" />
          <BylineLine byline={byline} className="mb-4 pdf:hidden" />
          {outline && <PageOutlineDetails headings={outline} className="mb-4 xl:hidden pdf:hidden" />}
          <BlockList nodes={[tree]} links={links} anchors />
        </>
      )}
    </>
  );
}

export function BylineLine({ byline, className }: { byline: Byline; className?: string }) {
  if (!byline) return null;
  return (
    <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
      By{" "}
      {byline.href ? (
        <Link href={byline.href} className="hover:text-foreground hover:underline">
          {byline.label}
        </Link>
      ) : (
        byline.label
      )}
    </p>
  );
}

