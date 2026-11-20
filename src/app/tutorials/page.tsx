import { PlayIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { cn } from "cn";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { type Tutorial, type TutorialSource, TUTORIAL_SOURCE_LABEL, TUTORIALS } from "@/lib/tutorials";
import { TutorialVideo } from "./tutorial-video";

export const metadata: Metadata = {
  title: "Tutorials · Roam Publish",
  description: "Short videos of Roam Publish's main features: publishing, visibility, passwords, collections and more.",
};

// The same chips as What's new: roam.pub in blue, the extension in purple.
const CHIP: Record<TutorialSource, string> = {
  web: "bg-primary/10 text-link",
  ext: "bg-chart-5/15 text-chart-5",
};

/** A step's text with **bold** for the names of buttons and settings. */
function StepText({ text }: { text: string }) {
  return text.split(/\*\*(.+?)\*\*/).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

function Video({ t }: { t: Tutorial }) {
  if (t.video) return <TutorialVideo id={t.id} title={t.title} />;
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 border-b bg-muted text-muted-foreground">
      <span className="flex size-10 items-center justify-center rounded-full border bg-card">
        <PlayIcon className="size-4" aria-hidden />
      </span>
      <span className="text-xs">Video coming soon</span>
    </div>
  );
}

export default function TutorialsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          <div className="flex flex-col gap-1 px-1">
            <h1 className="text-2xl font-semibold">Tutorials</h1>
            <p className="text-sm text-muted-foreground">
              Short videos of Roam Publish&apos;s main features. New here? Start with{" "}
              <Link href="/setup" className="text-link hover:underline">
                Setting it up
              </Link>
              .
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {TUTORIALS.map((t) => (
              <section
                key={t.id}
                id={t.id}
                aria-labelledby={`${t.id}-title`}
                className="flex scroll-mt-16 flex-col overflow-hidden rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)]"
              >
                <Video t={t} />
                <div className="flex flex-col gap-2 p-5">
                  <div className="flex flex-wrap gap-1.5">
                    {t.where.map((w) => (
                      <span key={w} className={cn("rounded-4xl px-2 text-xs font-medium whitespace-nowrap", CHIP[w])}>
                        {TUTORIAL_SOURCE_LABEL[w]}
                      </span>
                    ))}
                  </div>
                  <h2 id={`${t.id}-title`} className="text-base font-semibold">
                    <a href={`#${t.id}`} className="hover:underline">
                      {t.title}
                    </a>
                  </h2>
                  <p className="text-sm text-muted-foreground">{t.summary}</p>
                  <ol className="mt-1 flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
                    {t.steps.map((s, i) => (
                      <li key={i}>
                        <StepText text={s} />
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
