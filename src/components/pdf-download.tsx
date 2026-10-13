"use client";

import { FileDownIcon, LockIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { flushSync } from "react-dom";
import { PdfStyleControls } from "@/components/manage/pdf-fields";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { type PdfFolds, type PdfStyle, pdfPageCss } from "@/lib/pdf";

/** What a page that offers Download PDF hands its masthead and button. */
export type PdfOffer = {
  /** Its graph's or collection's style; readers may change it unless `enforced`. */
  style: PdfStyle;
  /** "roam.pub/notes/abc", for the footer of every sheet. */
  link: string;
  /** The graph or collection it's read in, for the masthead. */
  source: string;
  /** Password or Members here: the copy says it isn't protected any more. */
  protected: boolean;
  /** "Oct 9, 2026". */
  updated: string;
  /** The byline's name, when the page shows one. */
  author?: string;
};

const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const PAGE_STYLE_ID = "pdf-page-style";

/** iPhone or iPad, where printing has no Save as PDF destination. iPadOS reports itself as a Mac. */
const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Puts a style on <html> for printing: the data-pdf-* choices the print stylesheet reads
 * (globals.css), and the @page rules for paper and the footer.
 */
function applyStyle(style: PdfStyle, link: string, folds: PdfFolds) {
  const html = document.documentElement;
  html.dataset.pdf = "";
  html.dataset.pdfFont = style.font;
  html.dataset.pdfSize = style.size;
  html.dataset.pdfThreads = style.threads ? "on" : "off";
  html.dataset.pdfAuthor = style.author ? "on" : "off";
  html.dataset.pdfTags = style.tags ? "on" : "off";
  html.dataset.pdfDownloaded = style.downloaded ? "on" : "off";
  html.dataset.pdfFolds = folds;
  let el = document.getElementById(PAGE_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = PAGE_STYLE_ID;
    document.head.append(el);
  }
  el.textContent = `@media print { ${pdfPageCss(style, link)} }`;
}

function clearStyle() {
  const html = document.documentElement;
  for (const key of Object.keys(html.dataset)) if (key.startsWith("pdf")) delete html.dataset[key];
  document.getElementById(PAGE_STYLE_ID)?.remove();
}

/** The page's title as the reader sees it (decrypted, for an encrypted page), for the PDF's file name. */
function shownTitle() {
  const h1 = document.querySelector("[data-pdf-article] > h1");
  if (!h1) return null;
  const copy = h1.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("[data-pdf-skip]").forEach((e) => e.remove());
  return copy.textContent?.trim() || null;
}

/**
 * The print-only masthead around the page's own title: where it's from, a line of facts and, for a
 * protected page, a note that the copy isn't. Also gives the page its print layout while it's shown,
 * so the browser's own Print uses it too. Direct children of the article, which orders them in print.
 */
export function PdfMasthead({ offer }: { offer: PdfOffer }) {
  const [downloaded, setDownloaded] = useState(today);
  useEffect(() => {
    applyStyle(offer.style, offer.link, "expanded");
    // Dated again as printing starts, in case the page stayed open past midnight.
    const stamp = () => flushSync(() => setDownloaded(today()));
    window.addEventListener("beforeprint", stamp);
    return () => {
      window.removeEventListener("beforeprint", stamp);
      clearStyle();
    };
  }, [offer.style, offer.link]);

  const facts = [
    offer.author && { key: "author", text: `By ${offer.author}` },
    { key: "updated", text: `Updated ${offer.updated}` },
    { key: "downloaded", text: `Downloaded ${downloaded}` },
  ].filter((f): f is { key: string; text: string } => !!f);
  return (
    <>
      <p data-pdf-eyebrow className="hidden items-center gap-[5pt] pdf:flex mb-[6pt] text-[8pt] text-[#738091]">
        {offer.protected && <LockIcon aria-hidden className="size-[9pt]" />}
        roam.pub · {offer.source}
      </p>
      <p data-pdf-meta className="hidden pdf:block mb-[4pt] text-[8.5pt] text-muted-foreground">
        {facts.map((f, i) => (
          // The server's date can differ from the reader's around midnight.
          <span key={f.key} {...{ [`data-pdf-${f.key}`]: "" }} suppressHydrationWarning>
            {i > 0 && <span className="mx-[5pt] text-[#738091]">·</span>}
            {f.text}
          </span>
        ))}
      </p>
      <hr data-pdf-rule className="hidden pdf:block mb-[14pt] border-0 border-t-[0.75pt] border-border" />
      {offer.protected && (
        <p
          data-pdf-note
          className="hidden pdf:block mb-[14pt] border-l-2 border-[#c5cbd3] bg-muted px-[8pt] py-[5pt] text-[8pt] text-muted-foreground"
        >
          This page is protected on roam.pub. This copy isn&apos;t: anyone you send it to can read it.
        </p>
      )}
    </>
  );
}

const FOLD_OPTIONS: Segment<PdfFolds>[] = [
  { value: "expanded", label: "All blocks expanded" },
  { value: "as-shown", label: "As shown" },
];

/**
 * Download PDF in the page's toolbar: how folded blocks print and, unless the owner enforces their
 * style, how the PDF looks; then the browser's print dialog, where the reader saves it as a PDF.
 */
export function PdfDownloadButton({ offer }: { offer: PdfOffer }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [folds, setFolds] = useState<PdfFolds>("expanded");
  const [style, setStyle] = useState(offer.style);

  function download() {
    setOpen(false);
    const chosen = offer.style.enforced ? offer.style : style;
    applyStyle(chosen, offer.link, folds);
    const title = document.title;
    const shown = shownTitle();
    if (shown) document.title = shown;
    // Back to the owner's style for the browser's own Print once the dialog closes. iOS returns from
    // print() while its sheet is still open, so this can't run right after it.
    window.addEventListener(
      "afterprint",
      () => {
        document.title = title;
        applyStyle(offer.style, offer.link, "expanded");
      },
      { once: true },
    );
    // Right away, inside the tap: iOS Safari ignores print() once the gesture has passed. The
    // popover needn't close first, since the print layout leaves out everything outside <main>.
    window.print();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground max-sm:px-1.5" title="Download PDF">
            <FileDownIcon />
            <span className="max-sm:sr-only">Download PDF</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <span id={`${id}-folds`} className="text-xs font-medium text-muted-foreground">
            Folded blocks
          </span>
          <SegmentedControl aria-labelledby={`${id}-folds`} value={folds} options={FOLD_OPTIONS} onChange={setFolds} />
        </div>
        {!offer.style.enforced && <PdfStyleControls style={style} onChange={setStyle} compact />}
        <Button onClick={download} className="w-full">
          <FileDownIcon />
          Download PDF
        </Button>
        {/* Only rendered once opened, so only in the browser. */}
        <p className="-mt-2 text-xs text-muted-foreground">
          {isIOS()
            ? "In the print options, tap Share, then Save to Files."
            : "In the print dialog, choose Save as PDF as the destination."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
