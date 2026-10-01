"use client";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, CircleHelp } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DiscoverRow } from "@/lib/discover";
import { graphPath, publicationPath } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import { type DiscoverSort, listHref, PAGE_SIZE } from "./sort";

// UTC keeps server and client renders identical.
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
const helper = createColumnHelper<typeof features, DiscoverRow>();

// Column id -> URL sort value. Sorting and paging happen on the server; the URL is the state.
const SORT_BY_COLUMN: Record<string, DiscoverSort> = { views: "trending", createdAt: "recent" };
const SORT_LABELS: [DiscoverSort, string][] = [
  ["recent", "Recent"],
  ["trending", "Trending"],
];

const columns = helper.columns([
  helper.accessor("title", {
    header: "Title",
    cell: (info) => {
      const r = info.row.original;
      return (
        <Link href={publicationPath(r.graphName, r.rootUid, r.title)} className="text-link hover:underline">
          {plainText(r.title) || "Untitled"}
        </Link>
      );
    },
  }),
  helper.accessor("graphName", {
    header: "Graph",
    cell: (info) => (
      <Link href={graphPath(info.getValue())} className="text-link hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("views", { header: "Views", cell: (info) => info.getValue().toLocaleString("en-US") }),
  helper.accessor("createdAt", {
    header: "Published",
    cell: (info) => dateFmt.format(new Date(info.getValue())),
  }),
]);

export function DiscoverTable({
  rows,
  sort,
  page,
  pageCount,
}: {
  rows: DiscoverRow[];
  sort: DiscoverSort;
  page: number;
  pageCount: number;
}) {
  const sortColumn = sort === "trending" ? "views" : "createdAt";
  const table = useTable({
    features,
    columns,
    data: rows,
    manualSorting: true,
    manualPagination: true,
    pageCount,
    state: {
      sorting: [{ id: sortColumn, desc: true }],
      pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Sort by</span>
        {SORT_LABELS.map(([value, label]) => (
          <Link
            key={value}
            href={listHref(value, 1)}
            aria-current={value === sort ? "true" : undefined}
            className={buttonVariants({ variant: value === sort ? "secondary" : "ghost", size: "sm" })}
          >
            {label}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const id = header.column.id;
                const sortValue = SORT_BY_COLUMN[id];
                const label = (
                  <>
                    <table.FlexRender header={header} />
                    {header.column.getIsSorted() && <ArrowDown className="size-3.5" />}
                  </>
                );
                return (
                  <TableHead key={header.id} className={WIDTHS[id]}>
                    <span className="inline-flex items-center gap-1">
                      {sortValue ? (
                        <Link
                          href={listHref(sortValue, 1)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                      {id === "views" && <ViewsHelp />}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    cell.column.id === "title"
                      ? "max-w-0 truncate whitespace-nowrap"
                      : `${WIDTHS[cell.column.id]} truncate text-muted-foreground`
                  }
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <PageLink href={listHref(sort, page - 1)} disabled={!table.getCanPreviousPage()} rel="prev">
            ← Previous
          </PageLink>
          <span className="text-muted-foreground">
            Page {page} of {table.getPageCount()}
          </span>
          <PageLink href={listHref(sort, page + 1)} disabled={!table.getCanNextPage()} rel="next">
            Next →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

// Phones drop the date so the title keeps room.
const WIDTHS: Record<string, string> = {
  title: "",
  graphName: "w-28 sm:w-40",
  views: "w-20 sm:w-24",
  createdAt: "hidden w-32 sm:table-cell",
};

/** Opens on hover, focus + Enter, and tap, so it works without a mouse. */
function ViewsHelp() {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label="How views are counted"
        className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CircleHelp className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent className="w-64 text-sm font-normal">
        Only signed-in users with at least one verified graph count as a view. Each reader counts once
        per page. Trending ranks views from the last 7 days.
      </PopoverContent>
    </Popover>
  );
}

function PageLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: string;
  children: React.ReactNode;
}) {
  const className = buttonVariants({ variant: "outline", size: "sm" });
  if (disabled)
    return (
      <span className={`${className} pointer-events-none opacity-50`} aria-disabled="true">
        {children}
      </span>
    );
  return (
    <Link href={href} rel={rel} className={className}>
      {children}
    </Link>
  );
}
