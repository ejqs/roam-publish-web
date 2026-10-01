import Link from "next/link";
import { Suspense } from "react";
import { Featured } from "@/components/featured";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  {
    title: "1. Install the extension",
    body: "Add Roam Publish from Roam Depot, then click “Log in to Roam Publish” in its settings.",
  },
  {
    title: "2. Verify your graph",
    body: "Paste a temporary append-only token. We write a one-time code to your daily note to confirm you own the graph.",
  },
  {
    title: "3. Right-click to publish",
    body: "Right-click any page or block and choose Publish. You get a public link instantly.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-4 py-20">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight">
            Publish Roam pages and blocks to the web
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Share a page or a single block from your Roam Research graph as a clean,
            public web page, straight from the right-click menu.
          </p>
          <div className="flex gap-2">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Get started
            </Link>
            <Link href="/login" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Log in
            </Link>
          </div>
        </section>
        <section className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-20 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>{s.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
        <Suspense>
          <Featured />
        </Suspense>
      </main>
      <SiteFooter variant="full" />
    </>
  );
}
