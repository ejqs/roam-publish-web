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
  { href: "/admin/log", label: "Log" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Admin sections">
      {TABS.map((t) => {
        const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({ variant: active ? "secondary" : "ghost" })}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
