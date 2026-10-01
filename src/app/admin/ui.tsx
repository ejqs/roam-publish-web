import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const ADMIN_PAGE_SIZE = 50;

export function parsePage(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function param(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
export const fmtDate = (d: Date | null | undefined) => (d ? dateFmt.format(d) : "—");

function href(path: string, params: Record<string, string>, page: number) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** GET search form; other filters ride along as hidden fields. */
export function SearchForm({
  path,
  q,
  placeholder,
  keep = {},
}: {
  path: string;
  q: string;
  placeholder: string;
  keep?: Record<string, string>;
}) {
  return (
    <form action={path} className="flex max-w-sm flex-1 gap-2">
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <Input name="q" defaultValue={q} placeholder={placeholder} aria-label="Search" />
    </form>
  );
}

export function FilterLinks({
  path,
  name,
  value,
  options,
  keep = {},
}: {
  path: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  keep?: Record<string, string>;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <Link
          key={o.value}
          href={href(path, { ...keep, [name]: o.value }, 1)}
          aria-current={value === o.value ? "true" : undefined}
          className={buttonVariants({ variant: value === o.value ? "secondary" : "ghost", size: "sm" })}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export function Pager({
  path,
  params,
  page,
  total,
}: {
  path: string;
  params: Record<string, string>;
  page: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (pages === 1) return <p className="text-sm text-muted-foreground">{total} total</p>;
  return (
    <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-muted-foreground">
        {total} total · page {page} of {pages}
      </span>
      <div className="flex gap-1">
        {page > 1 && (
          <Link href={href(path, params, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Previous
          </Link>
        )}
        {page < pages && (
          <Link href={href(path, params, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
