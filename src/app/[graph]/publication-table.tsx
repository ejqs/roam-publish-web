"use client";

import {
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { publicationPath } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import { listHref, PAGE_SIZE, type Sort } from "./sort";

export type Row = {
  rootUid: string;
  kind: "page" | "block";
  title: string;
  createdAt: string;
  updatedAt: string;
};

// UTC keeps server and client renders identical.
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
const helper = createColumnHelper<typeof features, Row>();

// Column id -> URL sort value. Sorting and paging happen on the server; the URL is the state.
const SORT_BY_COLUMN: Record<string, Sort> = { title: "title", updatedAt: "updated", createdAt: "created" };
const SORT_LABELS: [Sort, string][] = [
  ["updated", "Updated"],
  ["created", "Created"],
  ["title", "A–Z"],
];

export function PublicationTable({
  graphName,
  rows,
  sort,
  page,
  pageCount,
}: {
  graphName: string;
  rows: Row[];
  sort: Sort;
  page: number;
  pageCount: number;
}) {
  const pathname = usePathname();
  const columns = helper.columns([
    helper.accessor("title", {
      header: "Title",
      cell: (info) => {
        const r = info.row.original;
        return (
          <Link
            href={publicationPath(graphName, r.rootUid, r.title)}
            className="text-link hover:underline"
          >
            {plainText(r.title) || "Untitled"}
          </Link>
        );
      },
    }),
    helper.accessor("updatedAt", { header: "Updated", cell: (info) => formatDate(info.getValue()) }),
    helper.accessor("createdAt", { header: "Created", cell: (info) => formatDate(info.getValue()) }),
  ]);

  const sortColumn = Object.keys(SORT_BY_COLUMN).find((id) => SORT_BY_COLUMN[id] === sort)!;
  const table = useTable({
    features,
    columns,
    data: rows,
    manualSorting: true,
    manualPagination: true,
    pageCount,
    state: {
      sorting: [{ id: sortColumn, desc: sort !== "title" }],
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
            href={listHref(pathname, value, 1)}
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
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead key={header.id} className={header.column.id === "title" ? "" : "w-32"}>
                    <Link
                      href={listHref(pathname, SORT_BY_COLUMN[header.column.id], 1)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      <table.FlexRender header={header} />
                      {sorted === "asc" && <ArrowUp className="size-3.5" />}
                      {sorted === "desc" && <ArrowDown className="size-3.5" />}
                    </Link>
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
                      : "text-muted-foreground"
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
          <PageLink href={listHref(pathname, sort, page - 1)} disabled={!table.getCanPreviousPage()} rel="prev">
            ← Previous
          </PageLink>
          <span className="text-muted-foreground">
            Page {page} of {table.getPageCount()}
          </span>
          <PageLink href={listHref(pathname, sort, page + 1)} disabled={!table.getCanNextPage()} rel="next">
            Next →
          </PageLink>
        </nav>
      )}
    </div>
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
