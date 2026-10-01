import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireAdminPage } from "@/lib/admin";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdminPage("/admin");
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">Moderation</h1>
            <AdminNav />
          </div>
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
