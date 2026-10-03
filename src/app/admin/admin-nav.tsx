"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";

const TABS = [
  { href: "/admin", label: "Reports" },
  { href: "/admin/publications", label: "Publications" },
  { href: "/admin/graphs", label: "Graphs" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/blocked", label: "Blocked" },
  { href: "/admin/log", label: "Log" },
  { href: "/admin/jobs", label: "Jobs" },
  { href: "/admin/status", label: "Status" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Admin sections">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({ variant: active ? "secondary" : "ghost", className: "shrink-0" })}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
